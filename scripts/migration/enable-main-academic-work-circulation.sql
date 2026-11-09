-- Local demo policy. Run after backup and the ACADEMIC_WORK migration.
BEGIN;

DO $$
DECLARE
  main_id uuid;
  book_policy public.circulation_policies%ROWTYPE;
BEGIN
  IF current_database() <> 'sams_library' THEN
    RAISE EXCEPTION 'Expected the local SAMS demo database';
  END IF;
  PERFORM pg_advisory_xact_lock(103067, 7);
  SELECT id INTO STRICT main_id FROM public.branches WHERE code = 'MAIN' AND is_active;

  IF EXISTS (
    SELECT 1 FROM public.circulation_policies
    WHERE branch_id = main_id AND item_type = 'ACADEMIC_WORK' AND is_active
      AND effective_from <= CURRENT_DATE AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO STRICT book_policy FROM public.circulation_policies
  WHERE branch_id = main_id AND item_type = 'BOOK' AND is_active
    AND effective_from <= CURRENT_DATE AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
  ORDER BY effective_from DESC LIMIT 1;

  INSERT INTO public.circulation_policies
    (id, branch_id, item_type, loan_days, reservation_hold_hours, max_active_loans,
     max_active_reservations, renewal_limit, effective_from, effective_to, is_active)
  VALUES (gen_random_uuid(), main_id, 'ACADEMIC_WORK', book_policy.loan_days,
    book_policy.reservation_hold_hours, book_policy.max_active_loans,
    book_policy.max_active_reservations, book_policy.renewal_limit, CURRENT_DATE,
    book_policy.effective_to, true);
END;
$$;

COMMIT;
