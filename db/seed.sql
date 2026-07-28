-- ============================================================
-- SEED DATA v1 - ONE SCHOOL, ACADEMIC YEAR 2026-27
-- Classes 1-7 (section A only) + 8,9,10 (sections A,B,C) = 16 classes
-- 25 students per class = 400 students, 400 parents, 20 teachers
-- ALL passwords are: Pass@123
-- Phone numbers are FAKE (replace with real data later)
--   admin   : 9000000001
--   teachers: 9000000101 .. 9000000120
--   buses   : 9000000021 , 9000000022
--   parents : 9810000001 .. 9810000400
-- Run as school_app inside the school database:  \i 'C:/.../seed.sql'
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- one bcrypt hash reused for all seed accounts (password: Pass@123)
CREATE TEMP TABLE seed_hash AS
SELECT crypt('Pass@123', gen_salt('bf', 10)) AS h;

-- ---------- 1. BRANCH ----------
INSERT INTO branches (name, address)
VALUES ('Greenwood High School - Main Branch', 'MG Road, Hyderabad, Telangana 500081');

-- ---------- 2. ADMIN ----------
INSERT INTO profiles (branch_id, role, full_name, phone_number, email, password_hash)
SELECT b.id, 'admin', 'School Administrator', '9000000001', 'admin@greenwood.test', (SELECT h FROM seed_hash)
FROM branches b;

-- ---------- 3. SUBJECTS ----------
INSERT INTO subjects (branch_id, subject_name)
SELECT (SELECT id FROM branches LIMIT 1), s
FROM unnest(ARRAY['Telugu','Hindi','English','Mathematics','Science','Social Studies']) AS s;

CREATE TEMP TABLE seed_subj AS
SELECT id AS subject_id, row_number() OVER (ORDER BY id) AS subj_ord FROM subjects;

-- ---------- 4. CLASSES (1-7 A only; 8-10 A,B,C) ----------
INSERT INTO classes (branch_id, class_number, section)
SELECT (SELECT id FROM branches LIMIT 1), n, 'A' FROM generate_series(1,7) n
UNION ALL
SELECT (SELECT id FROM branches LIMIT 1), n, s
FROM generate_series(8,10) n CROSS JOIN unnest(ARRAY['A','B','C']) s;

CREATE TEMP TABLE seed_map AS
SELECT id AS class_id, class_number, section,
       row_number() OVER (ORDER BY class_number, section) AS class_ord
FROM classes;

-- ---------- 5. TEACHERS (20) + staff_details ----------
INSERT INTO profiles (branch_id, role, full_name, phone_number, email, password_hash)
SELECT (SELECT id FROM branches LIMIT 1), 'teacher',
       (ARRAY['Anil','Sunitha','Rajesh','Padmaja','Vikram','Shobha','Ganesh','Revathi','Prasad','Jyothi',
              'Suresh','Kalpana','Mahender','Swapna','Ramesh','Aruna','Naveen','Sridevi','Kishore','Madhavi'])[n]
       || ' ' ||
       (ARRAY['Reddy','Sharma','Varma','Naidu','Rao','Kumar','Gupta','Patel','Iyer','Chowdary',
              'Goud','Raju','Nair','Das','Joshi','Mehta','Prasad','Shetty','Pillai','Yadav'])[n],
       '90000001' || lpad(n::text, 2, '0'),
       'teacher' || n || '@greenwood.test',
       (SELECT h FROM seed_hash)
FROM generate_series(1,20) n;

INSERT INTO staff_details (profile_id, employee_id, core_subject_id, total_annual_leaves, used_leaves)
SELECT p.id,
       'EMP' || lpad(right(p.phone_number, 2), 2, '0'),
       (SELECT subject_id FROM seed_subj WHERE subj_ord = ((right(p.phone_number,2)::int - 1) % 6) + 1),
       12, 0
FROM profiles p WHERE p.role = 'teacher';

-- ---------- 6. PARENTS (400) ----------
-- student n = (class_ord-1)*25 + roll  -> parent phone 98100000nn
CREATE TEMP TABLE seed_students AS
SELECT (m.class_ord - 1) * 25 + r AS n,
       m.class_id, m.class_number, m.section, m.class_ord, r AS roll
