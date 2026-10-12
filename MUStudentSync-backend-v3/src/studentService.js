const crypto = require('crypto');
const { ApiError } = require('./errors');

// What the API shows. A deleted student is only a marker (no name) so it can sync as a tombstone.
function dto(row) {
  if (row.is_deleted) {
    return {
      student_id: row.student_id, student_number: row.student_number,
      version: row.version, is_deleted: true, deleted_at: row.deleted_at,
    };
  }
  return {
    student_id: row.student_id, student_number: row.student_number,
    student_name: row.student_name, programme_code: row.programme_code,
    group_code: row.group_code, version: row.version, is_deleted: false,
    updated_at: row.updated_at,
  };
}

async function lockStudent(conn, id) {
  const [r] = await conn.query('SELECT * FROM students WHERE student_id = ? FOR UPDATE', [id]);
  return r[0] || null;
}

/**
 * CAPACITY RULE (Challenge 1). Every path that can ADD a student to a group
 * (create, assign, transfer, student request) takes this lock FIRST.
 * Locking the group row serialises those requests: the second one waits, then counts
 * the committed rows, sees 15, and gets GROUP_FULL. Counting in Android, or doing
 * "SELECT COUNT" and "UPDATE" as separate unprotected steps, lets two clients both read 14.
 * Deletion only ever lowers the count, so it needs no group lock.
 */
async function lockGroup(conn, code) {
  const [r] = await conn.query('SELECT group_code, capacity FROM lab_groups WHERE group_code = ? FOR UPDATE', [code]);
  if (!r.length) throw new ApiError(400, 'INVALID_GROUP', 'That lab group does not exist.', { field: 'group_code' });
  return r[0];
}

async function assertRoom(conn, group) {
  const [c] = await conn.query(
    'SELECT COUNT(*) AS n FROM students WHERE group_code = ? AND is_deleted = 0', [group.group_code]);
  if (c[0].n >= group.capacity) {
    throw new ApiError(409, 'GROUP_FULL', `Group ${group.group_code} is full.`,
      { group_code: group.group_code, capacity: group.capacity, occupancy: c[0].n });
  }
}

async function assertProgramme(conn, code) {
  const [r] = await conn.query('SELECT 1 FROM programmes WHERE programme_code = ?', [code]);
  if (!r.length) throw new ApiError(400, 'INVALID_PROGRAMME', 'That programme does not exist.', { field: 'programme_code' });
}

async function logChange(conn, studentId, type) {
  await conn.query('INSERT INTO change_log (student_id, change_type) VALUES (?, ?)', [studentId, type]);
}

async function translateDuplicate(conn, e, studentNumber) {
  if (e.code === 'ER_DUP_ENTRY') {
    if (/uq_students_number/.test(e.sqlMessage || '')) {
      const [r] = await conn.query('SELECT is_deleted FROM students WHERE student_number = ?', [studentNumber]);
      if (r[0] && r[0].is_deleted) {
        throw new ApiError(409, 'STUDENT_NUMBER_RESERVED', 'That student number belongs to a deleted record and stays reserved.', { field: 'student_number' });
      }
      throw new ApiError(409, 'DUPLICATE_STUDENT_NUMBER', 'A student with that number already exists.', { field: 'student_number' });
    }
    throw new ApiError(409, 'DUPLICATE_STUDENT_ID', 'That student_id already exists.');
  }
  throw e;
}

async function createStudent(conn, { student_id, student_number, student_name, programme_code, group_code }) {
  await assertProgramme(conn, programme_code);
  if (group_code) {
    const group = await lockGroup(conn, group_code);   // lock BEFORE counting / inserting
    await assertRoom(conn, group);
  }
  const id = student_id || crypto.randomUUID();
  try {
    await conn.query(
      'INSERT INTO students (student_id, student_number, student_name, programme_code, group_code) VALUES (?, ?, ?, ?, ?)',
      [id, student_number, student_name, programme_code, group_code || null]);
  } catch (e) {
    await translateDuplicate(conn, e, student_number);
  }
  await logChange(conn, id, 'UPSERT');
  return dto(await lockStudent(conn, id));
}

/**
 * Optimistic concurrency: the caller must send the version it last saw.
 * Stale version => 409 VERSION_CONFLICT with the current server record (nothing is overwritten).
 * Deleted student => 410 STUDENT_DELETED (a stale offline edit can never resurrect a record).
 * Any failure leaves the previous group untouched (single UPDATE, inside the caller's transaction).
 */
async function updateStudent(conn, id, changes, baseVersion) {
  let group = null;
  if (changes.group_code) group = await lockGroup(conn, changes.group_code); // group lock first
  const row = await lockStudent(conn, id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Student not found.');
  if (row.is_deleted) throw new ApiError(410, 'STUDENT_DELETED', 'This student was deleted.', { current: dto(row) });
  if (row.version !== baseVersion) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'The record changed on the server. Review the current version.', { current: dto(row) });
  }

  const sets = [];
  const vals = [];
  if ('student_name' in changes && changes.student_name !== row.student_name) {
    sets.push('student_name = ?'); vals.push(changes.student_name);
  }
  if ('programme_code' in changes && changes.programme_code !== row.programme_code) {
    await assertProgramme(conn, changes.programme_code);
    sets.push('programme_code = ?'); vals.push(changes.programme_code);
  }
  if ('student_number' in changes && changes.student_number !== row.student_number) {
    sets.push('student_number = ?'); vals.push(changes.student_number);
  }
  if ('group_code' in changes && changes.group_code !== row.group_code) {
    if (changes.group_code) await assertRoom(conn, group);
    sets.push('group_code = ?'); vals.push(changes.group_code);
  }
  if (!sets.length) return dto(row);

  try {
    await conn.query(`UPDATE students SET ${sets.join(', ')}, version = version + 1 WHERE student_id = ?`, [...vals, id]);
  } catch (e) {
    await translateDuplicate(conn, e, changes.student_number);
  }
  await logChange(conn, id, 'UPSERT');
  return dto(await lockStudent(conn, id));
}

/** Soft delete: hide the record, release the place ONCE, disable the account, keep a marker. */
async function softDeleteStudent(conn, id, baseVersion, actorAccountId) {
  const row = await lockStudent(conn, id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Student not found.');
  if (row.is_deleted) return { student: dto(row), already_deleted: true };  // repeat delete frees nothing
  if (baseVersion !== undefined && row.version !== baseVersion) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'The record changed on the server. Review before deleting.', { current: dto(row) });
  }
  await conn.query(
    'UPDATE students SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP(3), deleted_by = ?, version = version + 1 WHERE student_id = ?',
    [actorAccountId || null, id]);
  await conn.query('UPDATE accounts SET is_disabled = 1 WHERE student_id = ?', [id]);
  await logChange(conn, id, 'DELETE');
  return { student: dto(await lockStudent(conn, id)), already_deleted: false };
}

module.exports = { dto, lockStudent, lockGroup, assertRoom, assertProgramme, createStudent, updateStudent, softDeleteStudent };
