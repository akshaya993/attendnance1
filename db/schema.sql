-- ============================================================
-- ONE DATABASE: PostgreSQL 16+. No MongoDB. (See Part B, change #1)
-- ============================================================

-- ---------- CORE ----------
CREATE TABLE branches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  role TEXT NOT NULL CHECK (role IN ('admin','teacher','parent','bus')),
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL UNIQUE,       -- login ID (10 digits)
  email TEXT,
  address TEXT,
  photo_url TEXT,
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  failed_login_attempts SMALLINT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_branch_role ON profiles(branch_id, role);

CREATE TABLE subjects (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  subject_name TEXT NOT NULL,
  UNIQUE (branch_id, subject_name)
);

CREATE TABLE classes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  class_number SMALLINT NOT NULL,          -- 1..12
  section TEXT NOT NULL,                   -- 'A', 'B'...
  UNIQUE (branch_id, class_number, section)
);

CREATE TABLE students (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  class_id BIGINT NOT NULL REFERENCES classes(id),
  parent_profile_id BIGINT NOT NULL REFERENCES profiles(id),
  full_name TEXT NOT NULL,
  roll_number INTEGER NOT NULL,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male','female','other')),
  address TEXT,
  photo_url TEXT,
  admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,  -- v1.1: false after graduation/leaving
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, roll_number)
);
CREATE INDEX idx_students_class ON students(class_id);
CREATE INDEX idx_students_parent ON students(parent_profile_id);

-- v1.1 — Enrollment HISTORY: one row per student per academic year.
-- students.class_id stays as the fast "current class" pointer;
-- this table is the permanent record that survives promotions.
CREATE TABLE student_enrollments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id),
  class_id BIGINT NOT NULL REFERENCES classes(id),
  academic_year TEXT NOT NULL,
  roll_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','promoted','detained','graduated','left')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year)        -- also makes running promotion twice impossible
);
CREATE INDEX idx_enroll_class_year ON student_enrollments(class_id, academic_year);

CREATE TABLE teacher_class_assignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES profiles(id),
  class_id BIGINT NOT NULL REFERENCES classes(id),
  subject_id BIGINT NOT NULL REFERENCES subjects(id),
  is_class_teacher BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (teacher_id, class_id, subject_id)
);
CREATE INDEX idx_tca_class ON teacher_class_assignments(class_id);

CREATE TABLE staff_details (
  profile_id BIGINT PRIMARY KEY REFERENCES profiles(id),
  employee_id TEXT UNIQUE,
  core_subject_id BIGINT REFERENCES subjects(id),
  total_annual_leaves SMALLINT NOT NULL DEFAULT 12,
  used_leaves SMALLINT NOT NULL DEFAULT 0   -- balance is ALWAYS total - used (derived, never stored)
);

CREATE TABLE school_calendar (
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  date DATE NOT NULL,
  is_working_day BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (branch_id, date)             -- your version had PK on date alone: broken for 2+ branches
);

-- ---------- AUTH (Feature 13) ----------
CREATE TABLE otp_codes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone_number TEXT NOT NULL,
  code_hash TEXT NOT NULL,                  -- bcrypt hash; the code itself is never stored
  purpose TEXT NOT NULL CHECK (purpose IN ('reset','first_login')),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone ON otp_codes(phone_number, created_at DESC);

-- ---------- ATTENDANCE (Feature 01) ----------
-- Absent-only storage: ~5 rows/class/day instead of 60. 90% fewer rows by design.
CREATE TABLE student_attendance (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id),
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'absent' CHECK (status IN ('absent','late','half_day')),  -- v1.1: still exception-only — present students have NO row
  recorded_by BIGINT NOT NULL REFERENCES profiles(id),
  UNIQUE (student_id, date)                 -- doubles as the lookup index
);
CREATE INDEX idx_att_date ON student_attendance(date);

