-- CreateEnum
CREATE TYPE "academic_status" AS ENUM ('ACTIVE', 'GRADUATED', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "item_type" AS ENUM ('BOOK', 'THESIS', 'PROJECT');

-- CreateEnum
CREATE TYPE "contributor_role" AS ENUM ('AUTHOR', 'RESEARCHER', 'SUPERVISOR', 'PROJECT_MEMBER');

-- CreateEnum
CREATE TYPE "copy_status" AS ENUM ('AVAILABLE', 'RESERVED', 'BORROWED', 'UNAVAILABLE', 'DAMAGED', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "copy_condition" AS ENUM ('GOOD', 'FAIR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('PENDING', 'ACTIVE', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "borrowing_status" AS ENUM ('ACTIVE', 'RETURNED', 'LOST');

-- CreateEnum
CREATE TYPE "visit_source" AS ENUM ('MANUAL', 'BARCODE', 'QR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "university_email" TEXT NOT NULL,
    "external_auth_id" TEXT,
    "display_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SMALLSERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" SMALLINT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "faculties" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "faculties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "user_id" UUID NOT NULL,
    "student_id" TEXT NOT NULL,
    "faculty_id" UUID,
    "department_id" UUID,
    "academic_status" "academic_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dewey_classifications" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "parent_id" UUID,

    CONSTRAINT "dewey_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_items" (
    "id" UUID NOT NULL,
    "type" "item_type" NOT NULL,
    "title" TEXT NOT NULL,
    "category_id" UUID,
    "dewey_classification_id" UUID,
    "dewey_code_raw" TEXT,
    "call_number" TEXT,
    "language" TEXT,
    "publication_year" SMALLINT,
    "abstract_description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "library_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_details" (
    "item_id" UUID NOT NULL,
    "isbn" TEXT,
    "publisher" TEXT,
    "edition" TEXT,

    CONSTRAINT "book_details_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "academic_work_details" (
    "item_id" UUID NOT NULL,
    "faculty_id" UUID,
    "department_id" UUID,
    "academic_year" TEXT,
    "work_type" "item_type" NOT NULL,

    CONSTRAINT "academic_work_details_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "contributors" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,

    CONSTRAINT "contributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_contributors" (
    "item_id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "role" "contributor_role" NOT NULL,

    CONSTRAINT "item_contributors_pkey" PRIMARY KEY ("item_id","contributor_id","role")
);

-- CreateTable
CREATE TABLE "physical_copies" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "copy_code" TEXT,
    "barcode" TEXT,
    "shelf_location" TEXT,
    "status" "copy_status" NOT NULL DEFAULT 'AVAILABLE',
    "condition" "copy_condition",
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "physical_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "allocated_copy_id" UUID,
    "status" "reservation_status" NOT NULL DEFAULT 'PENDING',
    "reserved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "fulfilled_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borrowings" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "copy_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "reservation_id" UUID,
    "borrowed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "returned_at" TIMESTAMPTZ(6),
    "checked_out_by" UUID NOT NULL,
    "returned_by" UUID,
    "status" "borrowing_status" NOT NULL DEFAULT 'ACTIVE',
    "return_condition" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "borrowings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_visits" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "checked_in_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_out_at" TIMESTAMPTZ(6),
    "registered_by" UUID NOT NULL,
    "checkout_by" UUID,
    "source" "visit_source" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "library_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circulation_policies" (
    "id" UUID NOT NULL,
    "branch_id" UUID,
    "item_type" "item_type",
    "loan_days" INTEGER NOT NULL,
    "reservation_hold_hours" INTEGER NOT NULL,
    "max_active_loans" INTEGER NOT NULL,
    "max_active_reservations" INTEGER NOT NULL,
    "renewal_limit" INTEGER NOT NULL DEFAULT 0,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "circulation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "branch_id" UUID,
    "old_values" JSONB,
    "new_values" JSONB,
    "metadata" JSONB,
    "request_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "result_reference" TEXT,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_university_email_key" ON "users"("university_email");

-- CreateIndex
CREATE UNIQUE INDEX "users_external_auth_id_key" ON "users"("external_auth_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "faculties_name_key" ON "faculties"("name");

-- CreateIndex
CREATE INDEX "departments_faculty_id_idx" ON "departments"("faculty_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_faculty_id_name_key" ON "departments"("faculty_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "students_student_id_key" ON "students"("student_id");

-- CreateIndex
CREATE INDEX "students_faculty_id_idx" ON "students"("faculty_id");

-- CreateIndex
CREATE INDEX "students_department_id_idx" ON "students"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dewey_classifications_code_key" ON "dewey_classifications"("code");

-- CreateIndex
CREATE INDEX "dewey_classifications_parent_id_idx" ON "dewey_classifications"("parent_id");

-- CreateIndex
CREATE INDEX "library_items_title_idx" ON "library_items"("title");

-- CreateIndex
CREATE INDEX "library_items_type_idx" ON "library_items"("type");

-- CreateIndex
CREATE INDEX "library_items_category_id_idx" ON "library_items"("category_id");

-- CreateIndex
CREATE INDEX "library_items_dewey_classification_id_idx" ON "library_items"("dewey_classification_id");

-- CreateIndex
CREATE INDEX "library_items_call_number_idx" ON "library_items"("call_number");

-- CreateIndex
CREATE INDEX "book_details_isbn_idx" ON "book_details"("isbn");

-- CreateIndex
CREATE INDEX "academic_work_details_faculty_id_idx" ON "academic_work_details"("faculty_id");

-- CreateIndex
CREATE INDEX "academic_work_details_department_id_idx" ON "academic_work_details"("department_id");

-- CreateIndex
CREATE INDEX "contributors_full_name_idx" ON "contributors"("full_name");

-- CreateIndex
CREATE INDEX "item_contributors_contributor_id_idx" ON "item_contributors"("contributor_id");

-- CreateIndex
CREATE UNIQUE INDEX "physical_copies_barcode_key" ON "physical_copies"("barcode");

-- CreateIndex
CREATE INDEX "physical_copies_item_id_idx" ON "physical_copies"("item_id");

-- CreateIndex
CREATE INDEX "physical_copies_branch_id_idx" ON "physical_copies"("branch_id");

-- CreateIndex
CREATE INDEX "physical_copies_status_idx" ON "physical_copies"("status");

-- CreateIndex
CREATE INDEX "physical_copies_item_id_branch_id_status_idx" ON "physical_copies"("item_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "reservations_student_id_idx" ON "reservations"("student_id");

-- CreateIndex
CREATE INDEX "reservations_item_id_idx" ON "reservations"("item_id");

-- CreateIndex
CREATE INDEX "reservations_branch_id_idx" ON "reservations"("branch_id");

-- CreateIndex
CREATE INDEX "reservations_allocated_copy_id_idx" ON "reservations"("allocated_copy_id");

-- CreateIndex
CREATE INDEX "reservations_status_expires_at_idx" ON "reservations"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "borrowings_reservation_id_key" ON "borrowings"("reservation_id");

-- CreateIndex
CREATE INDEX "borrowings_student_id_idx" ON "borrowings"("student_id");

-- CreateIndex
CREATE INDEX "borrowings_copy_id_idx" ON "borrowings"("copy_id");

-- CreateIndex
CREATE INDEX "borrowings_branch_id_idx" ON "borrowings"("branch_id");

-- CreateIndex
CREATE INDEX "borrowings_status_idx" ON "borrowings"("status");

-- CreateIndex
CREATE INDEX "borrowings_due_at_idx" ON "borrowings"("due_at");

-- CreateIndex
CREATE INDEX "library_visits_student_id_idx" ON "library_visits"("student_id");

-- CreateIndex
CREATE INDEX "library_visits_branch_id_idx" ON "library_visits"("branch_id");

-- CreateIndex
CREATE INDEX "library_visits_checked_in_at_idx" ON "library_visits"("checked_in_at");

-- CreateIndex
CREATE INDEX "circulation_policies_branch_id_item_type_idx" ON "circulation_policies"("branch_id", "item_type");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_branch_id_idx" ON "audit_logs"("branch_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_user_id_operation_key_key" ON "idempotency_records"("user_id", "operation", "key");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dewey_classifications" ADD CONSTRAINT "dewey_classifications_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "dewey_classifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_dewey_classification_id_fkey" FOREIGN KEY ("dewey_classification_id") REFERENCES "dewey_classifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_details" ADD CONSTRAINT "book_details_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_work_details" ADD CONSTRAINT "academic_work_details_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_work_details" ADD CONSTRAINT "academic_work_details_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_work_details" ADD CONSTRAINT "academic_work_details_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_contributors" ADD CONSTRAINT "item_contributors_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_contributors" ADD CONSTRAINT "item_contributors_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "contributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_copies" ADD CONSTRAINT "physical_copies_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "library_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_copies" ADD CONSTRAINT "physical_copies_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "library_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_allocated_copy_id_fkey" FOREIGN KEY ("allocated_copy_id") REFERENCES "physical_copies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrowings" ADD CONSTRAINT "borrowings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrowings" ADD CONSTRAINT "borrowings_copy_id_fkey" FOREIGN KEY ("copy_id") REFERENCES "physical_copies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrowings" ADD CONSTRAINT "borrowings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrowings" ADD CONSTRAINT "borrowings_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrowings" ADD CONSTRAINT "borrowings_checked_out_by_fkey" FOREIGN KEY ("checked_out_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrowings" ADD CONSTRAINT "borrowings_returned_by_fkey" FOREIGN KEY ("returned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_visits" ADD CONSTRAINT "library_visits_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_visits" ADD CONSTRAINT "library_visits_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_visits" ADD CONSTRAINT "library_visits_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_visits" ADD CONSTRAINT "library_visits_checkout_by_fkey" FOREIGN KEY ("checkout_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circulation_policies" ADD CONSTRAINT "circulation_policies_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
