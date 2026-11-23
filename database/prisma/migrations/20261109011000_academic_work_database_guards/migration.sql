BEGIN;

ALTER TABLE public.academic_work_details
  DROP CONSTRAINT IF EXISTS chk_academic_work_type,
  ADD CONSTRAINT chk_academic_work_type
  CHECK (work_type IN ('THESIS', 'PROJECT', 'ACADEMIC_WORK'));

CREATE OR REPLACE FUNCTION public.validate_academic_work_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item_kind public.item_type;
  department_faculty uuid;
BEGIN
  SELECT type INTO item_kind FROM public.library_items WHERE id = NEW.item_id;
  IF item_kind NOT IN ('THESIS', 'PROJECT', 'ACADEMIC_WORK') OR item_kind IS DISTINCT FROM NEW.work_type THEN
    RAISE EXCEPTION 'academic_work_details type must match an academic library item';
  END IF;
  IF NEW.department_id IS NOT NULL AND NEW.faculty_id IS NOT NULL THEN
    SELECT faculty_id INTO department_faculty FROM public.departments WHERE id = NEW.department_id;
    IF department_faculty IS DISTINCT FROM NEW.faculty_id THEN
      RAISE EXCEPTION 'Academic work department does not belong to selected faculty';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_academic_work_type
  BEFORE INSERT OR UPDATE OF item_id, work_type, faculty_id, department_id ON public.academic_work_details
  FOR EACH ROW EXECUTE FUNCTION public.validate_academic_work_type();

COMMIT;
