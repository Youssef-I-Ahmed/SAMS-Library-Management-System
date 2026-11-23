-- PREPARED INFRASTRUCTURE ONLY. No grant bootstrap, custodian provisioning or
-- runtime permission cutover. Apply only after separate rollout approval.
BEGIN;

CREATE TYPE public.permission_grant_kind AS ENUM ('USE', 'DELEGATE');
CREATE TYPE public.permission_grant_scope AS ENUM ('GLOBAL', 'BRANCH');
ALTER TABLE public.users ADD COLUMN is_protected boolean NOT NULL DEFAULT false;

-- Immutable SQL snapshot, not an editable permission-definition table. Tests
-- compare every field with catalog v1. Future changes require a NEW migration.
CREATE FUNCTION public.permission_catalog_version() RETURNS integer
LANGUAGE sql IMMUTABLE AS $$ SELECT 1; $$;
CREATE FUNCTION public.permission_catalog_snapshot()
RETURNS TABLE (permission_key text, eligible_roles text[], allowed_scopes text[],
  classification text, delegable boolean, operation_status text, ordinary_grants boolean,
  delegation_roles text[], global_covers_branch boolean)
LANGUAGE sql IMMUTABLE AS $$ VALUES
  ('catalog.create', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL']::text[], 'ORDINARY', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], false),
  ('catalog.update', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL']::text[], 'ORDINARY', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], false),
  ('catalog.archive', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL']::text[], 'SENSITIVE', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], false),
  ('catalog.restore', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL']::text[], 'SENSITIVE', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], false),
  ('catalog.read_inactive', ARRAY['LIBRARIAN','MANAGEMENT']::text[], ARRAY['GLOBAL']::text[], 'ORDINARY', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], false),
  ('catalog.reference.manage', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL']::text[], 'ORDINARY', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], false),
  ('master_data.manage', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL']::text[], 'SENSITIVE', false, 'EXISTING', true, ARRAY[]::text[], false),
  ('inventory.read', ARRAY['LIBRARIAN','MANAGEMENT']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'ORDINARY', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], true),
  ('inventory.copies.manage', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'ORDINARY', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], true),
  ('catalog.import', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL']::text[], 'SENSITIVE', true, 'FUTURE_ONLY', true, ARRAY['MANAGEMENT']::text[], false),
  ('catalog.export', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL']::text[], 'SENSITIVE', true, 'FUTURE_ONLY', true, ARRAY['MANAGEMENT']::text[], false),
  ('students.directory.read', ARRAY['LIBRARIAN','MANAGEMENT']::text[], ARRAY['GLOBAL']::text[], 'SENSITIVE', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], false),
  ('students.access.manage', ARRAY['MANAGEMENT']::text[], ARRAY['GLOBAL']::text[], 'SENSITIVE', false, 'FUTURE_ONLY', true, ARRAY[]::text[], false),
  ('students.master.import', ARRAY[]::text[], ARRAY['GLOBAL']::text[], 'PROTECTED', false, 'FUTURE_ONLY', false, ARRAY[]::text[], false),
  ('students.export', ARRAY['MANAGEMENT']::text[], ARRAY['GLOBAL']::text[], 'SENSITIVE', false, 'FUTURE_ONLY', true, ARRAY[]::text[], false),
  ('borrowings.read', ARRAY['LIBRARIAN','MANAGEMENT']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'SENSITIVE', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], true),
  ('reservations.read', ARRAY['LIBRARIAN','MANAGEMENT']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'SENSITIVE', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], true),
  ('visits.read', ARRAY['LIBRARIAN','MANAGEMENT']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'SENSITIVE', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], true),
  ('circulation.checkout', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'ORDINARY', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], true),
  ('circulation.return', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'ORDINARY', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], true),
  ('reservations.cancel', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'ORDINARY', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], true),
  ('reservations.expire', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL']::text[], 'ORDINARY', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], false),
  ('visits.check_in', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'ORDINARY', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], true),
  ('visits.check_out', ARRAY['LIBRARIAN']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'ORDINARY', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], true),
  ('analytics.read', ARRAY['LIBRARIAN','MANAGEMENT']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'SENSITIVE', true, 'EXISTING', true, ARRAY['MANAGEMENT']::text[], true),
  ('staff.librarian.create', ARRAY['MANAGEMENT']::text[], ARRAY['GLOBAL']::text[], 'SENSITIVE', false, 'FUTURE_ONLY', true, ARRAY[]::text[], false),
  ('staff.librarian.deactivate', ARRAY['MANAGEMENT']::text[], ARRAY['GLOBAL']::text[], 'SENSITIVE', false, 'FUTURE_ONLY', true, ARRAY[]::text[], false),
  ('permissions.delegate', ARRAY['MANAGEMENT']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'SENSITIVE', false, 'FUTURE_ONLY', true, ARRAY[]::text[], true),
  ('audit.operational.read', ARRAY['LIBRARIAN','MANAGEMENT']::text[], ARRAY['GLOBAL','BRANCH']::text[], 'SENSITIVE', false, 'FUTURE_ONLY', true, ARRAY[]::text[], true),
  ('security.events.read', ARRAY[]::text[], ARRAY['GLOBAL']::text[], 'PROTECTED', false, 'FUTURE_ONLY', false, ARRAY[]::text[], false),
  ('permissions.protected.manage', ARRAY[]::text[], ARRAY['GLOBAL']::text[], 'PROTECTED', false, 'FUTURE_ONLY', false, ARRAY[]::text[], false),
  ('system.admin', ARRAY[]::text[], ARRAY['GLOBAL']::text[], 'PROTECTED', false, 'FUTURE_ONLY', false, ARRAY[]::text[], false)