FROM seed_map m CROSS JOIN generate_series(1,25) r;

INSERT INTO profiles (branch_id, role, full_name, phone_number, address, password_hash)
SELECT (SELECT id FROM branches LIMIT 1), 'parent',
       (ARRAY['Ramesh','Sujatha','Venkat','Padma','Srinivas','Radha','Mohan','Sita','Prakash','Savitri',
              'Raghu','Geetha','Naresh','Vani','Kiran','Sarala','Mahesh','Kamala','Ravi','Devi',
              'Sekhar','Bhavani','Anand','Lalitha','Murali'])[(s.n % 25) + 1]
       || ' ' ||
       (ARRAY['Reddy','Sharma','Varma','Naidu','Rao','Kumar','Gupta','Patel','Iyer','Chowdary',
              'Goud','Raju','Nair','Das','Joshi','Mehta','Prasad','Shetty','Pillai','Yadav'])[(s.n % 20) + 1],
       '98' || lpad((10000000 + s.n)::text, 8, '0'),
       'H.No ' || s.n || ', Street ' || ((s.n % 12) + 1) || ', Hyderabad',
       (SELECT h FROM seed_hash)
FROM seed_students s;

-- ---------- 7. STUDENTS (400) ----------
INSERT INTO students (branch_id, class_id, parent_profile_id, full_name, roll_number,
                      date_of_birth, gender, address, admission_date)
SELECT (SELECT id FROM branches LIMIT 1),
       s.class_id, p.id,
       (ARRAY['Aarav','Ananya','Vihaan','Diya','Arjun','Sai','Ishaan','Meera','Rohan','Kavya',
              'Aditya','Sneha','Karthik','Pooja','Rahul','Divya','Krishna','Riya','Varun','Anjali',
              'Nikhil','Shreya','Harsha','Lakshmi','Manoj'])[(s.n % 25) + 1]
       || ' ' ||
       (ARRAY['Reddy','Sharma','Varma','Naidu','Rao','Kumar','Gupta','Patel','Iyer','Chowdary',
              'Goud','Raju','Nair','Das','Joshi','Mehta','Prasad','Shetty','Pillai','Yadav'])[(s.n % 20) + 1],
       s.roll,
       (DATE '2021-03-01' - make_interval(years => s.class_number::int) + make_interval(days => ((s.n * 17) % 300)::int))::date,
       CASE WHEN s.n % 2 = 0 THEN 'male' ELSE 'female' END,
       'H.No ' || s.n || ', Street ' || ((s.n % 12) + 1) || ', Hyderabad',
       DATE '2026-06-10'
FROM seed_students s
JOIN profiles p ON p.phone_number = '98' || lpad((10000000 + s.n)::text, 8, '0');

CREATE TEMP TABLE seed_stu2 AS
SELECT s.n, s.class_id, s.class_number, s.section, s.class_ord, s.roll,
       st.id AS student_id, st.parent_profile_id
FROM seed_students s
JOIN students st ON st.class_id = s.class_id AND st.roll_number = s.roll;

-- ---------- 8. ENROLLMENTS (2026-27) ----------
INSERT INTO student_enrollments (student_id, class_id, academic_year, roll_number, status)
SELECT student_id, class_id, '2026-27', roll, 'active' FROM seed_stu2;

-- ---------- 9. TEACHER-CLASS ASSIGNMENTS ----------
-- each class gets all 6 subjects; teacher of subject #1 is the class teacher
INSERT INTO teacher_class_assignments (teacher_id, class_id, subject_id, is_class_teacher)
SELECT tp.id, m.class_id, sj.subject_id, (sj.subj_ord = 1)
FROM seed_map m
CROSS JOIN seed_subj sj
JOIN profiles tp
  ON tp.phone_number = '90000001' || lpad((((m.class_ord + sj.subj_ord * 3) % 20) + 1)::text, 2, '0');

-- ---------- 10. SCHOOL CALENDAR (Jun 2026 - Apr 2027; Sundays + 4 holidays off) ----------
INSERT INTO school_calendar (branch_id, date, is_working_day)
SELECT (SELECT id FROM branches LIMIT 1), d::date,
       CASE WHEN extract(dow FROM d) = 0 THEN false
            WHEN d::date IN (DATE '2026-08-15', DATE '2026-10-02', DATE '2027-01-14', DATE '2027-01-26') THEN false
            ELSE true END
