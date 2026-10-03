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
    where: { name: 'DEV Faculty' },
    update: {},
    create: {
      name: 'DEV Faculty',
      isActive: true
    }
  });

  const department = await prisma.department.upsert({
    where: {
      facultyId_name: {
        facultyId: faculty.id,
        name: 'DEV Department'
      }
    },
    update: {},
    create: {
      facultyId: faculty.id,
      name: 'DEV Department',
      isActive: true
    }
  });

  await prisma.branch.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: {
      code: 'MAIN',
      name: 'Main Library',
      location: 'Development Seed',
      isActive: true
    }
  });

  const studentUser = await prisma.user.upsert({
    where: { universityEmail: 'student@sams.dev' },
    update: {
      displayName: 'Dev Student',
      isActive: true
    },
    create: {
      universityEmail: 'student@sams.dev',
      displayName: 'Dev Student',
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
      displayName: 'Dev Librarian',
      isActive: true
    },
    create: {
      universityEmail: 'librarian@sams.dev',
      displayName: 'Dev Librarian',
      isActive: true
    }
  });

  await ensureUserRole(librarianUser.id, roles.LIBRARIAN.id);

  const managementUser = await prisma.user.upsert({
    where: { universityEmail: 'management@sams.dev' },
    update: {
      displayName: 'Dev Management',
      isActive: true
    },
    create: {
      universityEmail: 'management@sams.dev',
      displayName: 'Dev Management',
      isActive: true
    }
  });

  await ensureUserRole(managementUser.id, roles.MANAGEMENT.id);

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
