const crypto = require('crypto');
const { pool, begin, withRetry } = require('./db');
const { ApiError } = require('./errors');
const { validateUuid } = require('./validation');

function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

function requestHash(req) {
  const { operation_id, ...content } = req.body || {};
  return crypto.createHash('sha256')
    .update(req.method + ' ' + req.originalUrl + ' ' + stable(content))
    .digest('hex');
}

function getOperationId(req) {
  const raw = (req.body && req.body.operation_id) || req.get('Idempotency-Key');
  return validateUuid(raw, 'operation_id');
}

/**
 * Runs `handler(conn)` exactly once per operation_id.
 *  - The receipt row is inserted FIRST, inside the same transaction as the mutation.
 *    A concurrent duplicate blocks on the primary key until we commit or roll back.
 *  - A business failure (GROUP_FULL, VERSION_CONFLICT, ...) rolls back only the handler's
 *    work (savepoint) and stores the error as the result, so a retry gets the same answer.
 *  - Unexpected errors roll everything back, including the receipt, so a retry can run again.
 *  - Same operation_id with different content (or another account) => 422 OPERATION_ID_REUSED.
 * handler returns { status, body }.
 */
async function runOperation(req, accountId, handler) {
  const opId = getOperationId(req);
  const hash = requestHash(req);

  return withRetry(async () => {
    const conn = await pool.getConnection();
    try {
      await begin(conn);
      try {
        await conn.query(
          'INSERT INTO operation_receipts (operation_id, account_id, request_hash, status_code) VALUES (?, ?, ?, 0)',
          [opId, accountId, hash]
        );
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY') throw e;
        await conn.rollback();
        const [rows] = await pool.query(
          'SELECT account_id, request_hash, status_code, response_body FROM operation_receipts WHERE operation_id = ?',
          [opId]
        );
        const r = rows[0];
        if (!r || r.account_id !== accountId || r.request_hash !== hash) {
          throw new ApiError(422, 'OPERATION_ID_REUSED', 'This operation ID was already used with different content.');
        }
        return { status: r.status_code, body: JSON.parse(r.response_body), replay: true };
      }

      await conn.query('SAVEPOINT op_start');
      let outcome;
      try {
        outcome = await handler(conn);
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        await conn.query('ROLLBACK TO SAVEPOINT op_start');
        outcome = { status: e.status, body: e.toBody() };
      }
      await conn.query(
        'UPDATE operation_receipts SET status_code = ?, response_body = ? WHERE operation_id = ?',
        [outcome.status, JSON.stringify(outcome.body), opId]
      );
      await conn.commit();
      return outcome;
    } catch (e) {
      try { await conn.rollback(); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  });
}

function send(res, outcome) {
  if (outcome.replay) res.set('Idempotent-Replay', 'true');
  res.status(outcome.status).json(outcome.body);
}

module.exports = { runOperation, send, getOperationId };
