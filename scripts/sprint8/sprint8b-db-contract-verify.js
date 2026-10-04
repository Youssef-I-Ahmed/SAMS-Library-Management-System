import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename =
  fileURLToPath(
    import.meta.url
  );

const __dirname =
  path.dirname(
    __filename
  );

loadEnvFile(
  path.resolve(
    __dirname,
    '../../.env'
  )
);

import { prisma } from '../../apps/api/src/config/prisma.js';

function mapBy(
  rows,
  key
) {
  return new Map(
    rows.map(
      (row) => [
        row[key],
        row
      ]
    )
  );
}

function requireNames(
  label,
  actualMap,
  expectedNames
) {
  const missing =
    expectedNames.filter(
      (name) =>
        !actualMap.has(name)
    );

  if (
    missing.length > 0
  ) {
    throw new Error(
      `${label}: missing ${missing.join(', ')}`
    );
  }

  console.log(
    `${label}: ${expectedNames.length}/${expectedNames.length} OK`
  );
}

function requireIncludes(
  label,
  text,
  fragments
) {
  const normalized =
    String(text)
      .toLowerCase();

  const missing =
    fragments.filter(
      (fragment) =>
        !normalized.includes(
          fragment.toLowerCase()
        )
    );

  if (
    missing.length > 0
  ) {
    throw new Error(
      `${label}: definition missing ${missing.join(', ')}`
    );
  }
}

async function main() {
  console.log(
    'Verifying PostgreSQL extension/constraint contract...'
  );

  const [
    indexes,
    constraints,
    triggers,
    views,
    functions
  ] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        indexname AS name,
        indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public'
    `,

    prisma.$queryRaw`
      SELECT
        c.conname AS name,
        pg_get_constraintdef(
          c.oid
        ) AS definition
      FROM pg_constraint c
      INNER JOIN pg_namespace n
        ON n.oid =
           c.connamespace
      WHERE n.nspname =
        'public'
    `,

    prisma.$queryRaw`
      SELECT
        t.tgname AS name,
        c.relname AS table_name,
        p.proname AS function_name
      FROM pg_trigger t
      INNER JOIN pg_class c
        ON c.oid =
           t.tgrelid
      INNER JOIN pg_namespace n
        ON n.oid =
           c.relnamespace
      INNER JOIN pg_proc p
        ON p.oid =
           t.tgfoid
      WHERE
        NOT t.tgisinternal
        AND n.nspname =
          'public'
    `,

    prisma.$queryRaw`
      SELECT
        table_name AS name
      FROM information_schema.views
      WHERE table_schema =
        'public'
    `,

    prisma.$queryRaw`
      SELECT DISTINCT
        p.proname AS name
      FROM pg_proc p
      INNER JOIN pg_namespace n
        ON n.oid =
           p.pronamespace
      WHERE n.nspname =
        'public'
    `
  ]);

  const indexMap =
    mapBy(
      indexes,
      'name'
    );

  requireNames(
    'Partial unique indexes',
    indexMap,
    [
      'uq_reservation_student_item_active',
      'uq_reservation_allocated_copy_active',
      'uq_borrowing_copy_active',
      'uq_open_visit_per_student'
    ]
  );

  requireIncludes(
    'Reservation student/item partial index',
    indexMap.get(
      'uq_reservation_student_item_active'
    ).definition,
    [
      'unique',
      'student_id',
      'item_id',
      'pending',
      'active'
    ]
  );

  requireIncludes(
    'Active borrowing partial index',
    indexMap.get(
      'uq_borrowing_copy_active'
    ).definition,
    [
      'unique',
      'copy_id',
      'active'
    ]
  );

  requireIncludes(
    'Open visit partial index',
    indexMap.get(
      'uq_open_visit_per_student'
    ).definition,
    [
      'unique',
      'student_id',
      'checked_out_at is null'
    ]
  );

  const constraintMap =
    mapBy(
      constraints,
      'name'
    );

  requireNames(
    'CHECK constraints',
    constraintMap,
    [
      'chk_reservation_expiry_after_start',
      'chk_borrowing_due_after_start',
      'chk_visit_checkout_after_checkin',
      'chk_academic_work_type'
    ]
  );

  requireIncludes(
    'Reservation expiry constraint',
    constraintMap.get(
      'chk_reservation_expiry_after_start'
    ).definition,
    [
      'expires_at',
      'reserved_at'
    ]
  );

  requireIncludes(
    'Borrowing due constraint',
    constraintMap.get(
      'chk_borrowing_due_after_start'
    ).definition,
    [
      'due_at',
      'borrowed_at'
    ]
  );

  const triggerMap =
    mapBy(
      triggers,
      'name'
    );

  requireNames(
    'Validation triggers',
    triggerMap,
    [
      'trg_student_department_faculty',
      'trg_book_details_type',
      'trg_academic_work_type',
      'trg_reservation_copy',
      'trg_borrowing_consistency'
    ]
  );

  requireNames(
    'updated_at triggers',
    triggerMap,
    [
      'trg_users_updated_at',
      'trg_students_updated_at',
      'trg_branches_updated_at',
      'trg_library_items_updated_at',
      'trg_physical_copies_updated_at',
      'trg_reservations_updated_at',
      'trg_borrowings_updated_at',
      'trg_library_visits_updated_at'
    ]
  );

  const viewMap =
    mapBy(
      views,
      'name'
    );

  requireNames(
    'Operational views',
    viewMap,
    [
      'v_item_availability',
      'v_current_borrowings',
      'v_overdue_borrowings',
      'v_active_reservations',
      'v_monthly_library_visits'
    ]
  );

  const functionMap =
    mapBy(
      functions,
      'name'
    );

  requireNames(
    'Validation/update functions',
    functionMap,
    [
      'validate_student_department_faculty',
      'validate_book_details_type',
      'validate_academic_work_type',
      'validate_reservation_copy',
      'validate_borrowing_consistency',
      'set_updated_at'
    ]
  );

  console.log('');
  console.log(
    'Sprint 8B PostgreSQL contract verification PASSED.'
  );
}

main()
  .catch(
    (error) => {
      console.error(error);
      process.exitCode = 1;
    }
  )
  .finally(
    async () => {
      await prisma
        .$disconnect();
    }
  );