FROM generate_series(DATE '2026-06-01', DATE '2027-04-30', interval '1 day') d;

-- ---------- 11. STAFF ATTENDANCE (Jul 20-25, all teachers) ----------
INSERT INTO staff_attendance (teacher_id, date, clock_in, clock_out, status)
SELECT p.id, d::date,
       CASE WHEN p.phone_number = '9000000101' AND d::date = DATE '2026-07-20' THEN NULL ELSE d::date + time '09:10' END,
       CASE WHEN p.phone_number = '9000000101' AND d::date = DATE '2026-07-20' THEN NULL ELSE d::date + time '16:30' END,
       CASE WHEN p.phone_number = '9000000101' AND d::date = DATE '2026-07-20' THEN 'on_leave' ELSE 'present' END
FROM profiles p CROSS JOIN generate_series(DATE '2026-07-20', DATE '2026-07-25', interval '1 day') d
WHERE p.role = 'teacher';

-- ---------- 12. STUDENT ATTENDANCE (exception-only; 2 marked/class/day, Jul 20-25) ----------
INSERT INTO student_attendance (student_id, date, status, recorded_by)
SELECT s2.student_id, d::date,
       CASE WHEN pick.k = 1 THEN 'absent'
            WHEN extract(day FROM d)::int % 2 = 0 THEN 'late'
            ELSE 'half_day' END,
       tca.teacher_id
FROM generate_series(DATE '2026-07-20', DATE '2026-07-25', interval '1 day') d
CROSS JOIN seed_map m
CROSS JOIN LATERAL (VALUES (1), (2)) AS pick(k)
JOIN seed_stu2 s2
  ON s2.class_id = m.class_id
 AND s2.roll = ((extract(day FROM d)::int + m.class_ord + CASE WHEN pick.k = 2 THEN 7 ELSE 0 END) % 25) + 1
JOIN teacher_class_assignments tca
  ON tca.class_id = m.class_id AND tca.is_class_teacher;

INSERT INTO attendance_submissions (class_id, date, marked_by, absent_count, modified_count)
SELECT m.class_id, d::date, tca.teacher_id, 2, 0
FROM generate_series(DATE '2026-07-20', DATE '2026-07-25', interval '1 day') d
CROSS JOIN seed_map m
JOIN teacher_class_assignments tca ON tca.class_id = m.class_id AND tca.is_class_teacher;

-- ---------- 13. EXAM + EXAM SUBJECTS + MARKS ----------
INSERT INTO exams (branch_id, exam_name, academic_year, is_main_exam)
VALUES ((SELECT id FROM branches LIMIT 1), 'Formative Assessment 1', '2026-27', false);

INSERT INTO exam_subjects (exam_id, class_id, subject_id, max_marks, pass_marks)
SELECT (SELECT id FROM exams LIMIT 1), m.class_id, sj.subject_id, 100, 35
FROM seed_map m CROSS JOIN seed_subj sj;

INSERT INTO marks (exam_id, student_id, subject_id, score)
SELECT (SELECT id FROM exams LIMIT 1), s2.student_id, sj.subject_id,
       30 + ((s2.n * 7 + sj.subj_ord * 13) % 69)
FROM seed_stu2 s2 CROSS JOIN seed_subj sj;

-- ---------- 14. FEES + INSTALLMENTS + RECEIPTS ----------
-- tuition for everyone (amount grows with class), books for everyone, bus only for bus students (n % 5 = 0)
INSERT INTO fees (student_id, category, academic_year, total_amount, balance_due)
SELECT student_id, 'tuition', '2026-27', 24000 + class_number * 1500, 24000 + class_number * 1500 FROM seed_stu2
UNION ALL
SELECT student_id, 'books', '2026-27', 3500, 3500 FROM seed_stu2
UNION ALL
SELECT student_id, 'bus', '2026-27', 12000, 12000 FROM seed_stu2 WHERE n % 5 = 0;

