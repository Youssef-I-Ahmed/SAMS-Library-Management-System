import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

function roundPercent(
  numerator,
  denominator
) {
  if (!denominator) {
    return 0;
  }

  return Number(
    (
      (numerator / denominator) *
      100
    ).toFixed(2)
  );
}

async function validateBranch(
  branchId
) {
  if (!branchId) {
    return null;
  }

  const branch =
    await prisma.branch.findUnique({
      where: {
        id: branchId
      },
      select: {
        id: true,
        code: true,
        name: true,
        location: true,
        isActive: true
      }
    });

  if (!branch || !branch.isActive) {
    throw new AppError(
      404,
      'BRANCH_NOT_AVAILABLE',
      'Active library branch not found'
    );
  }

  return branch;
}

function buildItemWhere(branchId) {
  return {
    isActive: true,
    ...(branchId
      ? {
          physicalCopies: {
            some: {
              branchId,
              status: {
                not: 'ARCHIVED'
              },
              branch: {
                isActive: true
              }
            }
          }
        }
      : {})
  };
}

function buildCopyWhere(
  branchId,
  extra = {}
) {
  return {
    status: {
      not: 'ARCHIVED'
    },
    branch: {
      isActive: true
    },
    ...(branchId
      ? { branchId }
      : {}),
    ...extra
  };
}

function buildReservationWhere(
  branchId,
  extra = {}
) {
  return {
    branch: {
      isActive: true
    },
    ...(branchId
      ? { branchId }
      : {}),
    ...extra
  };
}

function buildBorrowingWhere(
  branchId,
  extra = {}
) {
  return {
    branch: {
      isActive: true
    },
    ...(branchId
      ? { branchId }
      : {}),
    ...extra
  };
}

function buildVisitWhere(
  branchId,
  extra = {}
) {
  return {
    branch: {
      isActive: true
    },
    ...(branchId
      ? { branchId }
      : {}),
    ...extra
  };
}

