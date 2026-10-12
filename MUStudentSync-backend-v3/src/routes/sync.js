// Pull feed for the Android sync worker: authorised changes AND deletion markers after `since`.
// Lecturers get the whole roster feed; a student only ever gets their own record.
const router = require('express').Router();
const { pool } = require('../db');
const { ah } = require('../errors');
const { requireAuth } = require('../auth');
const S = require('../studentService');

router.get('/changes', requireAuth, ah(async (req, res) => {
  const since = Math.max(parseInt(req.query.since || '0', 10) || 0, 0);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '200', 10) || 200, 1), 500);
  const params = [since];
  let filter = '';
  if (req.account.role === 'student') {
    filter = 'WHERE s.student_id = ?';
    params.push(req.account.student_id);
  }
  params.push(limit);
  const [rows] = await pool.query(
    `SELECT s.*, c.seq
       FROM (SELECT student_id, MAX(seq) AS seq FROM change_log WHERE seq > ? GROUP BY student_id) c
       JOIN students s ON s.student_id = c.student_id
       ${filter}
      ORDER BY c.seq ASC LIMIT ?`, params);
  res.json({
    items: rows.map((r) => ({ ...S.dto(r), seq: Number(r.seq) })),
    next_since: rows.length ? Number(rows[rows.length - 1].seq) : since,
    has_more: rows.length === limit,
  });
}));

module.exports = router;
