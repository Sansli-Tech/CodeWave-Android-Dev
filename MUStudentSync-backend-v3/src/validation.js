const { ApiError } = require('./errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Letters (incl. accented), combining marks, spaces and ordinary name punctuation.
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.,-]*$/u;

function bad(field, message) {
  return new ApiError(400, 'VALIDATION_ERROR', message, { field });
}

function validateName(v, field = 'student_name') {
  if (typeof v !== 'string') throw bad(field, 'Name is required.');
  const t = v.trim();
  const len = [...t].length;
  if (len < 2 || len > 100) throw bad(field, 'Name must be 2-100 characters.');
  if (!NAME_RE.test(t)) throw bad(field, 'Name contains characters that are not allowed.');
  return t;
}

// Nine digits, outer whitespace trimmed, leading zeros kept (it is a string), no inner spaces.
function validateStudentNumber(v, field = 'student_number') {
  if (typeof v !== 'string') throw bad(field, 'Student number is required.');
  const t = v.trim();
  if (!/^\d{9}$/.test(t)) throw bad(field, 'Student number must be exactly 9 digits.');
  return t;
}

function validateProgramme(v, field = 'programme_code') {
  if (typeof v !== 'string' || !/^[A-Z]{2,4}$/.test(v.trim().toUpperCase())) {
    throw bad(field, 'Choose a programme.');
  }
  return v.trim().toUpperCase();
}

// undefined -> not supplied; null / '' / 'UNASSIGNED' -> null (Unassigned); 'G01'.. -> code.
function validateGroup(v, field = 'group_code') {
  if (v === undefined) return undefined;
  if (v === null || v === '' || v === 'UNASSIGNED') return null;
  if (typeof v !== 'string' || !/^G\d{2}$/.test(v.trim().toUpperCase())) {
    throw bad(field, 'Group must be G01-G04 or Unassigned.');
  }
  return v.trim().toUpperCase();
}

function validateBaseVersion(v, field = 'base_version') {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? parseInt(v, 10) : v;
  if (!Number.isInteger(n) || n < 1) throw bad(field, 'base_version must be a positive integer.');
  return n;
}

function validateUuid(v, field) {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw bad(field, `${field} must be a UUID.`);
  return v.toLowerCase();
}

function validatePassword(v) {
  if (typeof v !== 'string' || v.length < 8 || Buffer.byteLength(v) > 72) {
    throw bad('password', 'Password must be 8-72 characters.');
  }
  return v;
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}

module.exports = {
  UUID_RE, validateName, validateStudentNumber, validateProgramme, validateGroup,
  validateBaseVersion, validateUuid, validatePassword, escapeLike,
};

// ---- lecturer registration helpers ----
function validateEmail(v, field = 'staff_email') {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (t.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) throw bad(field, 'Enter a valid staff email address.');
  return t;
}
function validateStaffId(v, field = 'staff_id') {
  const t = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!/^[A-Z0-9][A-Z0-9._\/-]{1,29}$/.test(t)) throw bad(field, 'Staff ID must be 2-30 letters, digits or . _ / -');
  return t;
}
function validateCode(v, field) {
  const t = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!/^[A-Z]{2,8}$/.test(t)) throw bad(field, `Choose a valid ${field.replace('_code', '')}.`);
  return t;
}
function validateFacultyToken(v, field = 'faculty_token') {
  const t = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (t.length < 6 || t.length > 64) throw bad(field, 'Faculty authorization token is required.');
  return t;
}
Object.assign(module.exports, { validateEmail, validateStaffId, validateCode, validateFacultyToken });
