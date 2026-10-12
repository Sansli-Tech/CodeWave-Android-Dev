-- MU StudentSync - database script v3 (MySQL 8 / MariaDB 10.5+, InnoDB)
-- Matches the Android screens: student register, lecturer register, sign-in,
-- student profile, lecturer roster, student editor.
--
-- Starting afresh?  In the MySQL shell run ONCE:   DROP DATABASE studentsync;
-- Then:  npm run db:init   (or: mysql -u root -p < db/schema.sql)

CREATE DATABASE IF NOT EXISTS studentsync CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE studentsync;

-- =====================================================================
-- 1. REFERENCE DATA (seeded below; the dropdowns come from these tables)
-- =====================================================================
CREATE TABLE IF NOT EXISTS schools (
  school_code VARCHAR(4)   NOT NULL PRIMARY KEY,
  school_name VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_school_name (school_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS departments (
  department_code VARCHAR(8)   NOT NULL PRIMARY KEY,
  school_code     VARCHAR(4)   NOT NULL,
  department_name VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_department_school (department_code, school_code),   -- target of lecturers' composite FK
  UNIQUE KEY uq_department_name (school_code, department_name),
  CONSTRAINT fk_departments_school FOREIGN KEY (school_code) REFERENCES schools (school_code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS programmes (
  programme_code VARCHAR(4)   NOT NULL PRIMARY KEY,
  school_code    VARCHAR(4)   NOT NULL,
  programme_name VARCHAR(100) NOT NULL,                              -- exactly the text in the dropdown
  UNIQUE KEY uq_programme_name (programme_name),
  CONSTRAINT fk_programmes_school FOREIGN KEY (school_code) REFERENCES schools (school_code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lab_groups (
  group_code VARCHAR(4)       NOT NULL PRIMARY KEY,
  capacity   TINYINT UNSIGNED NOT NULL DEFAULT 15,
  CONSTRAINT chk_group_capacity CHECK (capacity BETWEEN 1 AND 15)
) ENGINE=InnoDB;

-- =====================================================================
-- 2. STUDENTS
-- student_id is immutable and independent of student_number (a lecturer may correct the number).
-- student_number stays UNIQUE even for soft-deleted rows = the "reserved number" rule.
-- A new student has group_code NULL (Unassigned): the lecturer allocates the group later.
-- Group membership = group_code on an ACTIVE (is_deleted = 0) row, so one student = one group.
-- =====================================================================
CREATE TABLE IF NOT EXISTS students (
  student_id     CHAR(36)     NOT NULL PRIMARY KEY,
  student_number CHAR(9)      NOT NULL,
  student_name   VARCHAR(100) NOT NULL,
  programme_code VARCHAR(4)   NOT NULL,
  group_code     VARCHAR(4)   NULL,
  version        INT UNSIGNED NOT NULL DEFAULT 1,           -- +1 on every accepted change
  is_deleted     TINYINT(1)   NOT NULL DEFAULT 0,
  deleted_at     DATETIME(3)  NULL,
  deleted_by     CHAR(36)     NULL,                         -- account_id of the lecturer (audit only, no FK: avoids a students<->accounts cycle)
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_students_number (student_number),
  KEY idx_students_group_active (group_code, is_deleted),
  KEY idx_students_programme (programme_code),
  KEY idx_students_name (student_name),
  CONSTRAINT fk_students_programme FOREIGN KEY (programme_code) REFERENCES programmes (programme_code),
  CONSTRAINT fk_students_group     FOREIGN KEY (group_code)     REFERENCES lab_groups (group_code),
  CONSTRAINT chk_student_number    CHECK (student_number REGEXP '^[0-9]{9}$'),
  CONSTRAINT chk_deletion_marker   CHECK ((is_deleted = 0 AND deleted_at IS NULL AND deleted_by IS NULL)
                                       OR (is_deleted = 1 AND deleted_at IS NOT NULL))
) ENGINE=InnoDB;

-- =====================================================================
-- 3. ACCOUNTS (both roles sign in here)
-- login_id = the 9-digit student number for students, the lower-case staff email for lecturers
-- (the Sign-In screen takes either). Passwords are only ever stored as bcrypt hashes.
-- =====================================================================
CREATE TABLE IF NOT EXISTS accounts (
  account_id    CHAR(36)     NOT NULL PRIMARY KEY,
  role          ENUM('student','lecturer') NOT NULL,
  login_id      VARCHAR(254) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  student_id    CHAR(36)     NULL,
  is_disabled   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_accounts_login (login_id),
  UNIQUE KEY uq_accounts_student (student_id),               -- never two accounts for one student profile
  CONSTRAINT fk_accounts_student FOREIGN KEY (student_id) REFERENCES students (student_id),
  CONSTRAINT chk_account_role CHECK ((role = 'student' AND student_id IS NOT NULL)
                                  OR (role = 'lecturer' AND student_id IS NULL))
) ENGINE=InnoDB;

-- Lecturer registration screen: name, staff ID, staff email, school -> department, password, faculty token.
CREATE TABLE IF NOT EXISTS lecturers (
  lecturer_id     CHAR(36)     NOT NULL PRIMARY KEY,
  account_id      CHAR(36)     NOT NULL,
  full_name       VARCHAR(100) NOT NULL,
  staff_id        VARCHAR(30)  NOT NULL,
  staff_email     VARCHAR(254) NOT NULL,
  school_code     VARCHAR(4)   NOT NULL,
  department_code VARCHAR(8)   NOT NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_lecturers_account (account_id),
  UNIQUE KEY uq_lecturers_staff_id (staff_id),
  UNIQUE KEY uq_lecturers_email (staff_email),
  CONSTRAINT fk_lecturers_account FOREIGN KEY (account_id) REFERENCES accounts (account_id),
  -- composite FK: the department MUST belong to the chosen school
  CONSTRAINT fk_lecturers_department FOREIGN KEY (department_code, school_code)
      REFERENCES departments (department_code, school_code)
) ENGINE=InnoDB;

-- =====================================================================
-- 4. ONBOARDING CODES
-- =====================================================================
-- Student claim codes (seeded, fictitious): one per student number, stored hashed.
-- Registering proves you own that number; if a lecturer already entered the student,
-- the new account is linked to that existing profile (never a second profile).
CREATE TABLE IF NOT EXISTS student_claim_codes (
  student_number CHAR(9)      NOT NULL PRIMARY KEY,
  code_hash      VARCHAR(100) NOT NULL,
  claimed_at     DATETIME(3)  NULL
) ENGINE=InnoDB;

-- Faculty authorization tokens: the "Faculty Authorization Token" field on lecturer registration.
-- Random high-entropy tokens, stored as SHA-256 so they can be looked up. Limited uses, optional expiry,
-- optionally tied to one school. Revoke by setting revoked = 1.
CREATE TABLE IF NOT EXISTS faculty_tokens (
  token_id    CHAR(36)     NOT NULL PRIMARY KEY,
  token_hash  CHAR(64)     NOT NULL,
  label       VARCHAR(100) NOT NULL,
  school_code VARCHAR(4)   NULL,                              -- NULL = valid for any school
  max_uses    INT UNSIGNED NOT NULL DEFAULT 1,
  use_count   INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at  DATETIME(3)  NULL,
  revoked     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_faculty_token_hash (token_hash),
  CONSTRAINT fk_faculty_tokens_school FOREIGN KEY (school_code) REFERENCES schools (school_code),
  CONSTRAINT chk_token_uses CHECK (use_count <= max_uses)
) ENGINE=InnoDB;

-- Student asks a lecturer to correct their student number.
CREATE TABLE IF NOT EXISTS change_requests (
  request_id       CHAR(36)    NOT NULL PRIMARY KEY,
  student_id       CHAR(36)    NOT NULL,
  requested_number CHAR(9)     NOT NULL,
  status           ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at      DATETIME(3) NULL,
  KEY idx_change_requests_status (status),
  CONSTRAINT fk_change_requests_student FOREIGN KEY (student_id) REFERENCES students (student_id)
) ENGINE=InnoDB;

-- =====================================================================
-- 5. SYNC SUPPORT
-- =====================================================================
-- One row per mutation, written in the SAME transaction as the mutation itself. It survives a
-- server restart, so a retry after a lost response replays the stored result instead of applying
-- the change twice. Same operation_id + different content => rejected.
CREATE TABLE IF NOT EXISTS operation_receipts (
  operation_id  CHAR(36)    NOT NULL PRIMARY KEY,
  account_id    CHAR(36)    NOT NULL,
  request_hash  CHAR(64)    NOT NULL,
  status_code   SMALLINT    NOT NULL,
  response_body MEDIUMTEXT  NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

-- Every accepted change (including deletion markers) appends a row; devices pull seq > last_seen.
CREATE TABLE IF NOT EXISTS change_log (
  seq         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id  CHAR(36)    NOT NULL,
  change_type ENUM('UPSERT','DELETE') NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_change_log_student (student_id)
) ENGINE=InnoDB;

-- =====================================================================
-- 6. PLANNED FEATURES (tables ready, no API yet): timetables, lab sessions, reminders
-- A lab session = a weekly slot for a lab group (optionally one programme) run by a lecturer.
-- The student timetable is "sessions for my group/programme"; a lecturer's teaching times are
-- "sessions where lecturer_id = me".
-- =====================================================================
CREATE TABLE IF NOT EXISTS lab_sessions (
  session_id     CHAR(36)     NOT NULL PRIMARY KEY,
  group_code     VARCHAR(4)   NOT NULL,
  programme_code VARCHAR(4)   NULL,                           -- NULL = all programmes in the group
  lecturer_id    CHAR(36)     NULL,
  title          VARCHAR(100) NOT NULL,
  day_of_week    TINYINT UNSIGNED NOT NULL,                   -- 1 = Monday ... 7 = Sunday
  start_time     TIME         NOT NULL,
  end_time       TIME         NOT NULL,
  venue          VARCHAR(100) NULL,
  version        INT UNSIGNED NOT NULL DEFAULT 1,
  is_deleted     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_sessions_group (group_code, day_of_week),
  KEY idx_sessions_lecturer (lecturer_id),
  CONSTRAINT fk_sessions_group     FOREIGN KEY (group_code)     REFERENCES lab_groups (group_code),
  CONSTRAINT fk_sessions_programme FOREIGN KEY (programme_code) REFERENCES programmes (programme_code),
  CONSTRAINT fk_sessions_lecturer  FOREIGN KEY (lecturer_id)    REFERENCES lecturers (lecturer_id),
  CONSTRAINT chk_session_day  CHECK (day_of_week BETWEEN 1 AND 7),
  CONSTRAINT chk_session_time CHECK (end_time > start_time)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reminders (
  reminder_id CHAR(36)     NOT NULL PRIMARY KEY,
  account_id  CHAR(36)     NOT NULL,
  session_id  CHAR(36)     NULL,
  remind_at   DATETIME(3)  NOT NULL,                          -- stored in UTC
  message     VARCHAR(200) NOT NULL,
  status      ENUM('SCHEDULED','SENT','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_reminders_account (account_id, remind_at),
  CONSTRAINT fk_reminders_account FOREIGN KEY (account_id) REFERENCES accounts (account_id),
  CONSTRAINT fk_reminders_session FOREIGN KEY (session_id) REFERENCES lab_sessions (session_id)
) ENGINE=InnoDB;

-- =====================================================================
-- 7. REFERENCE ROWS - copied from the Android app so dropdown text and database always agree.
--    ON DUPLICATE KEY UPDATE: re-running this script re-syncs names, it never creates copies.
--    Schools / departments : RegisterLecturerActivity.SCHOOL_DEPARTMENTS
--    Programmes            : ProgramDropdownAdapter.create()
-- =====================================================================
INSERT INTO schools (school_code, school_name) VALUES
  ('SBS',  'School of Business Studies'),
  ('SET',  'School of Engineering and Technology'),
  ('SSS',  'School of Social Sciences'),
  ('SANR', 'School of Agriculture and Natural Resources'),
  ('SNM',  'School of Nursing and Midwifery'),
  ('SMHS', 'School of Medicine and Health Sciences'),
  ('SNAS', 'School of Natural and Applied Sciences')
ON DUPLICATE KEY UPDATE school_name = VALUES(school_name);

INSERT INTO departments (department_code, school_code, department_name) VALUES
  ('BUS',  'SBS',  'Department of Business Studies'),
  ('LLHR', 'SBS',  'Department of Law, Labour and Human Resource Management'),
  ('ECON', 'SBS',  'Department of Economics'),
  ('CSIT', 'SET',  'Department of Computer Science and Information Technology'),
  ('ENG',  'SET',  'Department of Engineering'),
  ('EDU',  'SSS',  'Department of Education'),
  ('SDS',  'SSS',  'Department of Social Development Studies'),
  ('PAS',  'SSS',  'Department of Political and Administrative Studies'),
  ('AEA',  'SANR', 'Department of Agricultural Economics and Agribusiness'),
  ('NRES', 'SANR', 'Department of Natural Resources and Environmental Sciences'),
  ('NM',   'SNM',  'Department of Nursing and Midwifery'),
  ('CLIN', 'SMHS', 'Department of Clinical Sciences'),
  ('PHYS', 'SMHS', 'Department of Physiological Sciences'),
  ('PATH', 'SMHS', 'Department of Pathology and Microbiology'),
  ('SURG', 'SMHS', 'Department of Surgery'),
  ('MATH', 'SNAS', 'Department of Mathematics and Statistics'),
  ('CHBI', 'SNAS', 'Department of Chemistry and Biology'),
  ('PHYC', 'SNAS', 'Department of Physics')
ON DUPLICATE KEY UPDATE department_name = VALUES(department_name);

-- NOTE: the app's programme dropdown only covers three schools (SET, SNAS, SMHS).
-- Students from the other four schools have no programme to pick until programmes are added here
-- AND in ProgramDropdownAdapter.
INSERT INTO programmes (programme_code, school_code, programme_name) VALUES
  ('CS',  'SET',  'Computer Science'),
  ('IT',  'SET',  'Information Technology'),
  ('CIV', 'SET',  'Civil Engineering'),
  ('MEC', 'SET',  'Mechanical Engineering'),
  ('EEE', 'SET',  'Electrical and Electronics Engineering'),
  ('AGE', 'SET',  'Agricultural Engineering'),
  ('WTE', 'SET',  'Water Engineering'),
  ('IND', 'SET',  'Industrial Engineering'),
  ('GEO', 'SET',  'Geomatics Engineering'),
  ('MST', 'SNAS', 'Mathematics and Statistics'),
  ('STA', 'SNAS', 'Statistics'),
  ('PHY', 'SNAS', 'Physics'),
  ('PHM', 'SNAS', 'Physics and Mathematics'),
  ('CHM', 'SNAS', 'Chemistry'),
  ('BIO', 'SNAS', 'Biological Sciences'),
  ('BCH', 'SNAS', 'Bio-Chemistry'),
  ('LAB', 'SNAS', 'Laboratory Technology'),
  ('NRM', 'SNAS', 'Natural Resources Management'),
  ('MBC', 'SMHS', 'Medicine and Surgery (MBChB)'),
  ('BMS', 'SMHS', 'Biomedical Sciences'),
  ('PHA', 'SMHS', 'Pharmacy')
ON DUPLICATE KEY UPDATE programme_name = VALUES(programme_name), school_code = VALUES(school_code);

INSERT IGNORE INTO lab_groups (group_code, capacity) VALUES
  ('G01', 15), ('G02', 15), ('G03', 15), ('G04', 15);