-- tuition: 3 term installments (40/30/30)
INSERT INTO fee_installments (fee_id, installment_number, label, due_date, amount)
SELECT f.id, t.num, t.label, t.due, round(f.total_amount * t.frac, 2)
FROM fees f
CROSS JOIN (VALUES (1, 'Term 1', DATE '2026-06-15', 0.40),
                   (2, 'Term 2', DATE '2026-09-15', 0.30),
                   (3, 'Term 3', DATE '2026-12-15', 0.30)) AS t(num, label, due, frac)
WHERE f.category = 'tuition';

-- books + bus: single installment
INSERT INTO fee_installments (fee_id, installment_number, label, due_date, amount)
SELECT f.id, 1, 'Full Payment', DATE '2026-06-15', f.total_amount
FROM fees f WHERE f.category IN ('books','bus');

-- receipts - deterministic payment pattern:
--   tuition: n%3=1 -> fully paid | n%3=0 -> 40% paid | n%3=2 -> unpaid
--   books  : n%2=0 -> paid       | bus: n%10=0 -> half paid
INSERT INTO receipts (fee_id, amount_paid, payment_mode, received_by, created_at)
SELECT f.id,
       CASE WHEN s2.n % 3 = 1 THEN f.total_amount ELSE round(f.total_amount * 0.40, 2) END,
       CASE WHEN s2.n % 2 = 0 THEN 'upi' ELSE 'cash' END,
       (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1),
       now() - make_interval(days => (s2.n % 25)::int)
FROM fees f JOIN seed_stu2 s2 ON s2.student_id = f.student_id
WHERE f.category = 'tuition' AND s2.n % 3 IN (0, 1);

INSERT INTO receipts (fee_id, amount_paid, payment_mode, received_by, created_at)
SELECT f.id, f.total_amount, 'cash',
       (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1),
       now() - make_interval(days => (s2.n % 20)::int)
FROM fees f JOIN seed_stu2 s2 ON s2.student_id = f.student_id
WHERE f.category = 'books' AND s2.n % 2 = 0;

INSERT INTO receipts (fee_id, amount_paid, payment_mode, received_by, created_at)
SELECT f.id, 6000, 'upi',
       (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1),
       now() - make_interval(days => (s2.n % 15)::int)
FROM fees f JOIN seed_stu2 s2 ON s2.student_id = f.student_id
WHERE f.category = 'bus' AND s2.n % 10 = 0;

-- recompute running balances so fees ALWAYS match receipts (money invariant)
UPDATE fees f
SET balance_due = f.total_amount - p.paid
FROM (SELECT fee_id, sum(amount_paid) AS paid FROM receipts GROUP BY fee_id) p
WHERE p.fee_id = f.id;

-- ---------- 15. BUSES ----------
INSERT INTO profiles (branch_id, role, full_name, phone_number, password_hash)
VALUES ((SELECT id FROM branches LIMIT 1), 'bus', 'Bus 1 - Kukatpally Route', '9000000021', (SELECT h FROM seed_hash)),
       ((SELECT id FROM branches LIMIT 1), 'bus', 'Bus 2 - Miyapur Route',    '9000000022', (SELECT h FROM seed_hash));

INSERT INTO buses (branch_id, profile_id, bus_name, route_name, is_sharing, last_lat, last_lng, last_ping_at)
SELECT (SELECT id FROM branches LIMIT 1), p.id,
       CASE p.phone_number WHEN '9000000021' THEN 'Bus 1' ELSE 'Bus 2' END,
       CASE p.phone_number WHEN '9000000021' THEN 'Kukatpally Route' ELSE 'Miyapur Route' END,
       true,
       CASE p.phone_number WHEN '9000000021' THEN 17.4948 ELSE 17.4967 END,
       CASE p.phone_number WHEN '9000000021' THEN 78.3996 ELSE 78.3715 END,
       now() - interval '3 minutes'
FROM profiles p WHERE p.role = 'bus';

INSERT INTO bus_assignments (student_id, bus_id)
SELECT s2.student_id,
       CASE WHEN s2.n % 10 = 0 THEN (SELECT id FROM buses WHERE bus_name = 'Bus 1')
            ELSE (SELECT id FROM buses WHERE bus_name = 'Bus 2') END
FROM seed_stu2 s2 WHERE s2.n % 5 = 0;

