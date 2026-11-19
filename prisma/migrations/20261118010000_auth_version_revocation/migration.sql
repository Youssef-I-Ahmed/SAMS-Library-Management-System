-- PREPARED ONLY. Never apply to an existing environment without an approved
-- production-login/cutover plan. Legacy JWTs are rejected by the paired API.
BEGIN;

ALTER TABLE public.users
  ADD COLUMN auth_version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT chk_users_auth_version_positive CHECK (auth_version >= 1);

CREATE FUNCTION public.guard_user_auth_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.auth_version IS NULL OR NEW.auth_version < OLD.auth_version THEN
    RAISE EXCEPTION 'Authentication version cannot be reset or decremented' USING ERRCODE = '23514';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.university_email IS DISTINCT FROM OLD.university_email
     OR NEW.external_auth_id IS DISTINCT FROM OLD.external_auth_id THEN
    -- Coalesce an explicit increment and an identity change into one advance.
    -- Integer exhaustion fails closed; it must never wrap or reset.
    NEW.auth_version := GREATEST(NEW.auth_version, OLD.auth_version + 1);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_auth_version
  BEFORE UPDATE OF auth_version, is_active, university_email, external_auth_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_auth_version();

-- All callers lock affected users in UUID order; one advance per distinct user
-- per statement. This UPDATE does not alter identity fields, so it cannot cause
-- a second increment in guard_user_auth_version(). No recursive UPDATE there.
CREATE FUNCTION public.advance_user_auth_versions(affected_users uuid[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE affected_user uuid;
BEGIN
  FOR affected_user IN
    SELECT DISTINCT id FROM unnest(affected_users) AS affected(id) ORDER BY id
  LOOP
    UPDATE public.users SET auth_version = auth_version + 1 WHERE id = affected_user;
  END LOOP;
END;
$$;

CREATE FUNCTION public.invalidate_membership_auth_versions()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_users uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT user_id) INTO affected_users FROM new_memberships;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT user_id) INTO affected_users FROM old_memberships;
  ELSE
    -- A no-op UPDATE or unchanged membership set must not invalidate sessions.
    SELECT array_agg(DISTINCT user_id) INTO affected_users FROM (
      (SELECT user_id, role_id FROM new_memberships EXCEPT SELECT user_id, role_id FROM old_memberships)
      UNION
      (SELECT user_id, role_id FROM old_memberships EXCEPT SELECT user_id, role_id FROM new_memberships)
    ) AS changes;
  END IF;
  PERFORM public.advance_user_auth_versions(affected_users);
  RETURN NULL;
END;
$$;

-- Serialize newly introduced memberships with role renames, including a rename
-- running from an older RepeatableRead snapshot. A row lock alone is insufficient
-- in that case: touch the role tuple so the stale writer must serialize/retry.
-- name remains unchanged, so the role-name trigger below does not revoke again.
CREATE FUNCTION public.serialize_membership_role_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id = OLD.user_id AND NEW.role_id = OLD.role_id THEN RETURN NEW; END IF;
    -- ON UPDATE CASCADE already owns the renamed role tuple; do not update it
    -- recursively. The membership AFTER trigger still invalidates affected users.
    IF NEW.role_id <> OLD.role_id AND NOT EXISTS (
      SELECT 1 FROM public.roles WHERE id = OLD.role_id
    ) THEN RETURN NEW; END IF;
  END IF;
  UPDATE public.roles SET name = name WHERE id = NEW.role_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_roles_auth_serialize BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.serialize_membership_role_changes();

CREATE TRIGGER trg_user_roles_auth_insert AFTER INSERT ON public.user_roles
  REFERENCING NEW TABLE AS new_memberships
  FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_membership_auth_versions();
CREATE TRIGGER trg_user_roles_auth_delete AFTER DELETE ON public.user_roles
  REFERENCING OLD TABLE AS old_memberships
  FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_membership_auth_versions();
CREATE TRIGGER trg_user_roles_auth_update AFTER UPDATE ON public.user_roles
  REFERENCING OLD TABLE AS old_memberships NEW TABLE AS new_memberships
  FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_membership_auth_versions();

CREATE FUNCTION public.invalidate_renamed_role_auth_versions()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_users uuid[];
BEGIN
  SELECT array_agg(DISTINCT membership.user_id) INTO affected_users
  FROM new_roles AS role_after
  JOIN old_roles AS role_before USING (id)
  JOIN public.user_roles AS membership ON membership.role_id = role_after.id
  WHERE role_after.name IS DISTINCT FROM role_before.name;
  PERFORM public.advance_user_auth_versions(affected_users);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_roles_auth_rename AFTER UPDATE ON public.roles
  REFERENCING OLD TABLE AS old_roles NEW TABLE AS new_roles
  FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_renamed_role_auth_versions();

COMMIT;
