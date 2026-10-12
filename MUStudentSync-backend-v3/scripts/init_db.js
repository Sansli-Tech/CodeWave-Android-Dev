// Runs db/schema.sql so you do not need the mysql command-line client.
//  Local MySQL (default): creates the database named in DB_NAME, then the tables.
//  Hosted MySQL (Aiven etc.): the database already exists, so set DB_CREATE_DATABASE=false and
//  DB_NAME to that existing name (Aiven calls it defaultdb). Also set DB_SSL=true (see src/dbssl.js).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { buildSsl } = require('../src/dbssl');

(async () => {
  const dbName = process.env.DB_NAME || 'studentsync';
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error('DB_NAME may only contain letters, digits and _');
  const createDb = process.env.DB_CREATE_DATABASE !== 'false';

  // schema.sql starts with CREATE DATABASE / USE for the local case; we handle those here instead.
  const sql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8')
    .replace(/^CREATE DATABASE .*;\s*$/m, '')
    .replace(/^USE .*;\s*$/m, '');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD || '',
    ssl: buildSsl(), multipleStatements: true,
    ...(createDb ? {} : { database: dbName }),
  });
  if (createDb) {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE \`${dbName}\`;`);
  }
  await conn.query(sql);
  console.log(`Database "${dbName}" initialised (schema + schools, departments, programmes, groups).`);
  await conn.end();
})().catch((e) => { console.error('init failed:', e.message); process.exit(1); });
