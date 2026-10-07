// Entirely invented development fixtures. No legacy inputs or migration rules.
export function assertFrontendSeedEnvironment(env) {
  if (env.NODE_ENV !== 'development' || env.SAMS_FRONTEND_SEED !== 'true') {
    throw new Error('Frontend fixtures require NODE_ENV=development and SAMS_FRONTEND_SEED=true; use a disposable development database.');
  }
}

const id = (n) => `de000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export async function seedFrontendFixtures(prisma, context, now = new Date()) {
  const { studentId, librarianId, studentRoleId, facultyId, departmentId } = context;
  const days = (offset) => new Date(now.getTime() + offset * 86400000);

  // A single transaction makes the sentinel reliable. Reruns preserve UI edits,
  // completed loans and original timestamps instead of resetting circulation.
  return prisma.$transaction(async (tx) => {
    if (await tx.libraryItem.findUnique({ where: { id: id(100) } })) {
      console.log('Frontend fixtures already present; preserved existing state.');
      return;
    }

    const branches = [];
    for (const [index, code] of ['DEV-FRONTEND-A', 'DEV-FRONTEND-B'].entries()) {
      branches.push(await tx.branch.create({ data: {
        id: id(10 + index), code, name: `DEV Frontend Library ${index + 1}`,
        location: 'Synthetic frontend fixture'
      } }));
    }
    const category = await tx.category.create({ data: {
      id: id(20), name: 'DEV Computing', description: 'Synthetic frontend category'
    } });
    const parent = await tx.deweyClassification.upsert({
      where: { code: '000' }, update: {},
      create: { id: id(30), code: '000', name: 'Computer science, information and general works' }
    });
    const dewey = await tx.deweyClassification.upsert({
      where: { code: '004' }, update: {},
      create: { id: id(31), code: '004', name: 'Computer science', parentId: parent.id }
    });
    const contributor = await tx.contributor.create({ data: {
      id: id(40), fullName: 'DEV Demo Researcher'
    } });

    // A second eligible student supports ownership/last-copy scenarios; a
    // suspended student supports eligibility rejection without altering the baseline user.
    for (const [n, email, status] of [
      [50, 'student2@sams.dev', 'ACTIVE'],
      [51, 'suspended@sams.dev', 'SUSPENDED']
    ]) {
      await tx.user.create({ data: {
        id: id(n), universityEmail: email, displayName: `DEV ${status} Student ${n}`,
        student: { create: { studentId: `DEV-FRONTEND-${n}`, facultyId, departmentId, academicStatus: status } },
        userRoles: { create: { roleId: studentRoleId } }
      } });
    }

    const items = [
      [100, 'BOOK', 'DEV Introduction to Computing', 'en', true],
      [101, 'BOOK', 'DEV مقدمة في نظم المعلومات', 'ar', true],
      [102, 'THESIS', 'DEV Library Discovery Research', 'en', true],
      [103, 'PROJECT', 'DEV Student Catalog Prototype', 'en', true],
      [104, 'BOOK', 'DEV Archived Catalog Example', 'en', false]
    ];
    for (const [n, type, title, language, isActive] of items) {
      await tx.libraryItem.create({ data: {
        id: id(n), type, title, language, isActive,
        categoryId: category.id, deweyClassificationId: dewey.id,
        deweyCodeRaw: '004', callNumber: `004 / DEV-${n}`,
        publicationYear: n === 101 ? null : 2025,
        abstractDescription: 'Invented example for frontend development only.',
        ...(type === 'BOOK'
          ? { bookDetails: { create: {
              isbn: n === 100 ? '9780000000002' : null,
              publisher: 'DEV Example Press', edition: 'Demo edition'
            } } }
          : { academicWorkDetails: { create: {
              facultyId, departmentId, academicYear: '2025/2026', workType: type
            } } }),
        itemContributors: { create: {
          contributorId: contributor.id,
          role: type === 'BOOK' ? 'AUTHOR' : type === 'THESIS' ? 'RESEARCHER' : 'PROJECT_MEMBER'
        } }
      } });
    }

    for (const branch of branches) {
      await tx.circulationPolicy.create({ data: {
        id: id(branch.id === id(10) ? 60 : 61), branchId: branch.id,
        loanDays: 14, reservationHoldHours: 48, maxActiveLoans: 5,
        maxActiveReservations: 3, renewalLimit: 0, effectiveFrom: days(-365)
      } });
    }

    // Project 103 deliberately has no copies. Book 101 has no available copies.
    const copies = [
      [200, 100, 0, 'AVAILABLE'], [201, 100, 0, 'RESERVED'],
      [202, 100, 1, 'BORROWED'], [203, 101, 0, 'UNAVAILABLE'],
      [204, 101, 0, 'DAMAGED'], [205, 102, 1, 'AVAILABLE'],
      [206, 104, 0, 'ARCHIVED']
    ];
    for (const [n, item, branch, status] of copies) {
      await tx.physicalCopy.create({ data: {
        id: id(n), itemId: id(item), branchId: branches[branch].id,
        copyCode: `DEV-FE-${n}`, barcode: `DEV-FE-BARCODE-${n}`,
        shelfLocation: `DEV Shelf ${branch + 1}`, status,
        condition: status === 'DAMAGED' ? 'DAMAGED' : 'GOOD'
      } });
    }
    await tx.reservation.create({ data: {
      id: id(300), studentId, itemId: id(100), branchId: branches[0].id,
      allocatedCopyId: id(201), status: 'ACTIVE', reservedAt: now, expiresAt: days(2)
    } });
    await tx.reservation.create({ data: {
      id: id(301), studentId, itemId: id(102), branchId: branches[1].id,
      allocatedCopyId: id(205), status: 'FULFILLED',
      reservedAt: days(-12), expiresAt: days(-10), fulfilledAt: days(-11)
    } });
    await tx.borrowing.create({ data: {
      id: id(310), studentId, copyId: id(202), branchId: branches[1].id,
      checkedOutById: librarianId, status: 'ACTIVE', borrowedAt: days(-16), dueAt: days(-2)
    } });
    await tx.borrowing.create({ data: {
      id: id(311), studentId, copyId: id(205), branchId: branches[1].id,
      reservationId: id(301), checkedOutById: librarianId, returnedById: librarianId,
      status: 'RETURNED', borrowedAt: days(-11), dueAt: days(3), returnedAt: days(-3),
      returnCondition: 'GOOD', notes: 'Synthetic completed circulation example'
    } });
    await tx.libraryVisit.create({ data: {
      id: id(320), studentId, branchId: branches[0].id,
      registeredById: librarianId, checkedInAt: now, source: 'MANUAL'
    } });
    await tx.libraryVisit.create({ data: {
      id: id(321), studentId, branchId: branches[1].id,
      registeredById: librarianId, checkoutById: librarianId,
      checkedInAt: days(-3), checkedOutAt: new Date(days(-3).getTime() + 3600000), source: 'MANUAL'
    } });
    console.log('Created synthetic frontend fixtures: 5 items, 7 copies, 2 reservations, 2 loans and 2 visits.');
  }, { timeout: 30000 });
}
