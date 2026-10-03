import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';
import { issueAccessToken } from './token.service.js';

const userInclude = {
  userRoles: {
    include: {
      role: true
    }
  },
  student: {
    include: {
      faculty: true,
      department: true
    }
  }
};

export function toPublicAuthUser(user) {
  return {
    id: user.id,
    universityEmail: user.universityEmail,
    displayName: user.displayName,
    roles: user.userRoles.map(({ role }) => role.name),
    student: user.student
      ? {
          studentId: user.student.studentId,
          academicStatus: user.student.academicStatus,
          faculty: user.student.faculty
            ? {
                id: user.student.faculty.id,
                name: user.student.faculty.name
              }
            : null,
          department: user.student.department
            ? {
                id: user.student.department.id,
                name: user.student.department.name
              }
            : null
        }
      : null
  };
}

export async function devLogin(universityEmail) {
  if (!env.DEV_AUTH_ENABLED || env.NODE_ENV === 'production') {
    throw new AppError(404, 'NOT_FOUND', 'Route not found');
  }

  const user = await prisma.user.findUnique({
    where: { universityEmail },
    include: userInclude
  });

  if (!user || !user.isActive) {
    throw new AppError(401, 'INVALID_DEV_USER', 'Development user is invalid or inactive');
  }

  return {
    accessToken: issueAccessToken(user),
    tokenType: 'Bearer',
    expiresIn: env.AUTH_TOKEN_EXPIRES_IN,
    user: toPublicAuthUser(user)
  };
}

export async function getAuthUserById(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: userInclude
  });

  if (!user || !user.isActive) {
    throw new AppError(401, 'UNAUTHORIZED', 'User is inactive or no longer exists');
  }

  return user;
}
