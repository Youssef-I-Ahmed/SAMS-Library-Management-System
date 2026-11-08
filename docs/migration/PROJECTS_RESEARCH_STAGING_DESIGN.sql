-- Sprint 10D.4A design artifact only.
-- Do not apply this file to the SAMS database as a migration.
-- It defines the proposed isolation and checks for a later dry-run importer.

CREATE SCHEMA IF NOT EXISTS academic_import_stage;
REVOKE ALL ON SCHEMA academic_import_stage FROM PUBLIC;

CREATE TABLE academic_import_stage.source_run (
  id uuid PRIMARY KEY,
  source_namespace text NOT NULL,
  project_sha256 text NOT NULL CHECK (project_sha256 ~ '^[0-9a-f]{64}$'),
  starter_sha256 text NOT NULL CHECK (starter_sha256 ~ '^[0-9a-f]{64}$'),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  state text NOT NULL CHECK (state IN ('STAGED', 'VALIDATED', 'REJECTED')),
  controls jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_namespace, project_sha256, starter_sha256)
);

CREATE TABLE academic_import_stage.work_core (
  run_id uuid NOT NULL REFERENCES academic_import_stage.source_run(id) ON DELETE CASCADE,
  source_namespace text NOT NULL,
  legacy_book_code text NOT NULL,
  project_row_number integer,
  starter_row_number integer,
  public_title_candidate text,
  public_title_approved boolean NOT NULL DEFAULT false,
  publication_year_candidate smallint,
  call_number_raw text,
  extent_raw text,
  dimension_raw text,
  language_code_raw text,
  record_type_raw text,
  work_type_candidate text CHECK (work_type_candidate IN ('PROJECT', 'THESIS')),
  import_state text NOT NULL DEFAULT 'STAGED'
    CHECK (import_state IN ('STAGED', 'BLOCKED', 'READY', 'IMPORTED', 'REJECTED')),
  source_row_fingerprint text NOT NULL CHECK (source_row_fingerprint ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (run_id, source_namespace, legacy_book_code),
  CHECK (publication_year_candidate IS NULL OR publication_year_candidate BETWEEN 1000 AND 9999)
);

CREATE TABLE academic_import_stage.work_private_evidence (
  run_id uuid NOT NULL,
  source_namespace text NOT NULL,
  legacy_book_code text NOT NULL,
  legacy_title_raw text,
  students_cell_raw text,
  supervisor_cell_raw text,
  privacy_review_state text NOT NULL DEFAULT 'PENDING'
    CHECK (privacy_review_state IN ('PENDING', 'APPROVED', 'BLOCKED')),
  PRIMARY KEY (run_id, source_namespace, legacy_book_code),
  FOREIGN KEY (run_id, source_namespace, legacy_book_code)
    REFERENCES academic_import_stage.work_core(run_id, source_namespace, legacy_book_code)
    ON DELETE CASCADE
);

CREATE TABLE academic_import_stage.copy_candidate (
  run_id uuid NOT NULL,
  source_namespace text NOT NULL,
  legacy_book_code text NOT NULL,
  legacy_general_code text NOT NULL,
  legacy_copy_code text,
  legacy_volume_code text,
  raw_status text,
  canonical_status_candidate text,
  branch_candidate_id uuid,
  mapping_state text NOT NULL DEFAULT 'PENDING'
    CHECK (mapping_state IN ('PENDING', 'APPROVED', 'BLOCKED')),
  PRIMARY KEY (run_id, source_namespace, legacy_general_code),
  FOREIGN KEY (run_id, source_namespace, legacy_book_code)
    REFERENCES academic_import_stage.work_core(run_id, source_namespace, legacy_book_code)
    ON DELETE CASCADE,
  CHECK (
    canonical_status_candidate IS NULL OR
    canonical_status_candidate IN ('AVAILABLE', 'RESERVED', 'BORROWED', 'UNAVAILABLE', 'DAMAGED', 'LOST', 'ARCHIVED')
  )
);

CREATE TABLE academic_import_stage.subject_candidate (
  run_id uuid NOT NULL,
  source_namespace text NOT NULL,
  legacy_book_code text NOT NULL,
  legacy_subject_code text,
  legacy_subject_name text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('STARTER_RELATION', 'PROJECT_TEXT')),
  mapping_state text NOT NULL DEFAULT 'PENDING'
    CHECK (mapping_state IN ('PENDING', 'APPROVED', 'BLOCKED')),
  PRIMARY KEY (run_id, source_namespace, legacy_book_code, source_kind, legacy_subject_name),
  FOREIGN KEY (run_id, source_namespace, legacy_book_code)
    REFERENCES academic_import_stage.work_core(run_id, source_namespace, legacy_book_code)
    ON DELETE CASCADE
);

CREATE TABLE academic_import_stage.contributor_candidate (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  source_namespace text NOT NULL,
  legacy_book_code text NOT NULL,
  legacy_contributor_code text,
  full_name_private text NOT NULL,
  legacy_role text,
  canonical_role_candidate text,
  mapping_state text NOT NULL DEFAULT 'PENDING'
    CHECK (mapping_state IN ('PENDING', 'APPROVED', 'BLOCKED')),
  FOREIGN KEY (run_id, source_namespace, legacy_book_code)
    REFERENCES academic_import_stage.work_core(run_id, source_namespace, legacy_book_code)
    ON DELETE CASCADE,
  CHECK (
    canonical_role_candidate IS NULL OR
    canonical_role_candidate IN ('AUTHOR', 'RESEARCHER', 'SUPERVISOR', 'PROJECT_MEMBER')
  )
);

CREATE TABLE academic_import_stage.private_participant_candidate (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  source_namespace text NOT NULL,
  legacy_book_code text NOT NULL,
  participant_kind text NOT NULL CHECK (participant_kind IN ('STUDENT', 'SUPERVISOR')),
  full_name_private text NOT NULL,
  source_ordinal integer NOT NULL CHECK (source_ordinal > 0),
  visibility text NOT NULL DEFAULT 'STAFF_ONLY' CHECK (visibility = 'STAFF_ONLY'),
  source_row_fingerprint text NOT NULL CHECK (source_row_fingerprint ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (run_id, source_namespace, legacy_book_code)
    REFERENCES academic_import_stage.work_core(run_id, source_namespace, legacy_book_code)
    ON DELETE CASCADE,
  UNIQUE (run_id, source_namespace, legacy_book_code, participant_kind, source_ordinal)
);

CREATE TABLE academic_import_stage.import_issue (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES academic_import_stage.source_run(id) ON DELETE CASCADE,
  source_namespace text NOT NULL,
  legacy_book_code text,
  issue_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'BLOCKER')),
  field_name text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_state text NOT NULL DEFAULT 'OPEN'
    CHECK (resolution_state IN ('OPEN', 'APPROVED', 'REJECTED', 'QUARANTINED'))
);

CREATE INDEX academic_import_work_state_idx
  ON academic_import_stage.work_core(run_id, import_state);

CREATE INDEX academic_import_issue_state_idx
  ON academic_import_stage.import_issue(run_id, severity, resolution_state);

CREATE INDEX academic_import_copy_work_idx
  ON academic_import_stage.copy_candidate(run_id, source_namespace, legacy_book_code);

CREATE INDEX academic_import_subject_work_idx
  ON academic_import_stage.subject_candidate(run_id, source_namespace, legacy_book_code);

-- No GRANT statements are intentional. A later migration must name explicit importer
-- and staff-only roles after the deployment environment and RBAC policy are approved.
