-- Sprint 10D.6: canonical academic-work catalog support.
-- Source rows are loaded separately by the controlled importer.

ALTER TYPE "item_type" ADD VALUE IF NOT EXISTS 'ACADEMIC_WORK';

ALTER TABLE "academic_work_details"
  ADD COLUMN "extent" TEXT,
  ADD COLUMN "dimensions" TEXT,
  ADD COLUMN "record_type" TEXT;

CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "item_subjects" (
    "item_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    CONSTRAINT "item_subjects_pkey" PRIMARY KEY ("item_id", "subject_id")
);

CREATE TABLE "legacy_catalog_identities" (
    "source_namespace" TEXT NOT NULL,
    "legacy_code" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "legacy_catalog_identities_pkey" PRIMARY KEY ("source_namespace", "legacy_code")
);

CREATE TABLE "legacy_copy_identities" (
    "source_namespace" TEXT NOT NULL,
    "legacy_general_code" TEXT NOT NULL,
    "copy_id" UUID NOT NULL,
    "legacy_book_code" TEXT NOT NULL,
    "legacy_status" TEXT,
    "legacy_copy_code" TEXT,
    "legacy_volume_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "legacy_copy_identities_pkey" PRIMARY KEY ("source_namespace", "legacy_general_code")
);

CREATE UNIQUE INDEX "subjects_normalized_name_key" ON "subjects"("normalized_name");
CREATE INDEX "subjects_code_idx" ON "subjects"("code");
CREATE INDEX "subjects_name_idx" ON "subjects"("name");
CREATE INDEX "item_subjects_subject_id_idx" ON "item_subjects"("subject_id");
CREATE UNIQUE INDEX "legacy_catalog_identities_source_namespace_item_id_key"
  ON "legacy_catalog_identities"("source_namespace", "item_id");
CREATE INDEX "legacy_catalog_identities_item_id_idx" ON "legacy_catalog_identities"("item_id");
CREATE UNIQUE INDEX "legacy_copy_identities_source_namespace_copy_id_key"
  ON "legacy_copy_identities"("source_namespace", "copy_id");
CREATE INDEX "legacy_copy_identities_copy_id_idx" ON "legacy_copy_identities"("copy_id");
CREATE INDEX "legacy_copy_identities_source_namespace_legacy_book_code_idx"
  ON "legacy_copy_identities"("source_namespace", "legacy_book_code");

ALTER TABLE "item_subjects"
  ADD CONSTRAINT "item_subjects_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "item_subjects"
  ADD CONSTRAINT "item_subjects_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "legacy_catalog_identities"
  ADD CONSTRAINT "legacy_catalog_identities_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legacy_copy_identities"
  ADD CONSTRAINT "legacy_copy_identities_copy_id_fkey"
  FOREIGN KEY ("copy_id") REFERENCES "physical_copies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
