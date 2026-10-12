// Seeds ONE lecturer, FICTITIOUS student claim codes and ONE faculty token. Safe to run twice.
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool, withTransaction } = require('../src/db');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

(async () => {
  // ---- Lecturer (signs in with the staff email, like the Sign-In screen) ----
  const email = (process.env.LECTURER_EMAIL || process.env.LECTURER_LOGIN || 'lecturer01@mu.example').trim().toLowerCase();
  const generated = !process.env.LECTURER_PASSWORD;
  const password = process.env.LECTURER_PASSWORD || crypto.randomBytes(9).toString('base64url');

  const [existing] = await pool.query('SELECT 1 FROM accounts WHERE login_id = ?', [email]);
  if (existing.length) {
    console.log(`Lecturer "${email}" already exists - left unchanged.`);
  } else {
    const accountId = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 12);
    await withTransaction(async (conn) => {
      await conn.query("INSERT INTO accounts (account_id, role, login_id, password_hash) VALUES (?, 'lecturer', ?, ?)",
        [accountId, email, hash]);
      await conn.query(
        `INSERT INTO lecturers (lecturer_id, account_id, full_name, staff_id, staff_email, school_code, department_code)
         VALUES (?, ?, 'Dr Seed Lecturer', 'STAFF-0001', ?, 'SET', 'CSIT')`,
        [crypto.randomUUID(), accountId, email]);
    });
    console.log(`Lecturer created.  email: ${email}   password: ${password}${generated ? '   (generated - note it now)' : ''}`);
  }

  // ---- Faculty authorization token (shown ONCE; only its SHA-256 is stored) ----
  const [tokens] = await pool.query('SELECT 1 FROM faculty_tokens LIMIT 1');
  if (tokens.length) {
    console.log('\nA faculty token already exists - not creating another.');
  } else {
    const token = 'FAC-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    await pool.query(
      'INSERT INTO faculty_tokens (token_id, token_hash, label, school_code, max_uses) VALUES (?, ?, ?, NULL, 5)',
      [crypto.randomUUID(), sha256(token), 'Seed token (dev) - 5 uses']);
    console.log(`\nFaculty authorization token (5 uses, any school): ${token}   <- note it now, it is not shown again`);
  }

  // ---- Fictitious student claim codes ----
  console.log('\nFictitious student claim codes (student_number -> claim code):');
  for (let i = 1; i <= 20; i++) {
    const number = String(100000000 + i);          // 100000001 .. 100000020
    const code = `CLAIM-${String(i).padStart(4, '0')}`;
    const [r] = await pool.query(
      'INSERT IGNORE INTO student_claim_codes (student_number, code_hash) VALUES (?, ?)',
      [number, await bcrypt.hash(code, 10)]);
    console.log(`  ${number} -> ${code}${r.affectedRows ? '' : '  (already seeded)'}`);
  }
  await pool.end();
})().catch((e) => { console.error('seed failed:', e.message); process.exit(1); });