$$;

CREATE FUNCTION public.permission_grant_shape_allowed(key text, grant_kind text, grant_scope text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT key <> 'students.master.import' AND EXISTS (
    SELECT 1 FROM public.permission_catalog_snapshot() AS policy
    WHERE policy.permission_key = key AND grant_scope = ANY(policy.allowed_scopes)
      AND (grant_kind = 'USE' OR (grant_kind = 'DELEGATE' AND policy.delegable))
  );
$$;

CREATE TABLE public.authorization_control (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bootstrap_completed boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1)
);
INSERT INTO public.authorization_control (id) VALUES (1);

CREATE TABLE public.permission_grants (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  permission_key text NOT NULL,
  kind public.permission_grant_kind NOT NULL,
  scope public.permission_grant_scope NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  granted_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT chk_permission_grant_scope CHECK (
    (scope = 'GLOBAL' AND branch_id IS NULL) OR (scope = 'BRANCH' AND branch_id IS NOT NULL)),
  CONSTRAINT chk_permission_grant_catalog CHECK (public.permission_grant_shape_allowed(permission_key, kind::text, scope::text)),
  CONSTRAINT chk_permission_grant_distinct_issuer CHECK (user_id <> granted_by_user_id)
);
CREATE UNIQUE INDEX uq_permission_grant_global ON public.permission_grants(user_id, permission_key, kind) WHERE scope = 'GLOBAL';
CREATE UNIQUE INDEX uq_permission_grant_branch ON public.permission_grants(user_id, permission_key, kind, branch_id) WHERE scope = 'BRANCH';
CREATE INDEX permission_grants_user_id_permission_key_idx ON public.permission_grants(user_id, permission_key);
CREATE INDEX permission_grants_granted_by_user_id_idx ON public.permission_grants(granted_by_user_id);
CREATE INDEX permission_grants_branch_id_idx ON public.permission_grants(branch_id);

-- NO SUCH ROLE IS CREATED OR GRANTED BY THIS MIGRATION. Activation requires a
-- separately approved DB maintenance identity, audit, verified custodians and
-- non-owner/non-superuser application credentials. A DB owner can bypass DDL
-- protections and is explicitly outside the ordinary-runtime trust boundary.
CREATE FUNCTION public.protected_authorization_operator() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS db_role
    WHERE db_role.rolname = 'sams_authorization_bootstrap_operator'
      AND pg_catalog.pg_has_role(session_user, db_role.oid, 'MEMBER'));
$$;
CREATE FUNCTION public.require_protected_authorization_operator() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.protected_authorization_operator() THEN
    RAISE EXCEPTION 'Protected authorization maintenance is unavailable' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.guard_authorization_control() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Authorization control cannot be removed' USING ERRCODE = '23514';
  END IF;
  IF NEW.id <> OLD.id OR NEW.revision IS NULL OR NEW.revision < OLD.revision THEN
    RAISE EXCEPTION 'Authorization control cannot be reset' USING ERRCODE = '23514';
  END IF;
  IF OLD.bootstrap_completed AND NOT NEW.bootstrap_completed THEN
    RAISE EXCEPTION 'Protected bootstrap cannot be reset' USING ERRCODE = '23514';
  END IF;
  IF NEW.bootstrap_completed IS DISTINCT FROM OLD.bootstrap_completed THEN
    PERFORM public.require_protected_authorization_operator();
    NEW.revision := GREATEST(NEW.revision, OLD.revision + 1);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_authorization_control_guard BEFORE UPDATE OR DELETE ON public.authorization_control
  FOR EACH ROW EXECUTE FUNCTION public.guard_authorization_control();
CREATE TRIGGER trg_authorization_control_no_truncate BEFORE TRUNCATE ON public.authorization_control
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_authorization_control();