INSERT INTO bus_alarms (bus_id, parent_id, threshold_minutes, parent_lat, parent_lng)
SELECT ba.bus_id, s2.parent_profile_id,
       CASE WHEN s2.n % 10 = 0 THEN 10 ELSE 20 END,
       17.4519 + (s2.n % 10) * 0.001, 78.3811 + (s2.n % 10) * 0.001
FROM seed_stu2 s2 JOIN bus_assignments ba ON ba.student_id = s2.student_id
WHERE s2.n IN (10, 25);

-- ---------- 16. GROUPS + MEMBERS + MESSAGES + REACTIONS ----------
INSERT INTO groups (branch_id, type, class_id, name)
SELECT (SELECT id FROM branches LIMIT 1), 'class', m.class_id,
       'Class ' || m.class_number || '-' || m.section
FROM seed_map m;

INSERT INTO groups (branch_id, type, class_id, name)
VALUES ((SELECT id FROM branches LIMIT 1), 'staff', NULL, 'Staff Room');

-- members: parents of the class (read-only) + class teacher + admin (can message)
INSERT INTO group_members (group_id, profile_id, can_message)
SELECT g.id, s2.parent_profile_id, false
FROM groups g JOIN seed_stu2 s2 ON s2.class_id = g.class_id
WHERE g.type = 'class';

INSERT INTO group_members (group_id, profile_id, can_message)
SELECT g.id, tca.teacher_id, true
FROM groups g JOIN teacher_class_assignments tca ON tca.class_id = g.class_id AND tca.is_class_teacher
WHERE g.type = 'class';

INSERT INTO group_members (group_id, profile_id, can_message)
SELECT g.id, (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1), true
FROM groups g WHERE g.type = 'class';

INSERT INTO group_members (group_id, profile_id, can_message)
SELECT g.id, p.id, true
FROM groups g CROSS JOIN profiles p
WHERE g.type = 'staff' AND p.role IN ('teacher','admin');

-- two messages per class group (one normal, one notice)
INSERT INTO messages (group_id, sender_id, content, is_notice, created_at)
SELECT g.id, tca.teacher_id,
       'Welcome to ' || g.name || ' for the academic year 2026-27!', false,
       now() - interval '2 days'
FROM groups g JOIN teacher_class_assignments tca ON tca.class_id = g.class_id AND tca.is_class_teacher
WHERE g.type = 'class';

INSERT INTO messages (group_id, sender_id, content, is_notice, created_at)
SELECT g.id, tca.teacher_id,
       'Notice: Parent-Teacher Meeting on Saturday, August 1st at 10:00 AM.', true,
       now() - interval '1 day'
FROM groups g JOIN teacher_class_assignments tca ON tca.class_id = g.class_id AND tca.is_class_teacher
WHERE g.type = 'class';

INSERT INTO messages (group_id, sender_id, content, is_notice, created_at)
SELECT g.id, (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1),
       m.c, m.n, now() - m.ago
FROM groups g,
     (VALUES ('Staff meeting Monday 8:30 AM in the library.', true,  interval '3 days'),
             ('Please submit FA-1 marks by Friday.',          false, interval '1 day')) AS m(c, n, ago)
WHERE g.type = 'staff';

-- some parents react to the PTM notice
INSERT INTO message_reactions (message_id, profile_id, emoji)
SELECT msg.id, s2.parent_profile_id, U&'\+01F44D'
FROM seed_stu2 s2
JOIN groups g ON g.class_id = s2.class_id AND g.type = 'class'
JOIN messages msg ON msg.group_id = g.id AND msg.is_notice
WHERE s2.n % 7 = 0;

-- ---------- 17. COMPLAINTS + FEEDBACK ----------
INSERT INTO complaints (branch_id, parent_id, subject, description, status, admin_reply, replied_by, replied_at, created_at)
SELECT (SELECT id FROM branches LIMIT 1), s2.parent_profile_id, c.subj, c.descr, c.st,
       c.reply,
       CASE WHEN c.reply IS NULL THEN NULL ELSE (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1) END,
       CASE WHEN c.reply IS NULL THEN NULL ELSE now() - interval '1 day' END,
       now() - c.ago
