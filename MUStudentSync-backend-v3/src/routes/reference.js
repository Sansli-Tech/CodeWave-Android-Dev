// Reference lists that fill the dropdowns, and group occupancy.
const router = require('express').Router();
const { pool } = require('../db');
const { ah } = require('../errors');
const { requireAuth } = require('../auth');

// PUBLIC: the registration screens need these before anyone is signed in. No personal data here.
router.get('/reference', ah(async (req, res) => {
  const [schools] = await pool.query('SELECT school_code, school_name FROM schools ORDER BY school_name');
  const [departments] = await pool.query('SELECT department_code, school_code, department_name FROM departments ORDER BY department_name');
  const [programmes] = await pool.query('SELECT programme_code, school_code, programme_name FROM programmes ORDER BY school_code, programme_name');
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    schools: schools.map((s) => ({ ...s, departments: departments.filter((d) => d.school_code === s.school_code) })),
    programmes,
  });
}));

// Signed-in users (either role): occupancy NUMBERS only, so the Editor can show "(FULL - 15/15)"
// and a student can see whether a group has room. No student names are exposed here.
router.get('/groups', requireAuth, ah(async (req, res) => {
  const [groups] = await pool.query(
    `SELECT g.group_code, g.capacity, COUNT(s.student_id) AS occupancy
       FROM lab_groups g
       LEFT JOIN students s ON s.group_code = g.group_code AND s.is_deleted = 0
      GROUP BY g.group_code, g.capacity ORDER BY g.group_code`);
  const out = { groups };
  if (req.account.role === 'lecturer') {
    const [u] = await pool.query('SELECT COUNT(*) AS n FROM students WHERE group_code IS NULL AND is_deleted = 0');
    out.unassigned = u[0].n;
  }
  res.json(out);
}));

module.exports = router;
