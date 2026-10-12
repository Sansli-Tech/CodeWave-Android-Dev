/**
 * Smoke test of the main API rules. Wipes student data - TEST database only (ALLOW_TEST_RESET=true).
 * Usage: npm run test:smoke
 */
const crypto = require('crypto');
const { pool } = require('../src/db');
const BASE = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}
async function call(method, path, token, body, key) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method !== 'GET' && token ? { 'Idempotency-Key': key || crypto.randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, replay: res.headers.get('idempotent-replay'), body: await res.json() };
}
const code = (r) => r.body && r.body.error && r.body.error.code;

(async () => {
  if (process.env.ALLOW_TEST_RESET !== 'true') { console.error('Set ALLOW_TEST_RESET=true (test DB only).'); process.exit(1); }
  await pool.query('DELETE FROM operation_receipts'); await pool.query('DELETE FROM change_log');
  await pool.query('DELETE FROM change_requests'); await pool.query("DELETE FROM accounts WHERE role = 'student'");
  await pool.query('DELETE FROM students'); await pool.query('UPDATE student_claim_codes SET claimed_at = NULL');
  await pool.query("DELETE FROM lecturers WHERE staff_id LIKE 'SMOKE-%'");
  await pool.query("DELETE FROM accounts WHERE login_id LIKE 'smoke.%'");
  await pool.query("DELETE FROM faculty_tokens WHERE label LIKE 'SMOKE%'");

  const lec = (await call('POST', '/api/auth/login', null, { login_id: process.env.LECTURER_EMAIL || process.env.LECTURER_LOGIN || 'lecturer01@mu.example', password: process.env.LECTURER_PASSWORD })).body;
  const L = lec.token;
  console.log('Validation and duplicates');
  const created = await call('POST', '/api/students', L, { student_number: ' 100000001 ', student_name: 'Zoë O’Brien-Phiri', programme_code: 'CS' });
  check('lecturer creates student (trims number, accepts accents/punctuation)', created.status === 201 && created.body.student.student_number === '100000001');
  const s1 = created.body.student;
  check('duplicate student number rejected', code(await call('POST', '/api/students', L, { student_number: '100000001', student_name: 'Other Person', programme_code: 'IT' })) === 'DUPLICATE_STUDENT_NUMBER');
  check('8-digit number rejected', code(await call('POST', '/api/students', L, { student_number: '12345678', student_name: 'Valid Name', programme_code: 'IT' })) === 'VALIDATION_ERROR');
  check('embedded space rejected', code(await call('POST', '/api/students', L, { student_number: '1234 5678', student_name: 'Valid Name', programme_code: 'IT' })) === 'VALIDATION_ERROR');
  check('1-char name rejected', code(await call('POST', '/api/students', L, { student_number: '100000009', student_name: 'A', programme_code: 'IT' })) === 'VALIDATION_ERROR');
  check('leading zeros preserved', (await call('POST', '/api/students', L, { student_number: '000000123', student_name: 'Leading Zeros', programme_code: 'STA' })).body.student.student_number === '000000123');

  console.log('Registration links to the lecturer-entered profile');
  check('wrong claim code rejected', code(await call('POST', '/api/auth/register', null, { student_number: '100000001', claim_code: 'WRONG', password: 'Password#1' })) === 'INVALID_CLAIM');
  const reg = await call('POST', '/api/auth/register', null, { student_number: '100000001', claim_code: 'CLAIM-0001', password: 'Password#1' });
  check('registration links existing profile (no second profile)', reg.status === 201 && reg.body.linked_existing_profile === true && reg.body.student.student_id === s1.student_id);
  check('claim code cannot be reused', code(await call('POST', '/api/auth/register', null, { student_number: '100000001', claim_code: 'CLAIM-0001', password: 'Password#1' })) === 'INVALID_CLAIM');
  const [[{ n: profiles }]] = await pool.query("SELECT COUNT(*) AS n FROM students WHERE student_number = '100000001'");
  check('only one profile for that number', profiles === 1);
  const reg2 = await call('POST', '/api/auth/register', null, { student_number: '100000002', claim_code: 'CLAIM-0002', password: 'Password#1', student_name: 'New Student', programme_code: 'IT' });
  check('registration creates a profile when none exists (Unassigned)', reg2.status === 201 && reg2.body.linked_existing_profile === false && reg2.body.student.group_code === null);

  console.log('Roles and ownership');
  const S = reg.body.token;
  check('student reads own profile', (await call('GET', '/api/me/student', S)).body.student.student_id === s1.student_id);
  check('student cannot list roster', (await call('GET', '/api/students', S)).status === 403);
  check('student cannot read another student by id', (await call('GET', `/api/students/${reg2.body.student.student_id}`, S)).status === 403);
  check('student cannot change number/group via profile edit', code(await call('PATCH', '/api/me/student', S, { student_number: '999999999', base_version: 1 })) === 'FIELD_NOT_PERMITTED');
  check('no token => 401', (await call('GET', '/api/students', null)).status === 401);
  const ed = await call('PATCH', '/api/me/student', S, { student_name: 'Zoe Phiri', base_version: s1.version });
  check('student edits own name', ed.status === 200 && ed.body.student.version === s1.version + 1);

  console.log('Idempotent retries (Challenge 2 rule)');
  const key = crypto.randomUUID();
  const body = { programme_code: 'IT', base_version: ed.body.student.version };
  const a = await call('PATCH', `/api/students/${s1.student_id}`, L, body, key);
  const b = await call('PATCH', `/api/students/${s1.student_id}`, L, body, key);
  check('first request applied', a.status === 200 && a.body.student.version === ed.body.student.version + 1);
  check('retry replays stored result', b.status === 200 && b.replay === 'true' && JSON.stringify(a.body) === JSON.stringify(b.body));
  const [[{ v }]] = await pool.query('SELECT version AS v FROM students WHERE student_id = ?', [s1.student_id]);
  check('change applied exactly once (version bumped once)', v === a.body.student.version);
  check('same operation id + different content rejected', code(await call('PATCH', `/api/students/${s1.student_id}`, L, { programme_code: 'STA', base_version: ed.body.student.version }, key)) === 'OPERATION_ID_REUSED');

  console.log('Conflicts');
  const stale = await call('PATCH', `/api/students/${s1.student_id}`, L, { student_name: 'Stale Edit', base_version: 1 });
  check('stale edit => VERSION_CONFLICT with current record', stale.status === 409 && code(stale) === 'VERSION_CONFLICT' && stale.body.error.details.current.student_id === s1.student_id);

  console.log('Groups, deletion and no resurrection');
  const cur = a.body.student;
  const asg = await call('PATCH', `/api/students/${s1.student_id}`, L, { group_code: 'G02', base_version: cur.version });
  check('lecturer assigns group', asg.status === 200 && asg.body.student.group_code === 'G02');
  const occ = async () => (await call('GET', '/api/groups', L)).body.groups.find((g) => g.group_code === 'G02').occupancy;
  check('G02 occupancy is 1', (await occ()) === 1);
  const d1 = await call('DELETE', `/api/students/${s1.student_id}`, L);
  check('delete succeeds', d1.status === 200 && d1.body.already_deleted === false);
  const lecAcc = (await call('GET', '/api/auth/me', L)).body.account_id;
  const [[delRow]] = await pool.query('SELECT deleted_by FROM students WHERE student_id = ?', [s1.student_id]);
  check('deletion records which lecturer deleted it', delRow.deleted_by === lecAcc);
  const d2 = await call('DELETE', `/api/students/${s1.student_id}`, L);
  check('repeated delete is a no-op', d2.status === 200 && d2.body.already_deleted === true);
  check('place released exactly once (G02 occupancy 0)', (await occ()) === 0);
  check('stale offline edit cannot resurrect deleted student', (await call('PATCH', `/api/students/${s1.student_id}`, L, { student_name: 'Zombie', base_version: cur.version })).status === 410);
  check('deleted number stays reserved', code(await call('POST', '/api/students', L, { student_number: '100000001', student_name: 'Re Register', programme_code: 'CS' })) === 'STUDENT_NUMBER_RESERVED');
  check('deleted student account disabled', (await call('GET', '/api/me/student', S)).status === 403);
  const feed = await call('GET', '/api/sync/changes?since=0', L);
  check('sync feed carries the deletion marker', feed.body.items.some((i) => i.student_id === s1.student_id && i.is_deleted === true));

  console.log('Search and filters');
  const list = await call('GET', '/api/students?search=new&programme=IT&group=UNASSIGNED', L);
  check('combined search + programme + Unassigned filter', list.status === 200 && list.body.items.length === 1 && list.body.items[0].student_name === 'New Student');
  check('invalid token (tampered) => 401', (await call('GET', '/api/students', L + 'x')).status === 401);


  console.log('Reference lists and group counts');
  const ref = await call('GET', '/api/reference', null);
  check('reference lists are public (7 schools, 18 departments, 21 programmes)',
    ref.status === 200 && ref.body.schools.length === 7 &&
    ref.body.schools.reduce((n, sc) => n + sc.departments.length, 0) === 18 && ref.body.programmes.length === 21);
  check('student can read group occupancy numbers', (await call('GET', '/api/groups', reg2.body.token)).status === 200);
  check('group occupancy needs sign-in', (await call('GET', '/api/groups', null)).status === 401);

  console.log('Lecturer registration (faculty token)');
  const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
  const mkToken = async (label, { school = null, max = 1, expired = false, revoked = false } = {}) => {
    const tok = 'FAC-' + crypto.randomBytes(5).toString('hex').toUpperCase();
    await pool.query(
      `INSERT INTO faculty_tokens (token_id, token_hash, label, school_code, max_uses, expires_at, revoked)
       VALUES (?, ?, ?, ?, ?, ${expired ? 'DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY)' : 'NULL'}, ?)`,
      [crypto.randomUUID(), sha(tok), label, school, max, revoked ? 1 : 0]);
    return tok;
  };
  const lecBody = (n, tok, extra = {}) => ({ full_name: 'Dr. Smoke Tester', staff_id: `SMOKE-${n}`,
    staff_email: `smoke.${n}@mu.example`, school_code: 'SET', department_code: 'CSIT',
    password: 'Lecturer#12', faculty_token: tok, ...extra });
  const regLec = (body) => call('POST', '/api/auth/register-lecturer', null, body);
  const uses = async (tok) => (await pool.query('SELECT use_count FROM faculty_tokens WHERE token_hash = ?', [sha(tok)]))[0][0].use_count;

  const t1 = await mkToken('SMOKE one-use');
  const l1 = await regLec(lecBody(1, t1.toLowerCase()));      // token typed in lower case: normalised
  check('valid token registers a lecturer', l1.status === 201 && l1.body.role === 'lecturer' && l1.body.lecturer.department_code === 'CSIT');
  const l1login = await call('POST', '/api/auth/login', null, { login_id: ' SMOKE.1@MU.EXAMPLE ', password: 'Lecturer#12' });
  check('lecturer signs in with email (any case) and gets profile', l1login.status === 200 && l1login.body.role === 'lecturer' && l1login.body.lecturer.staff_id === 'SMOKE-1');
  check('new lecturer can use the roster', (await call('GET', '/api/students', l1login.body.token)).status === 200);
  check('one-use token is now used up', code(await regLec(lecBody(2, t1))) === 'INVALID_FACULTY_TOKEN' && (await uses(t1)) === 1);
  check('unknown token rejected', code(await regLec(lecBody(3, 'FAC-NOTAREALTOKEN'))) === 'INVALID_FACULTY_TOKEN');

  const t2 = await mkToken('SMOKE multi', { max: 5 });
  check('department from another school rejected', code(await regLec(lecBody(4, t2, { department_code: 'SURG' }))) === 'INVALID_DEPARTMENT');
  check('failed registration does NOT use up the token', (await uses(t2)) === 0);
  check('duplicate staff email rejected', code(await regLec(lecBody(5, t2, { staff_email: 'smoke.1@mu.example' }))) === 'EMAIL_TAKEN');
  check('duplicate staff ID rejected', code(await regLec(lecBody(6, t2, { staff_id: 'smoke-1' }))) === 'STAFF_ID_TAKEN');
  check('short password rejected', code(await regLec(lecBody(7, t2, { password: 'short' }))) === 'VALIDATION_ERROR');
  check('invalid email rejected', code(await regLec(lecBody(8, t2, { staff_email: 'not-an-email' }))) === 'VALIDATION_ERROR');
  check('token still unused after all those failures', (await uses(t2)) === 0);

  const tSchool = await mkToken('SMOKE smhs-only', { school: 'SMHS', max: 5 });
  check('school-restricted token refused for another school', code(await regLec(lecBody(9, tSchool))) === 'INVALID_FACULTY_TOKEN');
  const lm = await regLec(lecBody(10, tSchool, { school_code: 'SMHS', department_code: 'SURG' }));
  check('school-restricted token works for its own school', lm.status === 201 && lm.body.lecturer.school_code === 'SMHS');
  check('expired token rejected', code(await regLec(lecBody(11, await mkToken('SMOKE expired', { expired: true })))) === 'INVALID_FACULTY_TOKEN');
  check('revoked token rejected', code(await regLec(lecBody(12, await mkToken('SMOKE revoked', { revoked: true })))) === 'INVALID_FACULTY_TOKEN');

  const tRace = await mkToken('SMOKE race', { max: 1 });
  const [r1, r2] = await Promise.all([regLec(lecBody(13, tRace)), regLec(lecBody(14, tRace))]);
  check('two people racing for a token\'s last use: exactly one wins',
    [r1, r2].filter((r) => r.status === 201).length === 1 && [r1, r2].filter((r) => code(r) === 'INVALID_FACULTY_TOKEN').length === 1);
  check('token use count is exactly 1 after the race', (await uses(tRace)) === 1);

  console.log('Student registration needs a password');
  check('student registration without password rejected', code(await call('POST', '/api/auth/register', null, { student_number: '100000003', claim_code: 'CLAIM-0003', student_name: 'No Password', programme_code: 'MBC' })) === 'VALIDATION_ERROR');
  const regMed = await call('POST', '/api/auth/register', null, { student_number: '100000003', claim_code: 'CLAIM-0003', password: 'Password#1', student_name: 'Med Student', programme_code: 'MBC' });
  check('student in another school registers with its programme code (starts Unassigned)', regMed.status === 201 && regMed.body.student.group_code === null && regMed.body.student.programme_code === 'MBC');

  console.log(`\n${passed} passed, ${failed} failed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
