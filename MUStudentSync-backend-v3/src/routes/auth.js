const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { pool, withTransaction } = require('../db');
const { ApiError, ah } = require('../errors');
const { signToken, requireAuth } = require('../auth');
const V = require('../validation');
const S = require('../studentService');

const ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', ROUNDS); // keeps login timing similar for unknown users
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false });

async function lecturerProfile(db, accountId) {
  const [r] = await db.query(
    `SELECT lecturer_id, full_name, staff_id, staff_email, school_code, department_code
       FROM lecturers WHERE account_id = ?`, [accountId]);
  return r[0] || null;
}

// ---------------------------------------------------------------------------
// Student registration = ownership check with a seeded claim code.
// If a lecturer already entered this student, the account is LINKED to that profile; no second profile.
// A brand-new student starts with NO group: the lecturer allocates it later.
// ---------------------------------------------------------------------------
router.post('/register', limiter, ah(async (req, res) => {
  const b = req.body || {};
  const studentNumber = V.validateStudentNumber(b.student_number);
  if (typeof b.claim_code !== 'string' || !b.claim_code.trim()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Claim code is required.', { field: 'claim_code' });
  }
  const password = V.validatePassword(b.password);

  // Slow bcrypt work happens BEFORE any database lock is taken.
  const [pre] = await pool.query('SELECT code_hash FROM student_claim_codes WHERE student_number = ?', [studentNumber]);
  const claimOk = await bcrypt.compare(b.claim_code.trim(), pre[0] ? pre[0].code_hash : DUMMY_HASH);
  const invalid = new ApiError(403, 'INVALID_CLAIM', 'Student number or claim code is not valid, or the code was already used.');
  if (!pre[0] || !claimOk) throw invalid;
  const passwordHash = await bcrypt.hash(password, ROUNDS);

  const result = await withTransaction(async (conn) => {
    const [claims] = await conn.query('SELECT claimed_at FROM student_claim_codes WHERE student_number = ? FOR UPDATE', [studentNumber]);
    if (!claims[0] || claims[0].claimed_at) throw invalid;

    const [rows] = await conn.query('SELECT * FROM students WHERE student_number = ? FOR UPDATE', [studentNumber]);
    let student = rows[0];
    let linked = false;
    if (student && student.is_deleted) {
      throw new ApiError(403, 'STUDENT_NUMBER_RESERVED', 'This student number is reserved. Contact your lecturer.');
    }
    if (student) {
      linked = true;
      student = S.dto(student);
    } else {
      student = await S.createStudent(conn, {
        student_number: studentNumber,
        student_name: V.validateName(b.student_name),
        programme_code: V.validateProgramme(b.programme_code),
        group_code: null,
      });
    }
    const account = { account_id: crypto.randomUUID(), role: 'student' };
    await conn.query(
      'INSERT INTO accounts (account_id, role, login_id, password_hash, student_id) VALUES (?, ?, ?, ?, ?)',
      [account.account_id, 'student', studentNumber, passwordHash, student.student_id]);
    await conn.query('UPDATE student_claim_codes SET claimed_at = CURRENT_TIMESTAMP(3) WHERE student_number = ?', [studentNumber]);
    return { token: signToken(account), role: 'student', student, linked_existing_profile: linked };
  });
  res.status(201).json(result);
}));