-- PRECOMPUTED: "did class X submit today?" without counting rows (see Part C)
CREATE TABLE attendance_submissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES classes(id),
  date DATE NOT NULL,
  marked_by BIGINT NOT NULL REFERENCES profiles(id),
  absent_count SMALLINT NOT NULL DEFAULT 0,
  modified_count SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, date)
);

CREATE TABLE staff_attendance (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES profiles(id),
  date DATE NOT NULL,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','on_leave','half_day')),
  UNIQUE (teacher_id, date)
);

-- ---------- LEAVES (Feature 06) ----------
CREATE TABLE leave_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id BIGINT NOT NULL REFERENCES profiles(id),
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days SMALLINT NOT NULL,
  reason_type TEXT NOT NULL CHECK (reason_type IN ('casual','health','emergency')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by BIGINT REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leaves_pending ON leave_requests(branch_id) WHERE status = 'pending';
CREATE INDEX idx_leaves_range ON leave_requests(branch_id, start_date, end_date) ;

-- ---------- MARKS (Feature 07) ----------
CREATE TABLE exams (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  exam_name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  is_main_exam BOOLEAN NOT NULL DEFAULT false
);

-- THE table your schema was missing: without max/pass marks,
-- percentages, GPA and failure lists are mathematically impossible.
CREATE TABLE exam_subjects (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES exams(id),
  class_id BIGINT NOT NULL REFERENCES classes(id),
  subject_id BIGINT NOT NULL REFERENCES subjects(id),
  max_marks NUMERIC(6,2) NOT NULL,
  pass_marks NUMERIC(6,2) NOT NULL,
  UNIQUE (exam_id, class_id, subject_id)
);

CREATE TABLE marks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES exams(id),
  student_id BIGINT NOT NULL REFERENCES students(id),
  subject_id BIGINT NOT NULL REFERENCES subjects(id),
  score NUMERIC(6,2) NOT NULL DEFAULT 0,
  UNIQUE (exam_id, student_id, subject_id)  -- makes saving marks an UPSERT + is the hot index
);
CREATE INDEX idx_marks_student ON marks(student_id);

-- ---------- FEES (Feature 04) ----------
CREATE TABLE fees (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id),
  category TEXT NOT NULL CHECK (category IN ('tuition','bus','books','dress')),
  academic_year TEXT NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL,
  balance_due NUMERIC(10,2) NOT NULL,       -- PRECOMPUTED running balance (Part C)
  UNIQUE (student_id, category, academic_year)
);
CREATE INDEX idx_fees_due ON fees(student_id) WHERE balance_due > 0;   -- partial: dues lists never scan paid rows

CREATE TABLE receipts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_number BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 100001),
  fee_id BIGINT NOT NULL REFERENCES fees(id),
  amount_paid NUMERIC(10,2) NOT NULL CHECK (amount_paid > 0),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash','card','upi')),
  received_by BIGINT NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_receipts_day ON receipts(created_at);  -- "today's collections" = range scan on this

-- v1.1 — Installment SCHEDULE per fee (e.g. Term 1 / Term 2 / Term 3).
-- Paid-status is DERIVED: cumulative receipts vs cumulative due — never stored.
CREATE TABLE fee_installments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fee_id BIGINT NOT NULL REFERENCES fees(id),
  installment_number SMALLINT NOT NULL,
  label TEXT NOT NULL,                      -- 'Term 1', 'Term 2', ...
  due_date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  UNIQUE (fee_id, installment_number)
);
CREATE INDEX idx_installments_due ON fee_installments(due_date);

-- ---------- BUS (Feature 02) ----------
CREATE TABLE buses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  profile_id BIGINT UNIQUE REFERENCES profiles(id),  -- the bus login account
  bus_name TEXT NOT NULL,
  route_name TEXT,
  is_sharing BOOLEAN NOT NULL DEFAULT false,
  last_lat DOUBLE PRECISION,               -- telemetry updated IN PLACE: 1 row per bus,
  last_lng DOUBLE PRECISION,               -- never 1 row per ping (Part B, change #6)
  last_ping_at TIMESTAMPTZ
) WITH (fillfactor = 70);                  -- headroom for constant same-row updates (HOT updates)

