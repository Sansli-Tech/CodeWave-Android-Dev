# Screens -> database (v3)

| Screen | Field | Stored in | Notes |
|---|---|---|---|
| Sign-In | Student Number or Email + Password | `accounts.login_id`, `accounts.password_hash` | Students use the 9-digit number, lecturers the (lower-case) staff email. The phone never stores the password. |
| Register: student | Full Name | `students.student_name` | 2-100 characters |
| | Student Number (9 digits) | `students.student_number` | CHAR(9), UNIQUE, leading zeros kept |
| | Program of Study | `students.programme_code` -> `programmes` | Dropdown has 21 programmes in 3 schools |
| | Student Claim Code | `student_claim_codes` | Proves ownership of that number. Linked to the existing profile if a lecturer added the student first. |
| | **Password (new field needed)** | `accounts.password_hash` | The current form has none, but a student account needs one |
| | Offline draft | Room `registration_draft` on the phone | Not on the server |
| Register: lecturer | Full Name, Staff ID, Staff Email | `lecturers.full_name`, `.staff_id`, `.staff_email` | Staff ID and email are UNIQUE |
| | School -> Department | `lecturers.school_code`, `.department_code` | Composite FK: the department must belong to the school |
| | Password | `accounts.password_hash` | |
| | Faculty Authorization Token | `faculty_tokens` | Limited uses, optional expiry, revocable |
| Student Profile | name, number, programme, group (view) + occupancy | `students` + count of active students in the group | |
| Lecturer Roster | name, number, programme, group; search; filters | `students` | Group filter includes Unassigned (`group_code IS NULL`) |
| Student Editor | name, number, programme, Allocated Lab Group | `students` | New students start Unassigned; `(FULL - 15/15)` comes from the group count |
| Planned: timetable | sessions by group/programme | `lab_sessions` | Lecturer teaching times = sessions where `lecturer_id` is theirs |
| Planned: reminders | | `reminders` | |

## Changes this means for the Android app
1. **Add a Password field** to `activity_register.xml` and `RegisterActivity` (and a string for its error).
2. **Send `programme_code`, not the name.** `ProgramDropdownAdapter` has names only. Add a name -> code lookup
   (the codes are in `schema.sql`), or load them from the API later.
3. **Do not ask for a group at registration.** Your screens already don't, which now matches the server.
4. `StudentDao` uses `'All Programs'` / `'All Groups'` filter sentinels: keep them on the phone, and map them to
   "no filter" when you call the API.
5. Your Room `StudentEntity` should keep `student_id` (UUID string) as its key, plus `version` and an `is_deleted` flag.
