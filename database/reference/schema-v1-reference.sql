-- SAMS Library Management System
-- PostgreSQL Schema v1.0
-- Generated from DATABASE_DESIGN_v1.md / DATABASE_RULES.md

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== ENUMS =====
CREATE TYPE academic_status AS ENUM ('ACTIVE','GRADUATED','SUSPENDED','INACTIVE');
CREATE TYPE item_type AS ENUM ('BOOK','THESIS','PROJECT');
CREATE TYPE contributor_role AS ENUM ('AUTHOR','RESEARCHER','SUPERVISOR','PROJECT_MEMBER');
CREATE TYPE copy_status AS ENUM ('AVAILABLE','RESERVED','BORROWED','UNAVAILABLE','DAMAGED','LOST','ARCHIVED');
CREATE TYPE copy_condition AS ENUM ('GOOD','FAIR','DAMAGED');
CREATE TYPE reservation_status AS ENUM ('PENDING','ACTIVE','FULFILLED','CANCELLED','EXPIRED');
CREATE TYPE borrowing_status AS ENUM ('ACTIVE','RETURNED','LOST');
CREATE TYPE visit_source AS ENUM ('MANUAL','BARCODE','QR');

-- ===== IDENTITY =====
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_email VARCHAR NOT NULL UNIQUE,
  external_auth_id VARCHAR UNIQUE,
  display_name VARCHAR NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE roles (
  id SMALLSERIAL PRIMARY KEY,
  name VARCHAR NOT NULL UNIQUE
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role_id SMALLINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  PRIMARY KEY (user_id, role_id)
);

-- ===== UNIVERSITY STRUCTURE =====
CREATE TABLE faculties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID NOT NULL REFERENCES faculties(id) ON DELETE RESTRICT,
  name VARCHAR NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (faculty_id, name)
);

CREATE TABLE students (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  student_id VARCHAR NOT NULL UNIQUE,
  faculty_id UUID REFERENCES faculties(id) ON DELETE RESTRICT,
  department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
  academic_status academic_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR NOT NULL UNIQUE,
  name VARCHAR NOT NULL,
  location VARCHAR,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== CATALOG =====
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE dewey_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR NOT NULL UNIQUE,
  name VARCHAR,
  parent_id UUID REFERENCES dewey_classifications(id) ON DELETE RESTRICT
);

CREATE TABLE library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type item_type NOT NULL,
  title VARCHAR NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  dewey_classification_id UUID REFERENCES dewey_classifications(id) ON DELETE RESTRICT,
  dewey_code_raw VARCHAR,
  call_number VARCHAR,
  language VARCHAR,
  publication_year SMALLINT,
  abstract_description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE book_details (
  item_id UUID PRIMARY KEY REFERENCES library_items(id) ON DELETE CASCADE,
  isbn VARCHAR,
  publisher VARCHAR,
  edition VARCHAR
);

CREATE TABLE academic_work_details (
  item_id UUID PRIMARY KEY REFERENCES library_items(id) ON DELETE CASCADE,
  faculty_id UUID REFERENCES faculties(id) ON DELETE RESTRICT,
  department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
  academic_year VARCHAR,
  work_type item_type NOT NULL CHECK (work_type IN ('THESIS','PROJECT'))
);

CREATE TABLE contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR NOT NULL
);

CREATE TABLE item_contributors (
  item_id UUID NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES contributors(id) ON DELETE RESTRICT,
  role contributor_role NOT NULL,
  PRIMARY KEY (item_id, contributor_id, role)
);