CREATE TABLE bus_assignments (
  student_id BIGINT PRIMARY KEY REFERENCES students(id),
  bus_id BIGINT NOT NULL REFERENCES buses(id)
);
CREATE INDEX idx_bus_assign_bus ON bus_assignments(bus_id);

CREATE TABLE bus_alarms (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bus_id BIGINT NOT NULL REFERENCES buses(id),
  parent_id BIGINT NOT NULL REFERENCES profiles(id),
  threshold_minutes SMALLINT NOT NULL CHECK (threshold_minutes IN (10,20)),
  parent_lat DOUBLE PRECISION NOT NULL,     -- your version stored "lat,lng" in one VARCHAR: unusable for math
  parent_lng DOUBLE PRECISION NOT NULL,
  fired_on DATE,                            -- anti-spam: fire once per day
  UNIQUE (bus_id, parent_id)
);

CREATE TABLE device_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id BIGINT NOT NULL REFERENCES profiles(id),
  subscription JSONB NOT NULL,              -- web-push subscription
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, subscription)
);

-- ---------- GROUPS & MESSAGES (Feature 05) — was MongoDB ----------
CREATE TABLE groups (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  type TEXT NOT NULL CHECK (type IN ('class','staff','direct')),
  class_id BIGINT REFERENCES classes(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_groups_branch ON groups(branch_id);

CREATE TABLE group_members (
  group_id BIGINT NOT NULL REFERENCES groups(id),
  profile_id BIGINT NOT NULL REFERENCES profiles(id),
  can_message BOOLEAN NOT NULL DEFAULT false,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- replaces stored unread_count (Part B, change #7)
  PRIMARY KEY (group_id, profile_id)
);
CREATE INDEX idx_gm_profile ON group_members(profile_id);

CREATE TABLE messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES groups(id),
  sender_id BIGINT NOT NULL REFERENCES profiles(id),
  content TEXT,
  image_url TEXT,
  is_notice BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- THE one index that matters for chat; also serves unread counts via last_read_at
CREATE INDEX idx_messages_group_time ON messages(group_id, created_at DESC);

CREATE TABLE message_reactions (
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  profile_id BIGINT NOT NULL REFERENCES profiles(id),
  emoji TEXT NOT NULL,
  PRIMARY KEY (message_id, profile_id)
);

-- ---------- COMPLAINTS & FEEDBACK (Feature 03) — was MongoDB ----------
CREATE TABLE complaints (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  parent_id BIGINT NOT NULL REFERENCES profiles(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','resolved')),
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  admin_reply TEXT,
  replied_by BIGINT REFERENCES profiles(id),
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_complaints_open ON complaints(branch_id, created_at DESC) WHERE status <> 'resolved';

CREATE TABLE feedback_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  fields JSONB NOT NULL,                    -- question definitions: JSONB is the right tool here
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feedback_campaigns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  template_id BIGINT NOT NULL REFERENCES feedback_templates(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feedback_responses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES feedback_campaigns(id),
  parent_id BIGINT NOT NULL REFERENCES profiles(id),
  answers JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, parent_id)
);

-- ---------- POSTS (Feature 12) — was MongoDB ----------
CREATE TABLE post_folders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  created_by BIGINT NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, name)
);

CREATE TABLE posts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  folder_id BIGINT REFERENCES post_folders(id),
  author_id BIGINT NOT NULL REFERENCES profiles(id),
  description TEXT NOT NULL DEFAULT '',
  image_path TEXT,                          -- file on disk; NEVER image bytes in the DB
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX idx_posts_feed ON posts(branch_id, created_at DESC);

CREATE TABLE post_reactions (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  profile_id BIGINT NOT NULL REFERENCES profiles(id),
  reaction TEXT NOT NULL CHECK (reaction IN ('like','celebrate','heart')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, profile_id)
);

-- ---------- ADMISSIONS (Feature 08) — was MongoDB blob ----------
CREATE TABLE admissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  student_id BIGINT REFERENCES students(id),
  parent_profile_id BIGINT REFERENCES profiles(id),
  academic_year TEXT NOT NULL,
  admitted_class_id BIGINT NOT NULL REFERENCES classes(id),
  student_full_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male','female','other')),
  nationality TEXT, address TEXT, student_contact_number TEXT, email TEXT,
  last_school TEXT, class_last_studied TEXT, medium_of_instruction TEXT, previous_grade TEXT,
  father_name TEXT, father_occupation TEXT, father_contact TEXT NOT NULL,
  mother_name TEXT, mother_occupation TEXT, mother_contact TEXT,
  guardian_name TEXT, guardian_relationship TEXT, guardian_contact TEXT,
  emergency_name TEXT, emergency_relationship TEXT, emergency_phone TEXT,
  documents JSONB NOT NULL DEFAULT '{}',    -- checkbox flags only; never government ID numbers
  primary_language TEXT, secondary_language TEXT,
  declaration_accepted BOOLEAN NOT NULL DEFAULT false,
  created_by BIGINT NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admissions_branch_year ON admissions(branch_id, academic_year);

-- ---------- NOTIFICATIONS (Feature 09) ----------
CREATE TABLE notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'standard' CHECK (priority IN ('standard','important','urgent')),
  source TEXT NOT NULL DEFAULT 'broadcast',
  link_url TEXT,
  created_by BIGINT REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PRECOMPUTED fan-out: the unread badge is a partial-index count, the cheapest hot query in the app
CREATE TABLE notification_recipients (
  notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  profile_id BIGINT NOT NULL REFERENCES profiles(id),
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  PRIMARY KEY (notification_id, profile_id)
);
CREATE INDEX idx_notif_unread ON notification_recipients(profile_id) WHERE is_read = false;

-- ---------- TIMETABLE (Feature 10) ----------
CREATE TABLE timetable_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  structure JSONB NOT NULL,                 -- periods/breaks/durations/labels
  created_by BIGINT NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, name)
);