async function loadVisitPeriodStats({
  branchId,
  from,
  to
}) {
  const branchClause =
    branchId
      ? Prisma.sql`
          AND branch_id =
            ${branchId}::uuid
        `
      : Prisma.empty;

  const rows =
    await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          COUNT(*)::int
            AS "visitCount",

          COUNT(
            DISTINCT student_id
          )::int
            AS "uniqueVisitors",

          COALESCE(
            AVG(
              CASE
                WHEN checked_out_at
                  IS NOT NULL
                THEN EXTRACT(
                  EPOCH FROM (
                    checked_out_at -
                    checked_in_at
                  )
                ) / 60.0
                ELSE NULL
              END
            ),
            0
          )::double precision
            AS "averageClosedVisitMinutes"

        FROM library_visits

        WHERE checked_in_at >= ${from}
          AND checked_in_at < ${to}
          ${branchClause}
      `
    );

  const row = rows[0] ?? {
    visitCount: 0,
    uniqueVisitors: 0,
    averageClosedVisitMinutes: 0
  };

  return {
    visitCount:
      Number(row.visitCount ?? 0),
    uniqueVisitors:
      Number(row.uniqueVisitors ?? 0),
    averageClosedVisitMinutes:
      Number(
        Number(
          row.averageClosedVisitMinutes ??
          0
        ).toFixed(2)
      )
  };
}

export async function getAnalyticsOverview({
  branchId,
  from,
  to
}) {
  const now = new Date();

  const branch =
    await validateBranch(
      branchId
    );

  const [
    activeItems,
    physicalCopies,
    availableCopies,

    activeReservationHolds,
    overdueReservationHolds,
    reservationsCreatedInPeriod,

    activeLoans,
    overdueLoans,
    borrowingsStartedInPeriod,
    returnsInPeriod,

    openVisits,
    visitPeriodStats
  ] = await Promise.all([
    prisma.libraryItem.count({
      where:
        buildItemWhere(
          branchId
        )
    }),

    prisma.physicalCopy.count({
      where:
        buildCopyWhere(
          branchId
        )
    }),

    prisma.physicalCopy.count({
      where:
        buildCopyWhere(
          branchId,
          {
            status: 'AVAILABLE'
          }
        )
    }),

    prisma.reservation.count({
      where:
        buildReservationWhere(
          branchId,
          {
            status: 'ACTIVE',
            expiresAt: {
              gt: now
            }
          }
        )
    }),

    prisma.reservation.count({
      where:
        buildReservationWhere(
          branchId,
          {
            status: 'ACTIVE',
            expiresAt: {
              lte: now
            }
          }
        )
    }),

    prisma.reservation.count({
      where:
        buildReservationWhere(
          branchId,
          {
            reservedAt: {
              gte: from,
              lt: to
            }
          }
        )
    }),

    prisma.borrowing.count({
      where:
        buildBorrowingWhere(
          branchId,
          {
            status: 'ACTIVE'
          }
        )
    }),

    prisma.borrowing.count({
      where:
        buildBorrowingWhere(
          branchId,
          {
            status: 'ACTIVE',
            dueAt: {
              lt: now
            }
          }
        )
    }),

    prisma.borrowing.count({
      where:
        buildBorrowingWhere(
          branchId,
          {
            borrowedAt: {
              gte: from,
              lt: to
            }
          }
        )
    }),

    prisma.borrowing.count({
      where:
        buildBorrowingWhere(
          branchId,
          {
            status: 'RETURNED',
            returnedAt: {
              gte: from,
              lt: to
            }
          }
        )
    }),

    prisma.libraryVisit.count({
      where:
        buildVisitWhere(
          branchId,
          {
            checkedOutAt: null
          }
        )
    }),

    loadVisitPeriodStats({
      branchId,
      from,
      to
    })
  ]);

  return {
    scope: {
      branch,
      from,
      to,
      generatedAt: now,
      periodSemantics:
        '[from, to)'
    },

    catalog: {
      activeItems,
      physicalCopies,
      availableCopies,
      unavailableCopies:
        physicalCopies -
        availableCopies,
      availabilityRatePercent:
        roundPercent(
          availableCopies,
          physicalCopies
        )
    },

    reservations: {
      activeHolds:
        activeReservationHolds,
      overdueHoldsPendingExpiration:
        overdueReservationHolds,
      createdInPeriod:
        reservationsCreatedInPeriod
    },

    circulation: {
      activeLoans,
      overdueLoans,
      overdueLoanRatePercent:
        roundPercent(
          overdueLoans,
          activeLoans
        ),
      borrowingsStartedInPeriod,
      returnsInPeriod
    },

    visits: {
      visitsInPeriod:
        visitPeriodStats.visitCount,
      uniqueVisitorsInPeriod:
        visitPeriodStats.uniqueVisitors,
      openVisits,
      averageClosedVisitMinutes:
        visitPeriodStats
          .averageClosedVisitMinutes
    }
  };
}

function buildTrendSql({
  branchId,
  from,
  to,
  bucket
}) {
  const branchReservation =
    branchId
      ? Prisma.sql`
          AND r.branch_id =
            ${branchId}::uuid
        `
      : Prisma.empty;

  const branchBorrowing =
    branchId
      ? Prisma.sql`
          AND b.branch_id =
            ${branchId}::uuid
        `
      : Prisma.empty;

  const branchVisit =
    branchId
      ? Prisma.sql`
          AND v.branch_id =
            ${branchId}::uuid
        `
      : Prisma.empty;

  let unit;
  let step;

  switch (bucket) {
    case 'DAY':
      unit = Prisma.sql`'day'`;
      step =
        Prisma.sql`interval '1 day'`;
      break;

    case 'WEEK':
      unit = Prisma.sql`'week'`;
      step =
        Prisma.sql`interval '1 week'`;
      break;

    case 'MONTH':
      unit = Prisma.sql`'month'`;
      step =
        Prisma.sql`interval '1 month'`;
      break;

    default:
      throw new AppError(
        400,
        'INVALID_ANALYTICS_BUCKET',
        'Unsupported analytics bucket'
      );
  }

  return Prisma.sql`
    WITH buckets AS (
      SELECT
        generate_series(
          date_trunc(
            ${unit},
            ${from}::timestamptz,
            'UTC'
          ),
          date_trunc(
            ${unit},
            (
              ${to}::timestamptz -
              interval '1 microsecond'
            ),
            'UTC'
          ),
          ${step}
        ) AS bucket_start
    ),

    reservation_counts AS (
      SELECT
        date_trunc(
          ${unit},
          r.reserved_at,
          'UTC'
        ) AS bucket_start,
        COUNT(*)::int AS count

      FROM reservations r

      INNER JOIN branches br
        ON br.id = r.branch_id
       AND br.is_active = TRUE

      WHERE r.reserved_at >= ${from}
        AND r.reserved_at < ${to}
        ${branchReservation}

      GROUP BY 1
    ),

    borrowing_counts AS (
      SELECT
        date_trunc(
          ${unit},
          b.borrowed_at,
          'UTC'
        ) AS bucket_start,
        COUNT(*)::int AS count

      FROM borrowings b

      INNER JOIN branches br
        ON br.id = b.branch_id
       AND br.is_active = TRUE

      WHERE b.borrowed_at >= ${from}
        AND b.borrowed_at < ${to}
        ${branchBorrowing}

      GROUP BY 1
    ),

    return_counts AS (
      SELECT
        date_trunc(
          ${unit},
          b.returned_at,
          'UTC'
        ) AS bucket_start,
        COUNT(*)::int AS count

      FROM borrowings b

      INNER JOIN branches br
        ON br.id = b.branch_id
       AND br.is_active = TRUE

      WHERE b.status = 'RETURNED'
        AND b.returned_at >= ${from}
        AND b.returned_at < ${to}
        ${branchBorrowing}

      GROUP BY 1
    ),

    visit_counts AS (
      SELECT
        date_trunc(
          ${unit},
          v.checked_in_at,
          'UTC'
        ) AS bucket_start,
        COUNT(*)::int AS count,
        COUNT(
          DISTINCT v.student_id
        )::int AS unique_visitors

      FROM library_visits v

      INNER JOIN branches br
        ON br.id = v.branch_id
       AND br.is_active = TRUE

      WHERE v.checked_in_at >= ${from}
        AND v.checked_in_at < ${to}
        ${branchVisit}

      GROUP BY 1
    )

    SELECT
      b.bucket_start
        AS "bucketStart",

      COALESCE(
        rc.count,
        0
      )::int
        AS "reservationsCreated",

      COALESCE(
        bc.count,
        0
      )::int
        AS "borrowingsStarted",

      COALESCE(
        rtc.count,
        0
      )::int
        AS "returns",

      COALESCE(
        vc.count,
        0
      )::int
        AS "visits",

      COALESCE(
        vc.unique_visitors,
        0
      )::int
        AS "uniqueVisitors"

    FROM buckets b

    LEFT JOIN reservation_counts rc
      ON rc.bucket_start =
         b.bucket_start

    LEFT JOIN borrowing_counts bc
      ON bc.bucket_start =
         b.bucket_start

    LEFT JOIN return_counts rtc
      ON rtc.bucket_start =
         b.bucket_start

    LEFT JOIN visit_counts vc
      ON vc.bucket_start =
         b.bucket_start

    ORDER BY b.bucket_start ASC
  `;
}

export async function getAnalyticsTrends({
  branchId,
  from,
  to,
  bucket
}) {
  const branch =
    await validateBranch(
      branchId
    );

  const rows =
    await prisma.$queryRaw(
      buildTrendSql({
        branchId,
        from,
        to,
        bucket
      })
    );

  return {
    scope: {
      branch,
      from,
      to,
      bucket,
      bucketTimezone: 'UTC',
      periodSemantics:
        '[from, to)'
    },

    data: rows.map(
      (row) => ({
        bucketStart:
          row.bucketStart,
        reservationsCreated:
          Number(
            row.reservationsCreated
          ),
        borrowingsStarted:
          Number(
            row.borrowingsStarted
          ),
        returns:
          Number(
            row.returns
          ),
        visits:
          Number(
            row.visits
          ),
        uniqueVisitors:
          Number(
            row.uniqueVisitors
          )
      })
    )
  };
}

export async function getAnalyticsBranchComparison({
  from,
  to
}) {
  const now =
    new Date();

  const rows =
    await prisma.$queryRaw(
      Prisma.sql`
        WITH copy_stats AS (
          SELECT
            pc.branch_id,

            COUNT(*) FILTER (
              WHERE pc.status
                <> 'ARCHIVED'
            )::int
              AS physical_copies,

            COUNT(*) FILTER (
              WHERE pc.status
                = 'AVAILABLE'
            )::int
              AS available_copies

          FROM physical_copies pc
          GROUP BY pc.branch_id
        ),

        reservation_period AS (
          SELECT
            r.branch_id,
            COUNT(*)::int
              AS created_in_period
          FROM reservations r
          WHERE r.reserved_at >= ${from}
            AND r.reserved_at < ${to}
          GROUP BY r.branch_id
        ),

        borrowing_period AS (
          SELECT
            b.branch_id,
            COUNT(*)::int
              AS started_in_period
          FROM borrowings b
          WHERE b.borrowed_at >= ${from}
            AND b.borrowed_at < ${to}
          GROUP BY b.branch_id
        ),

        return_period AS (
          SELECT
            b.branch_id,
            COUNT(*)::int
              AS returns_in_period
          FROM borrowings b
          WHERE b.status = 'RETURNED'
            AND b.returned_at >= ${from}
            AND b.returned_at < ${to}
          GROUP BY b.branch_id
        ),

        loan_snapshot AS (
          SELECT
            b.branch_id,

            COUNT(*) FILTER (
              WHERE b.status = 'ACTIVE'
            )::int
              AS active_loans,

            COUNT(*) FILTER (
              WHERE b.status = 'ACTIVE'
                AND b.due_at < ${now}
            )::int
              AS overdue_loans

          FROM borrowings b
          GROUP BY b.branch_id
        ),

        visit_period AS (
          SELECT
            v.branch_id,

            COUNT(*)::int
              AS visits_in_period,

            COUNT(
              DISTINCT v.student_id
            )::int
              AS unique_visitors

          FROM library_visits v
          WHERE v.checked_in_at >= ${from}
            AND v.checked_in_at < ${to}
          GROUP BY v.branch_id
        )

        SELECT
          br.id,
          br.code,
          br.name,
          br.location,

          COALESCE(
            cs.physical_copies,
            0
          )::int
            AS "physicalCopies",

          COALESCE(
            cs.available_copies,
            0
          )::int
            AS "availableCopies",

          COALESCE(
            rp.created_in_period,
            0
          )::int
            AS "reservationsCreatedInPeriod",

          COALESCE(
            bp.started_in_period,
            0
          )::int
            AS "borrowingsStartedInPeriod",

          COALESCE(
            ret.returns_in_period,
            0
          )::int
            AS "returnsInPeriod",

          COALESCE(
            ls.active_loans,
            0
          )::int
            AS "activeLoans",

          COALESCE(
            ls.overdue_loans,
            0
          )::int
            AS "overdueLoans",

          COALESCE(
            vp.visits_in_period,
            0
          )::int
            AS "visitsInPeriod",

          COALESCE(
            vp.unique_visitors,
            0
          )::int
            AS "uniqueVisitorsInPeriod"

        FROM branches br

        LEFT JOIN copy_stats cs
          ON cs.branch_id = br.id

        LEFT JOIN reservation_period rp
          ON rp.branch_id = br.id

        LEFT JOIN borrowing_period bp
          ON bp.branch_id = br.id

        LEFT JOIN return_period ret
          ON ret.branch_id = br.id

        LEFT JOIN loan_snapshot ls
          ON ls.branch_id = br.id

        LEFT JOIN visit_period vp
          ON vp.branch_id = br.id

        WHERE br.is_active = TRUE

        ORDER BY br.name ASC,
                 br.id ASC
      `
    );

  return {
    scope: {
      from,
      to,
      generatedAt: now,
      periodSemantics:
        '[from, to)'
    },

    data: rows.map(
      (row) => ({
        branch: {
          id: row.id,
          code: row.code,
          name: row.name,
          location:
            row.location
        },

        catalog: {
          physicalCopies:
            Number(
              row.physicalCopies
            ),
          availableCopies:
            Number(
              row.availableCopies
            ),
          availabilityRatePercent:
            roundPercent(
              Number(
                row.availableCopies
              ),
              Number(
                row.physicalCopies
              )
            )
        },

        reservations: {
          createdInPeriod:
            Number(
              row.reservationsCreatedInPeriod
            )
        },

        circulation: {
          activeLoans:
            Number(
              row.activeLoans
            ),
          overdueLoans:
            Number(
              row.overdueLoans
            ),
          overdueLoanRatePercent:
            roundPercent(
              Number(
                row.overdueLoans
              ),
              Number(
                row.activeLoans
              )
            ),
          borrowingsStartedInPeriod:
            Number(
              row.borrowingsStartedInPeriod
            ),
          returnsInPeriod:
            Number(
              row.returnsInPeriod
            )
        },

        visits: {
          visitsInPeriod:
            Number(
              row.visitsInPeriod
            ),
          uniqueVisitorsInPeriod:
            Number(
              row.uniqueVisitorsInPeriod
            )
        }
      }))
  };
}

function buildTopBorrowingItemsSql({
  branchId,
  from,
  to,
  limit
}) {
  const branchClause =
    branchId
      ? Prisma.sql`
          AND b.branch_id =
            ${branchId}::uuid
        `
      : Prisma.empty;

  return Prisma.sql`
    SELECT
      li.id,
      li.type,
      li.title,
      li.call_number
        AS "callNumber",
      COUNT(*)::int
        AS count

    FROM borrowings b

    INNER JOIN branches br
      ON br.id = b.branch_id
     AND br.is_active = TRUE

    INNER JOIN physical_copies pc
      ON pc.id = b.copy_id

    INNER JOIN library_items li
      ON li.id = pc.item_id

    WHERE b.borrowed_at >= ${from}
      AND b.borrowed_at < ${to}
      ${branchClause}

    GROUP BY
      li.id,
      li.type,
      li.title,
      li.call_number

    ORDER BY
      count DESC,
      li.title ASC,
      li.id ASC

    LIMIT ${limit}
  `;
}

function buildTopReservationItemsSql({
  branchId,
  from,
  to,
  limit
}) {
  const branchClause =
    branchId
      ? Prisma.sql`
          AND r.branch_id =
            ${branchId}::uuid
        `
      : Prisma.empty;

  return Prisma.sql`
    SELECT
      li.id,
      li.type,
      li.title,
      li.call_number
        AS "callNumber",
      COUNT(*)::int
        AS count

    FROM reservations r

    INNER JOIN branches br
      ON br.id = r.branch_id
     AND br.is_active = TRUE

    INNER JOIN library_items li
      ON li.id = r.item_id

    WHERE r.reserved_at >= ${from}
      AND r.reserved_at < ${to}
      ${branchClause}

    GROUP BY
      li.id,
      li.type,
      li.title,
      li.call_number

    ORDER BY
      count DESC,
      li.title ASC,
      li.id ASC

    LIMIT ${limit}
  `;
}

export async function getTopAnalyticsItems({
  metric,
  branchId,
  from,
  to,
  limit
}) {
  const branch =
    await validateBranch(
      branchId
    );

  const query =
    metric === 'BORROWINGS'
      ? buildTopBorrowingItemsSql({
          branchId,
          from,
          to,
          limit
        })
      : buildTopReservationItemsSql({
          branchId,
          from,
          to,
          limit
        });

  const rows =
    await prisma.$queryRaw(
      query
    );

  return {
    scope: {
      metric,
      branch,
      from,
      to,
      limit,
      periodSemantics:
        '[from, to)'
    },

    data: rows.map(
      (row, index) => ({
        rank:
          index + 1,
        item: {
          id: row.id,
          type: row.type,
          title: row.title,
          callNumber:
            row.callNumber
        },
        count:
          Number(row.count)
      })
    )
  };
}