FROM (VALUES
  (1, 'Bus running late',        'The bus has been 20 minutes late this whole week.',        'unread',   NULL,                                     interval '6 hours'),
  (2, 'Homework load too high',  'My child gets 3+ hours of homework daily in class 8.',     'read',     NULL,                                     interval '2 days'),
  (3, 'Water cooler not working','First floor water cooler has been broken for a week.',    'resolved', 'Thank you for reporting. It has been repaired.', interval '5 days')
) AS c(n, subj, descr, st, reply, ago)
JOIN seed_stu2 s2 ON s2.n = c.n;

INSERT INTO feedback_templates (branch_id, name, fields)
VALUES ((SELECT id FROM branches LIMIT 1), 'Parent Satisfaction Survey',
        '[{"id":"q1","type":"rating","label":"Teaching quality","max":5},
          {"id":"q2","type":"rating","label":"School communication","max":5},
          {"id":"q3","type":"text","label":"Suggestions for improvement"}]');

INSERT INTO feedback_campaigns (branch_id, template_id, title, status)
VALUES ((SELECT id FROM branches LIMIT 1), (SELECT id FROM feedback_templates LIMIT 1),
        'Term 1 Parent Survey - July 2026', 'open');

INSERT INTO feedback_responses (campaign_id, parent_id, answers, created_at)
SELECT (SELECT id FROM feedback_campaigns LIMIT 1), s2.parent_profile_id,
       jsonb_build_object('q1', (s2.n % 5) + 1, 'q2', ((s2.n * 3) % 5) + 1, 'q3', 'Overall good progress.'),
       now() - make_interval(days => (s2.n % 7)::int)
FROM seed_stu2 s2 WHERE s2.n % 10 = 0;

-- ---------- 18. POSTS ----------
INSERT INTO post_folders (branch_id, name, created_by)
SELECT (SELECT id FROM branches LIMIT 1), f, (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1)
FROM unnest(ARRAY['Announcements','Events','Achievements']) f;

INSERT INTO posts (branch_id, folder_id, author_id, description, created_at)
SELECT (SELECT id FROM branches LIMIT 1),
       (SELECT id FROM post_folders WHERE name = p.folder),
       (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1),
       p.descr, now() - p.ago
FROM (VALUES
  ('Announcements', 'School reopens for AY 2026-27. Welcome back students!',            interval '45 days'),
  ('Events',        'Independence Day celebrations on August 15th. All are invited.',   interval '3 days'),
  ('Achievements',  'Our students won the district science fair! Congratulations!',    interval '1 day')
) AS p(folder, descr, ago);

INSERT INTO post_reactions (post_id, profile_id, reaction)
SELECT po.id, s2.parent_profile_id,
       (ARRAY['like','celebrate','heart'])[(s2.n % 3) + 1]
FROM posts po CROSS JOIN seed_stu2 s2
WHERE s2.n % 9 = 0;

-- ---------- 19. ADMISSIONS (2 pending applications) ----------
INSERT INTO admissions (branch_id, academic_year, admitted_class_id, student_full_name, date_of_birth, gender,
                        address, father_name, father_occupation, father_contact,
                        mother_name, mother_contact, emergency_name, emergency_relationship, emergency_phone,
                        documents, declaration_accepted, created_by)
SELECT (SELECT id FROM branches LIMIT 1), '2026-27', m.class_id, a.sname, a.dob, a.g,
       a.addr, a.fname, a.focc, a.fphone, a.mname, a.mphone, a.fname, 'Father', a.fphone,
       '{"birth_certificate": true, "transfer_certificate": true}', true,
       (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1)
FROM (VALUES
  ('Tanvi Kulkarni', DATE '2019-08-12', 'female', 'Plot 44, Madhapur',  'Sanjay Kulkarni', 'Engineer', '9822000111', 'Asha Kulkarni', '9822000112', 5,  'A'),
  ('Ayaan Khan',     DATE '2012-02-27', 'male',   'Road 2, Banjara Hills','Imran Khan',    'Business', '9822000113', 'Nazia Khan',   '9822000114', 9,  'B')
) AS a(sname, dob, g, addr, fname, focc, fphone, mname, mphone, cls, sec)
JOIN seed_map m ON m.class_number = a.cls AND m.section = a.sec;