CREATE FUNCTION public.lock_authorization_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- A real row UPDATE, not just an advisory lock: an old RepeatableRead snapshot
  -- must serialize/fail, rather than count stale custodians after waiting.
  UPDATE public.authorization_control SET revision = revision + 1 WHERE id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authorization control is missing' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_permission_grants_lock BEFORE INSERT OR UPDATE OR DELETE ON public.permission_grants
  FOR EACH STATEMENT EXECUTE FUNCTION public.lock_authorization_state();
CREATE TRIGGER trg_user_roles_permission_lock BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION public.lock_authorization_state();
CREATE TRIGGER trg_roles_permission_lock BEFORE UPDATE OR DELETE ON public.roles
  FOR EACH STATEMENT EXECUTE FUNCTION public.lock_authorization_state();
CREATE TRIGGER trg_users_permission_update_lock BEFORE UPDATE OF id, is_active, is_protected, university_email, external_auth_id ON public.users
  FOR EACH STATEMENT EXECUTE FUNCTION public.lock_authorization_state();
CREATE TRIGGER trg_users_permission_delete_lock BEFORE DELETE ON public.users
  FOR EACH STATEMENT EXECUTE FUNCTION public.lock_authorization_state();

CREATE FUNCTION public.guard_protected_user() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_protected THEN PERFORM public.require_protected_authorization_operator(); END IF;
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.is_protected THEN PERFORM public.require_protected_authorization_operator(); END IF;
  ELSE
    IF (OLD.is_protected OR NEW.is_protected) AND
       (to_jsonb(NEW) - 'auth_version' - 'updated_at') IS DISTINCT FROM
       (to_jsonb(OLD) - 'auth_version' - 'updated_at') THEN
      PERFORM public.require_protected_authorization_operator();
    END IF;
    IF NEW.is_protected IS DISTINCT FROM OLD.is_protected THEN
      NEW.auth_version := GREATEST(NEW.auth_version, OLD.auth_version + 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_users_permission_protection BEFORE INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_protected_user();

CREATE FUNCTION public.guard_protected_membership() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE target_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN target_ids := ARRAY[NEW.user_id];
  ELSIF TG_OP = 'DELETE' THEN target_ids := ARRAY[OLD.user_id];
  ELSE
    IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
    target_ids := ARRAY[OLD.user_id, NEW.user_id];
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = ANY(target_ids) AND is_protected) THEN
    PERFORM public.require_protected_authorization_operator();
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_user_roles_permission_protection BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_protected_membership();

CREATE FUNCTION public.guard_protected_role() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles AS membership JOIN public.users AS principal ON principal.id = membership.user_id
    WHERE membership.role_id = OLD.id AND principal.is_protected) THEN
    PERFORM public.require_protected_authorization_operator();
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_roles_permission_protection BEFORE UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_protected_role();

CREATE FUNCTION public.guard_permission_grant() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE target_protected boolean; issuer_protected boolean; key_class text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE id = OLD.user_id AND is_protected)
       OR OLD.kind = 'DELEGATE' OR OLD.permission_key IN ('permissions.protected.manage', 'security.events.read', 'system.admin', 'permissions.delegate') THEN
      PERFORM public.require_protected_authorization_operator();
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  SELECT classification INTO key_class FROM public.permission_catalog_snapshot() WHERE permission_key = NEW.permission_key;
  IF key_class IS NULL OR NOT public.permission_grant_shape_allowed(NEW.permission_key, NEW.kind::text, NEW.scope::text) THEN
    RAISE EXCEPTION 'Unsupported permission grant shape' USING ERRCODE = '23514';
  END IF;
  SELECT is_protected INTO target_protected FROM public.users WHERE id = NEW.user_id;
  IF target_protected OR key_class = 'PROTECTED' OR NEW.kind = 'DELEGATE' OR NEW.permission_key = 'permissions.delegate' THEN
    PERFORM public.require_protected_authorization_operator();
  END IF;
  IF key_class = 'PROTECTED' OR NEW.kind = 'DELEGATE' OR NEW.permission_key = 'permissions.delegate' THEN
    IF NOT COALESCE(target_protected, false) OR NOT EXISTS (
      SELECT 1 FROM public.user_roles AS membership JOIN public.roles AS role_record ON role_record.id = membership.role_id
      JOIN public.users AS principal ON principal.id = membership.user_id
      WHERE principal.id = NEW.user_id AND principal.is_active AND role_record.name = 'MANAGEMENT'
    ) THEN RAISE EXCEPTION 'Protected grant requires an eligible protected principal' USING ERRCODE = '23514'; END IF;
    SELECT is_protected INTO issuer_protected FROM public.users WHERE id = NEW.granted_by_user_id;
    IF NOT COALESCE(issuer_protected, false) THEN
      RAISE EXCEPTION 'Protected grant requires a protected issuer' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Grant identity and creation time are immutable' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - 'version') IS DISTINCT FROM (to_jsonb(OLD) - 'version') THEN
      IF NEW.version IS NULL OR NEW.version < OLD.version OR NEW.version > OLD.version + 1 THEN
        RAISE EXCEPTION 'Invalid grant version transition' USING ERRCODE = '23514';
      END IF;
      NEW.version := OLD.version + 1;
    ELSIF NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'Grant version requires a meaningful change' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_permission_grants_guard BEFORE INSERT OR UPDATE OR DELETE ON public.permission_grants
  FOR EACH ROW EXECUTE FUNCTION public.guard_permission_grant();

