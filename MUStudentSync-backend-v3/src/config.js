require('dotenv').config();
const { buildSsl } = require('./dbssl');

function need(key) {
  const v = process.env[key];
  if (v === undefined || v === '') {
    throw new Error(`Missing environment variable ${key} (see .env.example)`);
  }
  return v;
}

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  requireHttps: process.env.REQUIRE_HTTPS === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  jwtSecret: need('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  db: {
    host: need('DB_HOST'),
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: need('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: need('DB_NAME'),
    ssl: buildSsl(),
  },
};