CREATE TABLE timetables (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  class_id BIGINT NOT NULL REFERENCES classes(id),
  academic_year TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','archived')),
  time_labels JSONB NOT NULL,
  published_by BIGINT NOT NULL REFERENCES profiles(id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_timetable_live ON timetables(class_id, academic_year) WHERE status = 'published';

CREATE TABLE timetable_slots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timetable_id BIGINT NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),  -- was VARCHAR 'Monday': 2 bytes vs 9+, sortable
  period_index SMALLINT NOT NULL,
  teacher_id BIGINT NOT NULL REFERENCES profiles(id),
  subject_id BIGINT NOT NULL REFERENCES subjects(id),
  UNIQUE (timetable_id, day_of_week, period_index)
);
CREATE INDEX idx_slots_teacher ON timetable_slots(teacher_id);  -- teacher availability + conflict checks

-- ---------- PROFILE CHANGE REQUESTS (Feature 11) ----------
CREATE TABLE profile_change_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id BIGINT NOT NULL REFERENCES profiles(id),
  changes JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by BIGINT REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pcr_pending ON profile_change_requests(status) WHERE status = 'pending';

-- ---------- AUDIT LOG (v1.1, cross-cutting) ----------
-- Written by lib/audit.js on SENSITIVE mutations only (money, marks overrides,
-- deletes, promotions, admin overrides, logins). Never on reads.
CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  actor_id BIGINT REFERENCES profiles(id),
  action TEXT NOT NULL,                     -- 'fee.payment', 'marks.override', 'post.delete', 'promotion.run', ...
  entity_type TEXT NOT NULL,                -- 'fee', 'student', 'post', ...
  entity_id BIGINT,
  details JSONB NOT NULL DEFAULT '{}',      -- before/after values
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_branch_time ON audit_logs(branch_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
