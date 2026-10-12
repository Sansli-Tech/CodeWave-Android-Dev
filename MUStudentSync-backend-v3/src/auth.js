const jwt = require('jsonwebtoken');
const config = require('./config');
const { pool } = require('./db');
const { ApiError, ah } = require('./errors');

function signToken(account) {
  return jwt.sign({ sub: account.account_id, role: account.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

// Checks identity on EVERY protected request: valid token + account still exists and is enabled.
// The role and the student_id are read from the database, never trusted from the request body.
const requireAuth = ah(async (req, res, next) => {
  const header = req.get('Authorization') || '';
  const m = /^Bearer (.+)$/.exec(header);
  if (!m) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required.');
  let payload;
  try {
    payload = jwt.verify(m[1], config.jwtSecret);
  } catch (e) {
    if (e.name === 'TokenExpiredError') throw new ApiError(401, 'SESSION_EXPIRED', 'Your session expired. Sign in again.');
    throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid token.');
  }
  const [rows] = await pool.query(
    'SELECT account_id, role, login_id, student_id, is_disabled FROM accounts WHERE account_id = ?',
    [payload.sub]
  );
  const acc = rows[0];
  if (!acc) throw new ApiError(401, 'UNAUTHENTICATED', 'Account not found.');
  if (acc.is_disabled) throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account is disabled.');
  req.account = acc;
  next();
});

const requireRole = (role) => (req, res, next) =>
  req.account && req.account.role === role
    ? next()
    : next(new ApiError(403, 'FORBIDDEN', 'You do not have permission for this action.'));

module.exports = { signToken, requireAuth, requireRole };
