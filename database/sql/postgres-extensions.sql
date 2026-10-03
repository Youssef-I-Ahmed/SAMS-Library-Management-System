-- SAMS PostgreSQL Extensions for Prisma-managed database
-- Apply after Prisma-generated base migration if schema.prisma is the source of tables.

-- Partial unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_student_item_active
  ON reservations(student_id, item_id)
  WHERE status IN ('PENDING','ACTIVE');

CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_allocated_copy_active
  ON reservations(allocated_copy_id)
  WHERE allocated_copy_id IS NOT NULL AND status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_borrowing_copy_active
  ON borrowings(copy_id)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_open_visit_per_student
  ON library_visits(student_id)
  WHERE checked_out_at IS NULL;

-- CHECK constraints
ALTER TABLE reservations
  ADD CONSTRAINT chk_reservation_expiry_after_start
  CHECK (expires_at > reserved_at);

ALTER TABLE borrowings
  ADD CONSTRAINT chk_borrowing_due_after_start
  CHECK (due_at > borrowed_at);

ALTER TABLE library_visits
  ADD CONSTRAINT chk_visit_checkout_after_checkin
  CHECK (checked_out_at IS NULL OR checked_out_at >= checked_in_at);

ALTER TABLE academic_work_details
  ADD CONSTRAINT chk_academic_work_type
  CHECK (work_type IN ('THESIS','PROJECT'));

-- Validation triggers
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

DROP TRIGGER IF EXISTS trg_student_department_faculty ON students;
CREATE TRIGGER trg_student_department_faculty
BEFORE INSERT OR UPDATE OF faculty_id, department_id ON students
FOR EACH ROW EXECUTE FUNCTION validate_student_department_faculty();

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

DROP TRIGGER IF EXISTS trg_book_details_type ON book_details;
CREATE TRIGGER trg_book_details_type
BEFORE INSERT OR UPDATE OF item_id ON book_details
FOR EACH ROW EXECUTE FUNCTION validate_book_details_type();

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

DROP TRIGGER IF EXISTS trg_academic_work_type ON academic_work_details;
CREATE TRIGGER trg_academic_work_type
BEFORE INSERT OR UPDATE OF item_id, work_type, faculty_id, department_id ON academic_work_details
FOR EACH ROW EXECUTE FUNCTION validate_academic_work_type();

CREATE OR REPLACE FUNCTION validate_reservation_copy()
RETURNS TRIGGER AS $$
DECLARE copy_item UUID;
DECLARE copy_branch UUID;
BEGIN
  IF NEW.allocated_copy_id IS NOT NULL THEN
    SELECT item_id, branch_id INTO copy_item, copy_branch
    FROM physical_copies WHERE id = NEW.allocated_copy_id;

    IF copy_item IS DISTINCT FROM NEW.item_id OR copy_branch IS DISTINCT FROM NEW.branch_id THEN
      RAISE EXCEPTION 'Allocated copy must match reservation item and branch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reservation_copy ON reservations;
CREATE TRIGGER trg_reservation_copy
BEFORE INSERT OR UPDATE OF allocated_copy_id, item_id, branch_id ON reservations
FOR EACH ROW EXECUTE FUNCTION validate_reservation_copy();

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

DROP TRIGGER IF EXISTS trg_borrowing_consistency ON borrowings;
CREATE TRIGGER trg_borrowing_consistency
BEFORE INSERT OR UPDATE OF student_id, copy_id, branch_id, reservation_id ON borrowings
FOR EACH ROW EXECUTE FUNCTION validate_borrowing_consistency();

-- Views
CREATE OR REPLACE VIEW v_item_availability AS
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

CREATE OR REPLACE VIEW v_current_borrowings AS
SELECT
  b.*,
  (b.returned_at IS NULL AND b.due_at < NOW()) AS is_overdue
FROM borrowings b
WHERE b.status = 'ACTIVE';

CREATE OR REPLACE VIEW v_overdue_borrowings AS
SELECT
  b.*,
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - b.due_at)) / 86400))::INTEGER AS days_overdue
FROM borrowings b
WHERE b.status = 'ACTIVE'
  AND b.returned_at IS NULL
  AND b.due_at < NOW();

CREATE OR REPLACE VIEW v_active_reservations AS
SELECT *
FROM reservations
WHERE status IN ('PENDING','ACTIVE')
  AND expires_at > NOW();

CREATE OR REPLACE VIEW v_monthly_library_visits AS
SELECT
  date_trunc('month', checked_in_at) AS month,
  branch_id,
  COUNT(*) AS visit_count,
  COUNT(DISTINCT student_id) AS unique_students
FROM library_visits
GROUP BY date_trunc('month', checked_in_at), branch_id;


-- Keep updated_at correct for writes made outside Prisma Client.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_students_updated_at ON students;
CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_branches_updated_at ON branches;
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_library_items_updated_at ON library_items;
CREATE TRIGGER trg_library_items_updated_at BEFORE UPDATE ON library_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_physical_copies_updated_at ON physical_copies;
CREATE TRIGGER trg_physical_copies_updated_at BEFORE UPDATE ON physical_copies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_reservations_updated_at ON reservations;
CREATE TRIGGER trg_reservations_updated_at BEFORE UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_borrowings_updated_at ON borrowings;
CREATE TRIGGER trg_borrowings_updated_at BEFORE UPDATE ON borrowings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_library_visits_updated_at ON library_visits;
CREATE TRIGGER trg_library_visits_updated_at BEFORE UPDATE ON library_visits
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
