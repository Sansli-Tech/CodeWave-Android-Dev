const mysql = require('mysql2/promise');
const { db } = require('./config');

const pool = mysql.createPool({
  ...db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: 'Z',
  dateStrings: true,
});

// READ COMMITTED: a "count the group" query always sees every committed placement,
// never an old snapshot taken before we queued for the group lock.
async function begin(conn) {
  await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  await conn.beginTransaction();
}

const retryable = (e) => e && (e.code === 'ER_LOCK_DEADLOCK' || e.code === 'ER_LOCK_WAIT_TIMEOUT');

async function withRetry(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!retryable(e) || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 25 * i));
    }
  }
}

async function withTransaction(fn) {
  return withRetry(async () => {
    const conn = await pool.getConnection();
    try {
      await begin(conn);
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (e) {
      try { await conn.rollback(); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  });
}

module.exports = { pool, begin, withRetry, withTransaction };