-- ---------- 20. NOTIFICATIONS (fan-out) ----------
INSERT INTO notifications (branch_id, title, body, priority, source, created_by, created_at)
VALUES ((SELECT id FROM branches LIMIT 1), 'Welcome to AY 2026-27',
        'The new academic year has begun. Check the timetable and fee schedule in the app.',
        'standard', 'broadcast', (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1), now() - interval '40 days'),
       ((SELECT id FROM branches LIMIT 1), 'PTM on August 1st',
        'Parent-Teacher Meeting on Saturday, August 1st, 10 AM - 1 PM.',
        'important', 'broadcast', (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1), now() - interval '1 day');

-- notification 1 -> everyone; notification 2 -> parents only; ~25% already read
INSERT INTO notification_recipients (notification_id, profile_id, is_read, read_at)
SELECT n.id, p.id, (p.id % 4 = 0), CASE WHEN p.id % 4 = 0 THEN now() - interval '2 hours' ELSE NULL END
FROM notifications n CROSS JOIN profiles p
WHERE (n.title = 'Welcome to AY 2026-27' AND p.role IN ('parent','teacher','admin'))
   OR (n.title = 'PTM on August 1st' AND p.role = 'parent');

-- ---------- 21. TIMETABLE (template + published timetable + slots for ALL classes) ----------
INSERT INTO timetable_templates (branch_id, name, structure, created_by)
VALUES ((SELECT id FROM branches LIMIT 1), 'Standard 8-Period Day',
        '{"periods": 8, "labels": ["09:00","09:45","10:30","11:15","12:00","12:45","14:00","14:45"], "lunch_after": 6}',
        (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1));

INSERT INTO timetables (branch_id, class_id, academic_year, status, time_labels, published_by)
SELECT (SELECT id FROM branches LIMIT 1), m.class_id, '2026-27', 'published',
       '["09:00","09:45","10:30","11:15","12:00","12:45","14:00","14:45"]',
       (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1)
FROM seed_map m;

-- Mon-Sat (1-6), 8 periods; teacher formula guarantees NO teacher is in two classes in the same period
INSERT INTO timetable_slots (timetable_id, day_of_week, period_index, teacher_id, subject_id)
SELECT tt.id, d.day, p.period,
       tp.id,
       (SELECT subject_id FROM seed_subj WHERE subj_ord = ((d.day + p.period + m.class_ord) % 6) + 1)
FROM timetables tt
JOIN seed_map m ON m.class_id = tt.class_id
CROSS JOIN generate_series(1,6) AS d(day)
CROSS JOIN generate_series(1,8) AS p(period)
JOIN profiles tp ON tp.phone_number = '90000001' || lpad((((p.period + m.class_ord) % 20) + 1)::text, 2, '0');

-- ---------- 22. LEAVES ----------
-- teacher 1: approved 2-day casual leave (matches the Jul 20 on_leave day + used_leaves)
INSERT INTO leave_requests (profile_id, branch_id, start_date, end_date, total_days, reason_type,
                            description, status, reviewed_by, reviewed_at, created_at)
SELECT p.id, (SELECT id FROM branches LIMIT 1), DATE '2026-07-20', DATE '2026-07-21', 2, 'casual',
       'Family function out of town.', 'approved',
       (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1), now() - interval '8 days', now() - interval '10 days'
FROM profiles p WHERE p.phone_number = '9000000101';

UPDATE staff_details SET used_leaves = 2
WHERE profile_id = (SELECT id FROM profiles WHERE phone_number = '9000000101');

-- teacher 2: pending request
INSERT INTO leave_requests (profile_id, branch_id, start_date, end_date, total_days, reason_type, description, status)
SELECT p.id, (SELECT id FROM branches LIMIT 1), DATE '2026-07-28', DATE '2026-07-28', 1, 'health',
       'Doctor appointment.', 'pending'
FROM profiles p WHERE p.phone_number = '9000000102';

-- ---------- 23. PROFILE CHANGE REQUEST (1 pending) ----------
INSERT INTO profile_change_requests (profile_id, changes, status)
SELECT p.id, '{"phone_number": "9899999901"}', 'pending'
FROM profiles p WHERE p.phone_number = '9810000005';