// ---------------------------------------------------------------------------
// Lecturer registration. The faculty authorization token is what authorises the account.
// Everything happens in ONE transaction: if anything fails, the token is NOT used up.
// The token row is locked, so two people racing for the last use cannot both succeed.
// ---------------------------------------------------------------------------
router.post('/register-lecturer', limiter, ah(async (req, res) => {
  const b = req.body || {};
  const fullName = V.validateName(b.full_name, 'full_name');
  const staffId = V.validateStaffId(b.staff_id);
  const email = V.validateEmail(b.staff_email);
  const schoolCode = V.validateCode(b.school_code, 'school_code');
  const departmentCode = V.validateCode(b.department_code, 'department_code');
  const password = V.validatePassword(b.password);
  const facultyToken = V.validateFacultyToken(b.faculty_token);

  const passwordHash = await bcrypt.hash(password, ROUNDS);
  const tokenHash = crypto.createHash('sha256').update(facultyToken).digest('hex');

  const result = await withTransaction(async (conn) => {
    const [tk] = await conn.query(
      `SELECT token_id, school_code, max_uses, use_count, revoked,
              (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP(3)) AS not_expired
         FROM faculty_tokens WHERE token_hash = ? FOR UPDATE`, [tokenHash]);
    const t = tk[0];
    const usable = t && !t.revoked && t.not_expired && t.use_count < t.max_uses
      && (!t.school_code || t.school_code === schoolCode);
    // One generic answer for unknown / revoked / expired / used-up / wrong-school tokens.
    if (!usable) throw new ApiError(403, 'INVALID_FACULTY_TOKEN', 'The faculty authorization token is not valid for this registration.');

    const [d] = await conn.query('SELECT 1 FROM departments WHERE department_code = ? AND school_code = ?', [departmentCode, schoolCode]);
    if (!d.length) throw new ApiError(400, 'INVALID_DEPARTMENT', 'That department does not belong to the chosen school.', { field: 'department_code' });

    const accountId = crypto.randomUUID();
    const lecturerId = crypto.randomUUID();
    try {
      await conn.query("INSERT INTO accounts (account_id, role, login_id, password_hash) VALUES (?, 'lecturer', ?, ?)",
        [accountId, email, passwordHash]);
      await conn.query(
        `INSERT INTO lecturers (lecturer_id, account_id, full_name, staff_id, staff_email, school_code, department_code)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [lecturerId, accountId, fullName, staffId, email, schoolCode, departmentCode]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        const msg = e.sqlMessage || '';
        if (/uq_lecturers_staff_id/.test(msg)) throw new ApiError(409, 'STAFF_ID_TAKEN', 'An account with that staff ID already exists.', { field: 'staff_id' });
        throw new ApiError(409, 'EMAIL_TAKEN', 'An account with that email already exists.', { field: 'staff_email' });
      }
      throw e;
    }
    await conn.query('UPDATE faculty_tokens SET use_count = use_count + 1 WHERE token_id = ?', [t.token_id]);
    return {
      token: signToken({ account_id: accountId, role: 'lecturer' }),
      role: 'lecturer',
      lecturer: { lecturer_id: lecturerId, full_name: fullName, staff_id: staffId, staff_email: email,
                  school_code: schoolCode, department_code: departmentCode },
    };
  });
  res.status(201).json(result);
}));

// Sign-In screen: one field for "Student Number or Email".
router.post('/login', limiter, ah(async (req, res) => {
  const b = req.body || {};
  if (typeof b.login_id !== 'string' || typeof b.password !== 'string' || !b.login_id.trim()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'login_id and password are required.');
  }
  let loginId = b.login_id.trim();
  if (loginId.includes('@')) loginId = loginId.toLowerCase();    // emails are case-insensitive
  const [rows] = await pool.query('SELECT * FROM accounts WHERE login_id = ?', [loginId]);
  const acc = rows[0];
  const ok = await bcrypt.compare(b.password, acc ? acc.password_hash : DUMMY_HASH);
  if (!acc || !ok) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong login or password.');
  if (acc.is_disabled) throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account is disabled.');

  const out = { token: signToken(acc), role: acc.role };
  if (acc.role === 'student') {
    const [s] = await pool.query('SELECT * FROM students WHERE student_id = ?', [acc.student_id]);
    out.student = s[0] ? S.dto(s[0]) : null;
  } else {
    out.lecturer = await lecturerProfile(pool, acc.account_id);
  }
  res.json(out);
}));

router.get('/me', requireAuth, ah(async (req, res) => {
  const { account_id, role, login_id, student_id } = req.account;
  const out = { account_id, role, login_id, student_id };
  if (role === 'lecturer') out.lecturer = await lecturerProfile(pool, account_id);
  res.json(out);
}));

module.exports = router;
