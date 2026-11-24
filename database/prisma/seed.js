import { PrismaClient, AcademicStatus } from '@prisma/client';
const prisma = new PrismaClient();

async function ensureUserRole(userId, roleId) {
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId,
        roleId
      }
    },
    update: {},
    create: {
      userId,
      roleId
    }
  });
}

async function main() {
  const roleNames = ['STUDENT', 'LIBRARIAN', 'MANAGEMENT'];
  const roles = {};

  for (const name of roleNames) {
    roles[name] = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  const faculty = await prisma.faculty.upsert({
    where: { name: 'كلية الحاسبات والمعلومات' },
    update: {},
    create: {
      name: 'كلية الحاسبات والمعلومات',
      isActive: true
    }
  });

  const department = await prisma.department.upsert({
    where: {
      facultyId_name: {
        facultyId: faculty.id,
        name: 'نظم المعلومات'
      }
    },
    update: {},
    create: {
      facultyId: faculty.id,
      name: 'نظم المعلومات',
      isActive: true
    }
  });

  await prisma.branch.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: {
      code: 'MAIN',
      name: 'المكتبة الرئيسية',
      location: 'المبنى الرئيسي',
      isActive: true
    }
  });

  const studentUser = await prisma.user.upsert({
    where: { universityEmail: 'student@sams.dev' },
    update: {
      displayName: 'محمد أحمد حسن',
      isActive: true
    },
    create: {
      universityEmail: 'student@sams.dev',
      displayName: 'محمد أحمد حسن',
      isActive: true
    }
  });

  await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {
      studentId: 'DEV-STUDENT-001',
      facultyId: faculty.id,
      departmentId: department.id,
      academicStatus: AcademicStatus.ACTIVE
    },
    create: {
      userId: studentUser.id,
      studentId: 'DEV-STUDENT-001',
      facultyId: faculty.id,
      departmentId: department.id,
      academicStatus: AcademicStatus.ACTIVE
    }
  });

  await ensureUserRole(studentUser.id, roles.STUDENT.id);

  const librarianUser = await prisma.user.upsert({
    where: { universityEmail: 'librarian@sams.dev' },
    update: {
      displayName: 'منى عبد الرحمن',
      isActive: true
    },
    create: {
      universityEmail: 'librarian@sams.dev',
      displayName: 'منى عبد الرحمن',
      isActive: true
    }
  });

  await ensureUserRole(librarianUser.id, roles.LIBRARIAN.id);

  const managementUser = await prisma.user.upsert({
    where: { universityEmail: 'management@sams.dev' },
    update: {
      displayName: 'أحمد سامي',
      isActive: true
    },
    create: {
      universityEmail: 'management@sams.dev',
      displayName: 'أحمد سامي',
      isActive: true
    }
  });

  await ensureUserRole(managementUser.id, roles.MANAGEMENT.id);

  // Librarians act only with permissions Management gives them; start the dev
  // librarian with the full set.
  const { grantBaselineToUnconfiguredLibrarians } = await import('../../apps/api/src/modules/staff/staff.service.js');
  await grantBaselineToUnconfiguredLibrarians('management@sams.dev', prisma);

  console.log('Seeded roles and Sprint 1 development users');
  console.log('  student@sams.dev');
  console.log('  librarian@sams.dev');
  console.log('  management@sams.dev');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