-- ---------- 24. DEVICE TOKENS (2 dummy web-push rows) ----------
INSERT INTO device_tokens (profile_id, subscription)
SELECT p.id, jsonb_build_object('endpoint', 'https://example.invalid/push/demo-' || p.id,
                                'keys', jsonb_build_object('p256dh', 'demo', 'auth', 'demo'))
FROM profiles p WHERE p.phone_number IN ('9810000001', '9810000002');

-- ---------- 25. AUDIT LOG (login + real fee payments) ----------
INSERT INTO audit_logs (branch_id, actor_id, action, entity_type, entity_id, details, created_at)
SELECT (SELECT id FROM branches LIMIT 1), (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1),
       'auth.admin_login', 'profile', (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1),
       '{"ip": "127.0.0.1"}', now() - interval '1 hour';

INSERT INTO audit_logs (branch_id, actor_id, action, entity_type, entity_id, details, created_at)
SELECT (SELECT id FROM branches LIMIT 1), r.received_by, 'fee.payment', 'fee', r.fee_id,
       jsonb_build_object('amount_paid', r.amount_paid, 'mode', r.payment_mode, 'receipt_number', r.receipt_number),
       r.created_at
FROM receipts r ORDER BY r.id LIMIT 25;

COMMIT;

-- (statistics refresh removed: optional, and it produced harmless permission warnings)

-- ---------- SUMMARY ----------
SELECT 'branches' AS tbl, count(*) FROM branches
UNION ALL SELECT 'profiles (all logins)', count(*) FROM profiles
UNION ALL SELECT 'classes', count(*) FROM classes
UNION ALL SELECT 'students', count(*) FROM students
UNION ALL SELECT 'student_enrollments', count(*) FROM student_enrollments
UNION ALL SELECT 'subjects', count(*) FROM subjects
UNION ALL SELECT 'teacher_class_assignments', count(*) FROM teacher_class_assignments
UNION ALL SELECT 'school_calendar', count(*) FROM school_calendar
UNION ALL SELECT 'student_attendance', count(*) FROM student_attendance
UNION ALL SELECT 'attendance_submissions', count(*) FROM attendance_submissions
UNION ALL SELECT 'staff_attendance', count(*) FROM staff_attendance
UNION ALL SELECT 'exams', count(*) FROM exams
UNION ALL SELECT 'exam_subjects', count(*) FROM exam_subjects
UNION ALL SELECT 'marks', count(*) FROM marks
UNION ALL SELECT 'fees', count(*) FROM fees
UNION ALL SELECT 'fee_installments', count(*) FROM fee_installments
UNION ALL SELECT 'receipts', count(*) FROM receipts
UNION ALL SELECT 'buses', count(*) FROM buses
UNION ALL SELECT 'bus_assignments', count(*) FROM bus_assignments
UNION ALL SELECT 'bus_alarms', count(*) FROM bus_alarms
UNION ALL SELECT 'groups', count(*) FROM groups
UNION ALL SELECT 'group_members', count(*) FROM group_members
UNION ALL SELECT 'messages', count(*) FROM messages
UNION ALL SELECT 'message_reactions', count(*) FROM message_reactions
UNION ALL SELECT 'complaints', count(*) FROM complaints
UNION ALL SELECT 'feedback_templates', count(*) FROM feedback_templates
UNION ALL SELECT 'feedback_campaigns', count(*) FROM feedback_campaigns
UNION ALL SELECT 'feedback_responses', count(*) FROM feedback_responses
UNION ALL SELECT 'post_folders', count(*) FROM post_folders
UNION ALL SELECT 'posts', count(*) FROM posts
UNION ALL SELECT 'post_reactions', count(*) FROM post_reactions
UNION ALL SELECT 'admissions', count(*) FROM admissions
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'notification_recipients', count(*) FROM notification_recipients
UNION ALL SELECT 'timetable_templates', count(*) FROM timetable_templates
UNION ALL SELECT 'timetables', count(*) FROM timetables
UNION ALL SELECT 'timetable_slots', count(*) FROM timetable_slots
UNION ALL SELECT 'leave_requests', count(*) FROM leave_requests
UNION ALL SELECT 'profile_change_requests', count(*) FROM profile_change_requests
UNION ALL SELECT 'device_tokens', count(*) FROM device_tokens
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
ORDER BY 1;
