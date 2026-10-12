/**
 * Challenge 1 - two clients request the last place in G01.
 * Each run: reset fixture -> G01 has 14 members -> two lecturer requests fire at the same time
 * -> exactly one must succeed (200) and the other must get GROUP_FULL (409) -> DB count must be 15.
 *
 * Needs: server running, seeded lecturer, and ALLOW_TEST_RESET=true (it WIPES student data - use a TEST database).
 * Usage: LECTURER_LOGIN=lecturer01 LECTURER_PASSWORD=... ALLOW_TEST_RESET=true npm run test:challenge1
 */
const crypto = require('crypto');
const { pool } = require('../src/db');

const BASE = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const RUNS = parseInt(process.env.RUNS || '20', 10);

async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function reset() {
  await pool.query('DELETE FROM operation_receipts');
  await pool.query('DELETE FROM change_log');
  await pool.query('DELETE FROM change_requests');
  await pool.query("DELETE FROM accounts WHERE role = 'student'");
  await pool.query('DELETE FROM students');
}

(async () => {
  if (process.env.ALLOW_TEST_RESET !== 'true') {
    console.error('Refusing to run: this test wipes student data. Set ALLOW_TEST_RESET=true on a TEST database.');
    process.exit(1);
  }
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_id: process.env.LECTURER_EMAIL || process.env.LECTURER_LOGIN || 'lecturer01@mu.example', password: process.env.LECTURER_PASSWORD }),
  }).then((r) => r.json());
  if (!login.token) { console.error('Lecturer login failed:', login); process.exit(1); }
  const token = login.token;

  let failures = 0;
  console.log('run | request A | request B | G01 count in MySQL | result');
  for (let run = 1; run <= RUNS; run++) {
    await reset();
    for (let i = 1; i <= 14; i++) {
      const r = await api('POST', '/api/students', token,
        { student_number: String(200000000 + i), student_name: `Fixture Student ${String.fromCharCode(64 + i)}`, programme_code: 'CS', group_code: 'G01' });
      if (r.status !== 201) throw new Error('fixture failed: ' + JSON.stringify(r.body));
    }
    const a = (await api('POST', '/api/students', token, { student_number: '300000001', student_name: 'Candidate A', programme_code: 'IT' })).body.student;
    const b = (await api('POST', '/api/students', token, { student_number: '300000002', student_name: 'Candidate B', programme_code: 'STA' })).body.student;

    // Fired together, from two "clients" (two independent HTTP requests).
    const [ra, rb] = await Promise.all([
      api('PATCH', `/api/students/${a.student_id}`, token, { group_code: 'G01', base_version: a.version }),
      api('PATCH', `/api/students/${b.student_id}`, token, { group_code: 'G01', base_version: b.version }),
    ]);
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM students WHERE group_code = 'G01' AND is_deleted = 0");
    const codes = [ra, rb].map((r) => (r.status === 200 ? '200 OK' : `${r.status} ${r.body.error && r.body.error.code}`));
    const oneWin = [ra, rb].filter((r) => r.status === 200).length === 1;
    const oneFull = [ra, rb].filter((r) => r.status === 409 && r.body.error.code === 'GROUP_FULL').length === 1;
    const pass = oneWin && oneFull && n === 15;
    if (!pass) failures++;
    console.log(`${String(run).padStart(3)} | ${codes[0].padEnd(13)} | ${codes[1].padEnd(13)} | ${n}                 | ${pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(`\n${RUNS - failures}/${RUNS} runs passed. Final G01 count must be 15 in every run.`);
  await pool.end();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
