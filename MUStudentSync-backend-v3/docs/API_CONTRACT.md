# MU StudentSync API contract v3 (Activity C)

Base URL: `https://<your-host>/api` (emulator during development: `http://10.0.2.2:3000/api`).
All bodies are JSON. Protected routes need `Authorization: Bearer <token>`.

**Mutations** (POST / PATCH / DELETE on students, `/me/*` and correction requests) need an operation ID: header
`Idempotency-Key: <uuid>` or body field `operation_id`. Retry with the SAME ID and the server replays the stored result and never
applies it twice (`Idempotent-Replay: true` header). Same ID + different content => `422 OPERATION_ID_REUSED`.
Registration, login and the reference lists do not need one.

**Error shape:** `{ "error": { "code": "...", "message": "...", "details": { } } }`

**Student object:** `{ student_id, student_number, student_name, programme_code, group_code | null, version, is_deleted, updated_at }`.
A deleted student is only a marker: `{ student_id, student_number, version, is_deleted: true, deleted_at }`.

**Codes, not names.** The API uses `programme_code` (e.g. `CS`), `school_code` (e.g. `SET`), `department_code` (e.g. `CSIT`).
Load the code <-> name lists from `GET /reference` instead of hard-coding them in the app.

## Public

| Method | Route | Request | Success | Errors |
|---|---|---|---|---|
| GET | `/reference` | - | `200 { schools: [{ school_code, school_name, departments: [{ department_code, department_name }] }], programmes: [{ programme_code, school_code, programme_name }] }` | - |
| POST | `/auth/register` (student) | `student_number`, `claim_code`, `password` (8-72 chars), plus `student_name` and `programme_code` when no lecturer-entered profile exists | `201 { token, role: "student", student, linked_existing_profile }` | `400 VALIDATION_ERROR`, `403 INVALID_CLAIM`, `403 STUDENT_NUMBER_RESERVED`, `429` |
| POST | `/auth/register-lecturer` | `full_name`, `staff_id`, `staff_email`, `school_code`, `department_code`, `password` (8-72), `faculty_token` | `201 { token, role: "lecturer", lecturer: { lecturer_id, full_name, staff_id, staff_email, school_code, department_code } }` | `400 VALIDATION_ERROR`, `400 INVALID_DEPARTMENT` (department not in that school), `403 INVALID_FACULTY_TOKEN` (unknown / used up / expired / revoked / wrong school), `409 EMAIL_TAKEN`, `409 STAFF_ID_TAKEN`, `429` |
| POST | `/auth/login` | `login_id` (9-digit student number OR staff email, email is case-insensitive), `password` | `200 { token, role, student }` or `200 { token, role, lecturer }` | `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`, `429` |

A failed lecturer registration never uses up the token. A token's last use can only go to one registration, even if two
people submit at the same moment.

## Any signed-in user

| Method | Route | Success | Notes |
|---|---|---|---|
| GET | `/auth/me` | `200 { account_id, role, login_id, student_id, lecturer? }` | `401 UNAUTHENTICATED` / `401 SESSION_EXPIRED` (sign in again) |
| GET | `/groups` | `200 { groups: [{ group_code, capacity, occupancy }], unassigned? }` | Numbers only, no names. `unassigned` is for lecturers. Drives "(FULL - 15/15)". |
| GET | `/sync/changes?since=N&limit=200` | `200 { items: [student + seq], next_since, has_more }` | Lecturer: whole roster feed. Student: own record only. Includes deletion markers. |

## Student routes (role: student - always act on the signed-in student only)

| Method | Route | Request body | Success | Errors |
|---|---|---|---|---|
| GET | `/me/student` | - | `200 { student, group: { group_code, capacity, occupancy } \| null }` | `403 FORBIDDEN` |
| PATCH | `/me/student` | `base_version`, `student_name` and/or `programme_code` | `200 { student }` | `400`, `403 FIELD_NOT_PERMITTED` (number/group), `409 VERSION_CONFLICT` |
| POST | `/me/group-request` | `group_code` (G01-G04), `base_version` | `200 { student }` | `409 GROUP_FULL` (old group kept), `409 VERSION_CONFLICT`, `400 INVALID_GROUP` |
| POST | `/me/correction-requests` | `requested_student_number` | `201 { request_id, status: "PENDING", requested_student_number }` | `400` |

## Lecturer routes (role: lecturer)

| Method | Route | Request | Success | Errors |
|---|---|---|---|---|
| GET | `/students` | query: `search`, `programme` (code), `group` (G01-G04 or `UNASSIGNED`), `page`, `page_size` (max 50). All combinable. | `200 { items, page, page_size, total }` | `400` |
| GET | `/students/{id}` | - | `200 { student }` | `404 NOT_FOUND` |
| POST | `/students` | `student_number`, `student_name`, `programme_code`, optional `group_code`, optional client `student_id` (UUID, for offline creates) | `201 { student }` | `409 DUPLICATE_STUDENT_NUMBER`, `409 STUDENT_NUMBER_RESERVED`, `409 GROUP_FULL`, `409 DUPLICATE_STUDENT_ID`, `400` |
| PATCH | `/students/{id}` | `base_version` + any of `student_name`, `programme_code`, `student_number`, `group_code` (`null` = Unassigned) | `200 { student }` | `409 VERSION_CONFLICT` (+ `details.current`), `409 GROUP_FULL`, `409 DUPLICATE_STUDENT_NUMBER`, `410 STUDENT_DELETED`, `404` |
| DELETE | `/students/{id}?base_version=N` | optional `base_version` | `200 { student, already_deleted }` (repeat delete: `already_deleted: true`, frees nothing; records `deleted_by`) | `409 VERSION_CONFLICT`, `404` |
| GET | `/correction-requests` | - | `200 { items }` | - |
| POST | `/correction-requests/{id}/resolve` | `decision`: `APPROVE` or `REJECT` | `200 { request_id, status, student }` | `409 ALREADY_RESOLVED`, `409 DUPLICATE_STUDENT_NUMBER` |

The Android app replays each queued operation through the mutation routes above, in order, with the operation's stored ID.
