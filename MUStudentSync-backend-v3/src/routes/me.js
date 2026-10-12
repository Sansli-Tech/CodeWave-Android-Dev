// Student self-service. The student is ALWAYS taken from the signed-in account,
// never from an id in the request, so one student cannot reach another's record.
const router = require('express').Router();
const crypto = require('crypto');
const { pool } = require('../db');
const { ApiError, ah } = require('../errors');
const { requireAuth, requireRole } = require('../auth');
const { runOperation, send } = require('../idempotency');
const V = require('../validation');
const S = require('../studentService');

router.use(requireAuth, requireRole('student'));

async function profileWithGroup(conn, studentId) {
  const [rows] = await conn.query('SELECT * FROM students WHERE student_id = ?', [studentId]);
  const student = S.dto(rows[0]);
  let group = null;
  if (student.group_code) {
    const [g] = await conn.query(
      `SELECT g.group_code, g.capacity,
              (SELECT COUNT(*) FROM students s WHERE s.group_code = g.group_code AND s.is_deleted = 0) AS occupancy
         FROM lab_groups g WHERE g.group_code = ?`, [student.group_code]);
    group = g[0];
  }
  return { student, group };
}

router.get('/student', ah(async (req, res) => {
  res.json(await profileWithGroup(pool, req.account.student_id));
}));

// Students may edit only name and programme.
router.patch('/student', ah(async (req, res) => {
  const b = req.body || {};
  if ('student_number' in b || 'group_code' in b) {
    throw new ApiError(403, 'FIELD_NOT_PERMITTED', 'Students cannot change their student number or group here.');
  }
  const changes = {};
  if ('student_name' in b) changes.student_name = V.validateName(b.student_name);
  if ('programme_code' in b) changes.programme_code = V.validateProgramme(b.programme_code);
  if (!Object.keys(changes).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Nothing to change.');
  const baseVersion = V.validateBaseVersion(b.base_version);

  const outcome = await runOperation(req, req.account.account_id, async (conn) => ({
    status: 200,
    body: { student: await S.updateStudent(conn, req.account.student_id, changes, baseVersion) },
  }));
  send(res, outcome);
}));

// Group change request: succeeds only if there is room right now; otherwise GROUP_FULL
// and the student keeps the previous group (or stays Unassigned).
router.post('/group-request', ah(async (req, res) => {
  const b = req.body || {};
  const group = V.validateGroup(b.group_code);
  if (!group) throw new ApiError(400, 'VALIDATION_ERROR', 'Choose a group G01-G04.', { field: 'group_code' });
  const baseVersion = V.validateBaseVersion(b.base_version);

  const outcome = await runOperation(req, req.account.account_id, async (conn) => ({
    status: 200,
    body: { student: await S.updateStudent(conn, req.account.student_id, { group_code: group }, baseVersion) },
  }));
  send(res, outcome);
}));

// Ask a lecturer to correct the student number.
router.post('/correction-requests', ah(async (req, res) => {
  const requested = V.validateStudentNumber((req.body || {}).requested_student_number, 'requested_student_number');
  const outcome = await runOperation(req, req.account.account_id, async (conn) => {
    const id = crypto.randomUUID();
    await conn.query('INSERT INTO change_requests (request_id, student_id, requested_number) VALUES (?, ?, ?)',
      [id, req.account.student_id, requested]);
    return { status: 201, body: { request_id: id, status: 'PENDING', requested_student_number: requested } };
  });
  send(res, outcome);
}));

module.exports = router;