-- ===== INVENTORY =====
CREATE TABLE physical_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES library_items(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  copy_code VARCHAR,
  barcode VARCHAR UNIQUE,
  shelf_location VARCHAR,
  status copy_status NOT NULL DEFAULT 'AVAILABLE',
  condition copy_condition,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== OPERATIONS =====
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(user_id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES library_items(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  allocated_copy_id UUID REFERENCES physical_copies(id) ON DELETE RESTRICT,
  status reservation_status NOT NULL DEFAULT 'PENDING',
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  fulfilled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > reserved_at),
  CHECK (fulfilled_at IS NULL OR fulfilled_at >= reserved_at),
  CHECK (cancelled_at IS NULL OR cancelled_at >= reserved_at),
  CHECK (status <> 'ACTIVE' OR allocated_copy_id IS NOT NULL)
);

CREATE TABLE borrowings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(user_id) ON DELETE RESTRICT,
  copy_id UUID NOT NULL REFERENCES physical_copies(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  reservation_id UUID UNIQUE REFERENCES reservations(id) ON DELETE RESTRICT,
  borrowed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NOT NULL,
  returned_at TIMESTAMPTZ,
  checked_out_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  returned_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  status borrowing_status NOT NULL DEFAULT 'ACTIVE',
  return_condition VARCHAR,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (due_at > borrowed_at),
  CHECK (returned_at IS NULL OR returned_at >= borrowed_at),
  CHECK (status <> 'RETURNED' OR returned_at IS NOT NULL)
);

CREATE TABLE library_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(user_id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_out_at TIMESTAMPTZ,
  registered_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  checkout_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  source visit_source NOT NULL DEFAULT 'MANUAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (checked_out_at IS NULL OR checked_out_at >= checked_in_at)
);

CREATE TABLE circulation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  item_type item_type,
  loan_days INTEGER NOT NULL CHECK (loan_days >= 0),
  reservation_hold_hours INTEGER NOT NULL CHECK (reservation_hold_hours >= 0),
  max_active_loans INTEGER NOT NULL CHECK (max_active_loans >= 0),
  max_active_reservations INTEGER NOT NULL CHECK (max_active_reservations >= 0),
  renewal_limit INTEGER NOT NULL DEFAULT 0 CHECK (renewal_limit >= 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR NOT NULL,
  entity_type VARCHAR NOT NULL,
  entity_id VARCHAR NOT NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  request_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE idempotency_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation VARCHAR NOT NULL,
  result_reference VARCHAR,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, operation, key),
  CHECK (expires_at > created_at)
);

-- ===== INDEXES =====
CREATE INDEX idx_departments_faculty ON departments(faculty_id);
CREATE INDEX idx_students_faculty ON students(faculty_id);
CREATE INDEX idx_students_department ON students(department_id);
CREATE INDEX idx_dewey_parent ON dewey_classifications(parent_id);

CREATE INDEX idx_library_items_title ON library_items(title);
CREATE INDEX idx_library_items_type ON library_items(type);
CREATE INDEX idx_library_items_category ON library_items(category_id);
CREATE INDEX idx_library_items_dewey ON library_items(dewey_classification_id);
CREATE INDEX idx_library_items_call_number ON library_items(call_number);
CREATE INDEX idx_book_details_isbn ON book_details(isbn);
CREATE INDEX idx_contributors_full_name ON contributors(full_name);

CREATE INDEX idx_physical_copies_item ON physical_copies(item_id);
CREATE INDEX idx_physical_copies_branch ON physical_copies(branch_id);
CREATE INDEX idx_physical_copies_status ON physical_copies(status);
CREATE INDEX idx_physical_copies_lookup
  ON physical_copies(item_id, branch_id, status);

CREATE INDEX idx_reservations_student ON reservations(student_id);
CREATE INDEX idx_reservations_item ON reservations(item_id);
CREATE INDEX idx_reservations_branch ON reservations(branch_id);
CREATE INDEX idx_reservations_status_expiry ON reservations(status, expires_at);

CREATE INDEX idx_borrowings_student ON borrowings(student_id);
CREATE INDEX idx_borrowings_copy ON borrowings(copy_id);
CREATE INDEX idx_borrowings_branch ON borrowings(branch_id);
CREATE INDEX idx_borrowings_status ON borrowings(status);
CREATE INDEX idx_borrowings_due_at ON borrowings(due_at);

CREATE INDEX idx_visits_student ON library_visits(student_id);
CREATE INDEX idx_visits_branch ON library_visits(branch_id);
CREATE INDEX idx_visits_checked_in ON library_visits(checked_in_at);

