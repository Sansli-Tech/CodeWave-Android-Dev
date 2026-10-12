// Lecturer-only routes. requireRole('lecturer') runs on the SERVER for every request:
// hiding buttons in the app is not security.
const router = require('express').Router();
const { pool } = require('../db');
const { ApiError, ah } = require('../errors');
const { requireAuth, requireRole } = require('../auth');
const { runOperation, send } = require('../idempotency');
const V = require('../validation');
const S = require('../studentService');

router.use(requireAuth, requireRole('lecturer'));

// Search + programme + group filters (all combinable), paginated. group=UNASSIGNED supported.
router.get('/students', ah(async (req, res) => {
  const q = req.query;
  const where = ['is_deleted = 0'];
  const params = [];
  if (typeof q.search === 'string' && q.search.trim()) {
    const s = V.escapeLike(q.search.trim().slice(0, 100));
    where.push('(student_name LIKE ? OR student_number LIKE ?)');
    params.push(`%${s}%`, `${s}%`);
  }
  if (typeof q.programme === 'string' && q.programme) {
    where.push('programme_code = ?'); params.push(V.validateProgramme(q.programme, 'programme'));
  }
  if (typeof q.group === 'string' && q.group) {
    const g = V.validateGroup(q.group, 'group');
    if (g === null) where.push('group_code IS NULL'); else { where.push('group_code = ?'); params.push(g); }
  }
  const page = Math.max(parseInt(q.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(q.page_size || '20', 10) || 20, 1), 50);
  const clause = where.join(' AND ');

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM students WHERE ${clause}`, params);
  const [rows] = await pool.query(
    `SELECT * FROM students WHERE ${clause} ORDER BY student_name, student_id LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]);
  res.json({ items: rows.map(S.dto), page, page_size: pageSize, total });
}));

router.get('/students/:id', ah(async (req, res) => {
  const id = V.validateUuid(req.params.id, 'id');
  const [rows] = await pool.query('SELECT * FROM students WHERE student_id = ?', [id]);
  if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Student not found.');
  res.json({ student: S.dto(rows[0]) });
}));

router.post('/students', ah(async (req, res) => {
  const b = req.body || {};
  const data = {
    student_id: b.student_id === undefined ? undefined : V.validateUuid(b.student_id, 'student_id'),
    student_number: V.validateStudentNumber(b.student_number),
    student_name: V.validateName(b.student_name),
    programme_code: V.validateProgramme(b.programme_code),
    group_code: V.validateGroup(b.group_code) || null,
  };
  const outcome = await runOperation(req, req.account.account_id, async (conn) => ({
    status: 201, body: { student: await S.createStudent(conn, data) },
  }));
  send(res, outcome);
}));

// Edit, correct student number, assign or transfer group: one endpoint, one version check.
router.patch('/students/:id', ah(async (req, res) => {
  const id = V.validateUuid(req.params.id, 'id');
  const b = req.body || {};
  const changes = {};
  if ('student_name' in b) changes.student_name = V.validateName(b.student_name);
  if ('programme_code' in b) changes.programme_code = V.validateProgramme(b.programme_code);
  if ('student_number' in b) changes.student_number = V.validateStudentNumber(b.student_number);
  if ('group_code' in b) changes.group_code = V.validateGroup(b.group_code);
  if (!Object.keys(changes).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Nothing to change.');
  const baseVersion = V.validateBaseVersion(b.base_version);

  const outcome = await runOperation(req, req.account.account_id, async (conn) => ({
    status: 200, body: { student: await S.updateStudent(conn, id, changes, baseVersion) },
  }));
  send(res, outcome);
}));

// Soft delete. base_version is optional here: deleting an already-deleted student is a safe no-op.
router.delete('/students/:id', ah(async (req, res) => {
  const id = V.validateUuid(req.params.id, 'id');
  const baseVersion = req.query.base_version === undefined ? undefined : V.validateBaseVersion(req.query.base_version);
  const outcome = await runOperation(req, req.account.account_id, async (conn) => ({
    status: 200, body: await S.softDeleteStudent(conn, id, baseVersion, req.account.account_id),
  }));
  send(res, outcome);
}));

// Student-number correction requests.
router.get('/correction-requests', ah(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.request_id, r.student_id, st.student_name, st.student_number AS current_number,
            r.requested_number, r.status, r.created_at
       FROM change_requests r JOIN students st ON st.student_id = r.student_id
      WHERE r.status = 'PENDING' ORDER BY r.created_at`);
  res.json({ items: rows });
}));

router.post('/correction-requests/:id/resolve', ah(async (req, res) => {
  const id = V.validateUuid(req.params.id, 'id');
  const decision = (req.body || {}).decision;
  if (decision !== 'APPROVE' && decision !== 'REJECT') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'decision must be APPROVE or REJECT.', { field: 'decision' });
  }
  const outcome = await runOperation(req, req.account.account_id, async (conn) => {
    const [rs] = await conn.query('SELECT * FROM change_requests WHERE request_id = ? FOR UPDATE', [id]);
    const r = rs[0];
    if (!r) throw new ApiError(404, 'NOT_FOUND', 'Request not found.');
    if (r.status !== 'PENDING') throw new ApiError(409, 'ALREADY_RESOLVED', 'This request was already resolved.');
    let student = null;
    if (decision === 'APPROVE') {
      const row = await S.lockStudent(conn, r.student_id);
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Student not found.');
      student = await S.updateStudent(conn, r.student_id, { student_number: r.requested_number }, row.version);
    }
    await conn.query('UPDATE change_requests SET status = ?, resolved_at = CURRENT_TIMESTAMP(3) WHERE request_id = ?',
      [decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', id]);
    return { status: 200, body: { request_id: id, status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', student } };
  });
  send(res, outcome);
}));

// Assign or transfer a student group while respecting the 15-member capacity limit (Challenge 1)
router.put('/students/:id/group', ah(async (req, res) => {
  const studentId = V.validateUuid(req.params.id, 'id');
  const b = req.body || {};
  const groupCode = b.group_code ? V.validateGroup(b.group_code) : null;
  const baseVersion = V.validateBaseVersion(b.base_version);

  const outcome = await runOperation(req, req.account.account_id, async (conn) => {
    const updated = await S.updateStudent(conn, studentId, { group_code: groupCode }, baseVersion);
    return { status: 200, body: { student: updated } };
  });

  send(res, outcome);
}));

module.exports = router;