CREATE FUNCTION public.invalidate_permission_grants() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE affected uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN SELECT array_agg(DISTINCT user_id) INTO affected FROM new_grants;
  ELSIF TG_OP = 'DELETE' THEN SELECT array_agg(DISTINCT user_id) INTO affected FROM old_grants;
  ELSE
    SELECT array_agg(DISTINCT user_id) INTO affected FROM (
      (SELECT * FROM new_grants EXCEPT SELECT * FROM old_grants)
      UNION (SELECT * FROM old_grants EXCEPT SELECT * FROM new_grants)
    ) AS changed;
  END IF;
  PERFORM public.advance_user_auth_versions(affected);
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_permission_grants_insert AFTER INSERT ON public.permission_grants
  REFERENCING NEW TABLE AS new_grants FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_permission_grants();
CREATE TRIGGER trg_permission_grants_delete AFTER DELETE ON public.permission_grants
  REFERENCING OLD TABLE AS old_grants FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_permission_grants();
CREATE TRIGGER trg_permission_grants_update AFTER UPDATE ON public.permission_grants
  REFERENCING OLD TABLE AS old_grants NEW TABLE AS new_grants FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_permission_grants();

CREATE FUNCTION public.invalidate_protected_control_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bootstrap_completed IS DISTINCT FROM OLD.bootstrap_completed THEN
    PERFORM public.advance_user_auth_versions(ARRAY(SELECT id FROM public.users WHERE is_protected));
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_authorization_control_invalidate AFTER UPDATE ON public.authorization_control
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_protected_control_change();

CREATE FUNCTION public.check_last_protected_principal() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE completed boolean;
BEGIN
  SELECT bootstrap_completed INTO completed FROM public.authorization_control WHERE id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authorization control is missing' USING ERRCODE = '23514'; END IF;
  IF completed AND NOT EXISTS (
    SELECT 1 FROM public.users AS principal
    JOIN public.user_roles AS membership ON membership.user_id = principal.id
    JOIN public.roles AS role_record ON role_record.id = membership.role_id AND role_record.name = 'MANAGEMENT'
    JOIN public.permission_grants AS grant_record ON grant_record.user_id = principal.id
    WHERE principal.is_active AND principal.is_protected AND grant_record.permission_key = 'permissions.protected.manage'
      AND grant_record.kind = 'USE' AND grant_record.scope = 'GLOBAL'
  ) THEN RAISE EXCEPTION 'The last active protected administrative principal must remain' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER chk_control_protected_principal AFTER UPDATE ON public.authorization_control
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_last_protected_principal();
CREATE CONSTRAINT TRIGGER chk_grants_protected_principal AFTER INSERT OR UPDATE OR DELETE ON public.permission_grants
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_last_protected_principal();
CREATE CONSTRAINT TRIGGER chk_users_protected_principal AFTER UPDATE OR DELETE ON public.users
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_last_protected_principal();
CREATE CONSTRAINT TRIGGER chk_membership_protected_principal AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_last_protected_principal();
CREATE CONSTRAINT TRIGGER chk_roles_protected_principal AFTER UPDATE OR DELETE ON public.roles
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_last_protected_principal();

-- TRUNCATE cannot participate in ordinary grant/account maintenance; it would
-- bypass row triggers and historic identity/session invariants.
CREATE FUNCTION public.reject_authorization_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Authorization tables require guarded row mutations' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER trg_grants_no_truncate BEFORE TRUNCATE ON public.permission_grants
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_authorization_truncate();
CREATE TRIGGER trg_memberships_no_truncate BEFORE TRUNCATE ON public.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_authorization_truncate();
CREATE TRIGGER trg_roles_no_truncate BEFORE TRUNCATE ON public.roles
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_authorization_truncate();
CREATE TRIGGER trg_users_no_truncate BEFORE TRUNCATE ON public.users
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_authorization_truncate();

COMMIT;