CREATE INDEX idx_policies_scope ON circulation_policies(branch_id, item_type);
CREATE INDEX idx_audit_actor ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_branch ON audit_logs(branch_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX idx_idempotency_expires ON idempotency_records(expires_at);

-- Partial uniqueness / concurrency guards
CREATE UNIQUE INDEX uq_reservation_student_item_active
  ON reservations(student_id, item_id)
  WHERE status IN ('PENDING','ACTIVE');

CREATE UNIQUE INDEX uq_reservation_allocated_copy_active
  ON reservations(allocated_copy_id)
  WHERE allocated_copy_id IS NOT NULL AND status = 'ACTIVE';

CREATE UNIQUE INDEX uq_borrowing_copy_active
  ON borrowings(copy_id)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX uq_open_visit_per_student
  ON library_visits(student_id)
  WHERE checked_out_at IS NULL;

-- ===== VALIDATION TRIGGERS =====

-- Keep student faculty and department consistent when both are set.
CREATE OR REPLACE FUNCTION validate_student_department_faculty()
RETURNS TRIGGER AS $$
DECLARE dep_faculty UUID;
BEGIN
  IF NEW.department_id IS NOT NULL AND NEW.faculty_id IS NOT NULL THEN
    SELECT faculty_id INTO dep_faculty FROM departments WHERE id = NEW.department_id;
    IF dep_faculty IS DISTINCT FROM NEW.faculty_id THEN
      RAISE EXCEPTION 'Student department does not belong to selected faculty';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_student_department_faculty
BEFORE INSERT OR UPDATE OF faculty_id, department_id ON students
FOR EACH ROW EXECUTE FUNCTION validate_student_department_faculty();

-- Book detail must belong to BOOK.
CREATE OR REPLACE FUNCTION validate_book_details_type()
RETURNS TRIGGER AS $$
DECLARE t item_type;
BEGIN
  SELECT type INTO t FROM library_items WHERE id = NEW.item_id;
  IF t <> 'BOOK' THEN
    RAISE EXCEPTION 'book_details can only reference BOOK items';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_book_details_type
BEFORE INSERT OR UPDATE OF item_id ON book_details
FOR EACH ROW EXECUTE FUNCTION validate_book_details_type();

-- Academic detail must match THESIS/PROJECT.
CREATE OR REPLACE FUNCTION validate_academic_work_type()
RETURNS TRIGGER AS $$
DECLARE t item_type;
DECLARE dep_faculty UUID;
BEGIN
  SELECT type INTO t FROM library_items WHERE id = NEW.item_id;
  IF t NOT IN ('THESIS','PROJECT') OR t <> NEW.work_type THEN
    RAISE EXCEPTION 'academic_work_details type must match THESIS or PROJECT library item';
  END IF;

  IF NEW.department_id IS NOT NULL AND NEW.faculty_id IS NOT NULL THEN
    SELECT faculty_id INTO dep_faculty FROM departments WHERE id = NEW.department_id;
    IF dep_faculty IS DISTINCT FROM NEW.faculty_id THEN
      RAISE EXCEPTION 'Academic work department does not belong to selected faculty';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_academic_work_type
BEFORE INSERT OR UPDATE OF item_id, work_type, faculty_id, department_id ON academic_work_details
FOR EACH ROW EXECUTE FUNCTION validate_academic_work_type();

-- Allocated reservation copy must match item and branch.
CREATE OR REPLACE FUNCTION validate_reservation_copy()
RETURNS TRIGGER AS $$
DECLARE copy_item UUID;
DECLARE copy_branch UUID;
BEGIN
  IF NEW.allocated_copy_id IS NOT NULL THEN
    SELECT item_id, branch_id INTO copy_item, copy_branch
    FROM physical_copies
    WHERE id = NEW.allocated_copy_id;

    IF copy_item IS DISTINCT FROM NEW.item_id OR copy_branch IS DISTINCT FROM NEW.branch_id THEN
      RAISE EXCEPTION 'Allocated copy must match reservation item and branch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reservation_copy
BEFORE INSERT OR UPDATE OF allocated_copy_id, item_id, branch_id ON reservations
FOR EACH ROW EXECUTE FUNCTION validate_reservation_copy();

-- Borrowed copy must match branch; optional reservation must match student/item/branch.
CREATE OR REPLACE FUNCTION validate_borrowing_consistency()
RETURNS TRIGGER AS $$
DECLARE copy_branch UUID;
DECLARE copy_item UUID;
DECLARE res_student UUID;
DECLARE res_item UUID;
DECLARE res_branch UUID;
DECLARE res_status reservation_status;
BEGIN
  SELECT branch_id, item_id INTO copy_branch, copy_item
  FROM physical_copies WHERE id = NEW.copy_id;

  IF copy_branch IS DISTINCT FROM NEW.branch_id THEN
    RAISE EXCEPTION 'Borrowing branch must match physical copy branch';
  END IF;

  IF NEW.reservation_id IS NOT NULL THEN
    SELECT student_id, item_id, branch_id, status
      INTO res_student, res_item, res_branch, res_status
    FROM reservations WHERE id = NEW.reservation_id;

    IF res_student IS DISTINCT FROM NEW.student_id
       OR res_item IS DISTINCT FROM copy_item
       OR res_branch IS DISTINCT FROM NEW.branch_id THEN
      RAISE EXCEPTION 'Borrowing does not match referenced reservation';
    END IF;

    IF res_status NOT IN ('ACTIVE','FULFILLED') THEN
      RAISE EXCEPTION 'Referenced reservation is not borrowable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_borrowing_consistency
BEFORE INSERT OR UPDATE OF student_id, copy_id, branch_id, reservation_id ON borrowings
FOR EACH ROW EXECUTE FUNCTION validate_borrowing_consistency();

-- Keep updated_at correct even for direct SQL writes, not only Prisma Client writes.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_students_updated_at
BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_branches_updated_at
BEFORE UPDATE ON branches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_library_items_updated_at
BEFORE UPDATE ON library_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_physical_copies_updated_at
BEFORE UPDATE ON physical_copies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reservations_updated_at
BEFORE UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_borrowings_updated_at
BEFORE UPDATE ON borrowings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_library_visits_updated_at
BEFORE UPDATE ON library_visits
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===== ROLE SEED =====
INSERT INTO roles(name) VALUES
  ('STUDENT'),
  ('LIBRARIAN'),
  ('MANAGEMENT')
ON CONFLICT (name) DO NOTHING;

-- ===== ANALYTICS / REPORTING VIEWS =====

CREATE VIEW v_item_availability AS
SELECT
  li.id AS item_id,
  li.title,
  li.type,
  pc.branch_id,
  COUNT(pc.id) AS total_copies,
  COUNT(pc.id) FILTER (WHERE pc.status = 'AVAILABLE') AS available_copies,
  COUNT(pc.id) FILTER (WHERE pc.status = 'RESERVED') AS reserved_copies,
  COUNT(pc.id) FILTER (WHERE pc.status = 'BORROWED') AS borrowed_copies
FROM library_items li
LEFT JOIN physical_copies pc ON pc.item_id = li.id
GROUP BY li.id, li.title, li.type, pc.branch_id;

CREATE VIEW v_current_borrowings AS
SELECT
  b.*,
  (b.returned_at IS NULL AND b.due_at < NOW()) AS is_overdue
FROM borrowings b
WHERE b.status = 'ACTIVE';

CREATE VIEW v_overdue_borrowings AS
SELECT
  b.*,
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - b.due_at)) / 86400))::INTEGER AS days_overdue
FROM borrowings b
WHERE b.status = 'ACTIVE'
  AND b.returned_at IS NULL
  AND b.due_at < NOW();

CREATE VIEW v_active_reservations AS
SELECT *
FROM reservations
WHERE status IN ('PENDING','ACTIVE')
  AND expires_at > NOW();

CREATE VIEW v_monthly_library_visits AS
SELECT
  date_trunc('month', checked_in_at) AS month,
  branch_id,
  COUNT(*) AS visit_count,
  COUNT(DISTINCT student_id) AS unique_students
FROM library_visits
GROUP BY date_trunc('month', checked_in_at), branch_id;

COMMIT;
