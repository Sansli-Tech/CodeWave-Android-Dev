// TLS settings for a HOSTED database (Aiven, etc. require an encrypted connection).
// Local MySQL on your own computer: leave DB_SSL unset and this returns undefined (no TLS).
const fs = require('fs');

function buildSsl(env = process.env) {
  if (env.DB_SSL !== 'true') return undefined;

  // The provider's CA certificate: paste it into DB_SSL_CA (real newlines or the two characters \n),
  // or point DB_SSL_CA_FILE at a file that holds it.
  let ca = env.DB_SSL_CA ? env.DB_SSL_CA.replace(/\\n/g, '\n') : null;
  if (!ca && env.DB_SSL_CA_FILE) ca = fs.readFileSync(env.DB_SSL_CA_FILE, 'utf8');

  if (ca) return { ca, rejectUnauthorized: true };       // encrypted AND the server's identity is verified
  console.warn('WARNING: DB_SSL=true but no DB_SSL_CA given: the connection is encrypted, but the database server\'s identity is NOT verified.');
  return { rejectUnauthorized: false };
}

module.exports = { buildSsl };
