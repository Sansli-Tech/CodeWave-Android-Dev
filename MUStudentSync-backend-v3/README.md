# MU StudentSync - Node.js / MySQL server v3 (ICT361 Activity C)

Fictitious data only. No secrets in Git: `.env` is ignored.

## Setup
1. Install Node.js 18+ and MySQL 8 (or MariaDB 10.5+).
2. Create a database user, e.g. in the MySQL shell:
   `CREATE USER 'studentsync_app'@'localhost' IDENTIFIED BY 'a-strong-password';`
   `GRANT ALL ON studentsync.* TO 'studentsync_app'@'localhost';`
   (`npm run db:init` also creates the database, so that user needs `CREATE` on `studentsync` - or run `db/schema.sql` once as root.)
3. `npm install`
4. Copy `.env.example` to `.env` and fill in the DB password and a long random `JWT_SECRET`.
5. `npm run db:init` creates the tables, programmes (CS, IT, DS) and groups (G01-G04).
6. `npm run seed` creates the lecturer (`lecturer01@mu.example`, password printed once), a **faculty authorization token**
   (printed once, 5 uses, any school) and fictitious claim codes (`100000001` -> `CLAIM-0001` ... `100000020` -> `CLAIM-0020`).
   Use the token on the lecturer registration screen. Write it down: only its hash is stored.
7. `npm start` then open `http://localhost:3000/health`.

## Android connection
- Emulator -> `http://10.0.2.2:3000/api/` (Retrofit base URL). Plain HTTP needs a debug-only network security config.
- Real remote backend: **HTTPS only**. Deploy behind a TLS proxy (Render, Railway, nginx + Let's Encrypt) and set
  `TRUST_PROXY=true` and `REQUIRE_HTTPS=true`.
- Android never talks to MySQL directly - only to this API.

## Tests (use a TEST database: they wipe student data, so set `ALLOW_TEST_RESET=true`)
- `npm run test:smoke` - 57 checks: validation, duplicates, claim-code linking, lecturer registration + faculty tokens (incl. the last-use race), roles, retries, conflicts, delete/no-resurrection.
- `npm run test:challenge1` - 20 runs of two simultaneous requests for the last place in G01.

## Challenge 2 (the response disappears) - manual demo
1. Send a `POST /api/students` with a fixed `Idempotency-Key`; note the `201`.
2. Pretend the response was lost: send the exact same request again -> same body, header `Idempotent-Replay: true`.
3. Stop and restart the server (`npm start`) and send it a third time -> still the same replay.
4. Show in MySQL: `SELECT COUNT(*) FROM students WHERE student_number = '...';` is 1, and
   `SELECT * FROM operation_receipts WHERE operation_id = '...';` shows the stored result.
5. Reuse the key with different content -> `422 OPERATION_ID_REUSED`.

## Known limits (state them honestly in your report)
- Tokens are stateless JWTs (8 h). Logout is enforced on the phone; the server also re-checks the account on every request.
- The sync feed uses an auto-increment `seq`. Two transactions can commit out of order in rare cases; the Android app
  should re-pull with a small overlap (e.g. `since = last_seen - 5`) - applying a change twice is harmless because of `version`.

## Reference data
Schools, departments and programmes in `db/schema.sql` are copied from `RegisterLecturerActivity` and
`ProgramDropdownAdapter`. If you change a list in the app, change it in `schema.sql` too and re-run `npm run db:init`
(it updates names and never duplicates rows). The app should load them from `GET /api/reference`.

## Hosting (remote backend)
The lab requires HTTPS for the remote backend. Free option used here: **Aiven** (managed MySQL) + **Render** (the Node server).
1. Create the Aiven MySQL service, copy its host/port/user/password/database (Aiven calls the database `defaultdb`) and download `ca.pem`.
2. From your PC, in one PowerShell window, set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=defaultdb`,
   `DB_SSL=true`, `DB_SSL_CA_FILE=<path to ca.pem>`, `DB_CREATE_DATABASE=false` with `$env:NAME='value'`, then run
   `npm run db:init` and `npm run seed`. Close that window afterwards (never run the tests there: they wipe data).
3. On Render create a Web Service from your Git repo: build `npm install`, start `npm start`, and set the same `DB_*` variables
   (`DB_SSL_CA` = the text of ca.pem) plus a NEW `JWT_SECRET`, `TRUST_PROXY=true`, `REQUIRE_HTTPS=true`.
4. Open `https://<service>.onrender.com/health`. A free Render service sleeps after 15 minutes without traffic and needs about
   a minute to wake on the next request, so wake it before a demo.
5. In the app set `BASE_URL` to `https://<service>.onrender.com/api/`.
