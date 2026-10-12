#!/bin/bash
# Each statement below MUST be rejected by the database itself.
t() { out=$(mysql studentsync -e "$2" 2>&1); if echo "$out" | grep -qi "error"; then echo "  PASS  $1  ->  $(echo "$out" | grep -i error | head -1 | cut -c1-100)"; else echo "  FAIL  $1  (was accepted!)"; fi; }
t "8-digit student number"            "INSERT INTO students (student_id,student_number,student_name,programme_code) VALUES (UUID(),'12345678','Bad Number','CS')"
t "unknown programme"                 "INSERT INTO students (student_id,student_number,student_name,programme_code) VALUES (UUID(),'555555555','Bad Prog','ZZZ')"
t "unknown lab group"                 "INSERT INTO students (student_id,student_number,student_name,programme_code,group_code) VALUES (UUID(),'555555556','Bad Group','CS','G99')"
mysql studentsync -e "INSERT INTO students (student_id,student_number,student_name,programme_code) VALUES ('11111111-1111-4111-8111-111111111111','555555557','Dup One','CS')" 2>&1
t "duplicate student number"          "INSERT INTO students (student_id,student_number,student_name,programme_code) VALUES (UUID(),'555555557','Dup Two','IT')"
t "deleted flag without deleted_at"   "UPDATE students SET is_deleted=1 WHERE student_id='11111111-1111-4111-8111-111111111111'"
t "group capacity above 15"           "UPDATE lab_groups SET capacity=16 WHERE group_code='G01'"
t "lecturer: department of wrong school" "INSERT INTO accounts (account_id,role,login_id,password_hash) VALUES ('22222222-2222-4222-8222-222222222222','lecturer','x@mu.example','h'); INSERT INTO lecturers (lecturer_id,account_id,full_name,staff_id,staff_email,school_code,department_code) VALUES (UUID(),'22222222-2222-4222-8222-222222222222','Wrong Dept','S9','x@mu.example','SMHS','CSIT')"
t "student account without a profile" "INSERT INTO accounts (account_id,role,login_id,password_hash) VALUES (UUID(),'student','123456789','h')"
t "token use_count above max_uses"    "UPDATE faculty_tokens SET use_count=max_uses+1"
t "session ending before it starts"   "INSERT INTO lab_sessions (session_id,group_code,title,day_of_week,start_time,end_time) VALUES (UUID(),'G01','Bad time',1,'10:00','09:00')"
mysql studentsync -e "DELETE FROM accounts WHERE account_id='22222222-2222-4222-8222-222222222222'; DELETE FROM students WHERE student_id='11111111-1111-4111-8111-111111111111'" 2>&1
