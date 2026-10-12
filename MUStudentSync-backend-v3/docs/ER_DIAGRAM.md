# ER diagram v3 (Activity C)

Paste the block into https://mermaid.live to export a PNG/SVG for your submission
(GitHub also renders it directly).

```mermaid
erDiagram
    SCHOOLS ||--o{ DEPARTMENTS : "has"
    SCHOOLS ||--o{ PROGRAMMES : "offers"
    SCHOOLS |o--o{ FACULTY_TOKENS : "may limit a token to"
    DEPARTMENTS ||--o{ LECTURERS : "employs"
    PROGRAMMES ||--o{ STUDENTS : "enrols"
    LAB_GROUPS |o--o{ STUDENTS : "holds max 15 active"
    STUDENTS |o--o| ACCOUNTS : "linked at registration"
    ACCOUNTS ||--o| LECTURERS : "lecturer profile"
    STUDENTS ||--o{ CHANGE_REQUESTS : "asks number correction"
    STUDENTS ||--o{ CHANGE_LOG : "sync feed"
    LAB_GROUPS ||--o{ LAB_SESSIONS : "scheduled for"
    PROGRAMMES |o--o{ LAB_SESSIONS : "optionally for"
    LECTURERS |o--o{ LAB_SESSIONS : "teaches"
    ACCOUNTS ||--o{ REMINDERS : "owns"
    LAB_SESSIONS |o--o{ REMINDERS : "about"

    SCHOOLS {
        varchar school_code PK
        varchar school_name UK
    }
    DEPARTMENTS {
        varchar department_code PK
        varchar school_code FK
        varchar department_name
    }
    PROGRAMMES {
        varchar programme_code PK
        varchar school_code FK
        varchar programme_name UK "text shown in the dropdown"
    }
    LAB_GROUPS {
        varchar group_code PK "G01 to G04"
        tinyint capacity "1 to 15"
    }
    STUDENTS {
        char student_id PK "immutable UUID"
        char student_number UK "9 digits, reserved after delete"
        varchar student_name
        varchar programme_code FK
        varchar group_code FK "NULL = Unassigned"
        int version "optimistic concurrency"
        tinyint is_deleted "soft delete"
        datetime deleted_at
        char deleted_by "audit, lecturer account_id"
        datetime created_at
        datetime updated_at
    }
    ACCOUNTS {
        char account_id PK
        enum role "student or lecturer"
        varchar login_id UK "student number or staff email"
        varchar password_hash "bcrypt"
        char student_id FK "NULL for lecturers, unique"
        tinyint is_disabled
    }
    LECTURERS {
        char lecturer_id PK
        char account_id FK "unique"
        varchar full_name
        varchar staff_id UK
        varchar staff_email UK
        varchar school_code FK "with department_code: department must belong to school"
        varchar department_code FK
    }
    STUDENT_CLAIM_CODES {
        char student_number PK "matched by number, no FK"
        varchar code_hash "bcrypt"
        datetime claimed_at
    }
    FACULTY_TOKENS {
        char token_id PK
        char token_hash UK "SHA-256"
        varchar school_code FK "NULL = any school"
        int max_uses
        int use_count "never above max_uses"
        datetime expires_at
        tinyint revoked
    }
    CHANGE_REQUESTS {
        char request_id PK
        char student_id FK
        char requested_number
        enum status "PENDING APPROVED REJECTED"
    }
    OPERATION_RECEIPTS {
        char operation_id PK "idempotency key"
        char account_id "logical link, no FK"
        char request_hash
        smallint status_code
        text response_body
    }
    CHANGE_LOG {
        bigint seq PK
        char student_id FK
        enum change_type "UPSERT or DELETE"
    }
    LAB_SESSIONS {
        char session_id PK
        varchar group_code FK
        varchar programme_code FK "NULL = all programmes"
        char lecturer_id FK
        tinyint day_of_week "1 Monday to 7 Sunday"
        time start_time
        time end_time
        varchar venue
    }
    REMINDERS {
        char reminder_id PK
        char account_id FK
        char session_id FK
        datetime remind_at "UTC"
        enum status "SCHEDULED SENT CANCELLED"
    }
```

Rules the database enforces by itself (proved by `docs/DB_CONSTRAINT_PROOFS.txt`): 9-digit student number, unique number (also
after soft delete), valid programme and group, group capacity never above 15, a deleted student must carry a deletion marker,
a student account must point to a profile, a lecturer's department must belong to their school, a token can never be used
more times than allowed, and a session cannot end before it starts. The 15-active-students-per-group rule itself is enforced by
the server inside a transaction (Challenge 1), because it depends on a count across many rows.
