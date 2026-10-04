import { loadEnvFile } from 'node:process';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  execFileSync
} from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename =
  fileURLToPath(
    import.meta.url
  );

const __dirname =
  path.dirname(
    __filename
  );

const projectRoot =
  path.resolve(
    __dirname,
    '../..'
  );

loadEnvFile(
  path.join(
    projectRoot,
    '.env'
  )
);

import { prisma } from '../../apps/api/src/config/prisma.js';

const manifestPath =
  path.join(
    projectRoot,
    'docs/release/mvp-rc1-manifest.json'
  );

async function sha256File(
  filePath
) {
  const buffer =
    await fs.readFile(
      filePath
    );

  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}

function getTrackedEnv() {
  try {
    return execFileSync(
      'git',
      [
        'ls-files',
        '--',
        '.env'
      ],
      {
        cwd:
          projectRoot,
        encoding:
          'utf8'
      }
    ).trim();
  } catch {
    return '';
  }
}

async function main() {
  console.log(
    'Verifying SAMS MVP RC1 release state...'
  );

  const manifest =
    JSON.parse(
      await fs.readFile(
        manifestPath,
        'utf8'
      )
    );

  if (
    manifest.release
      ?.label !==
    'SAMS-MVP-RC1'
  ) {
    throw new Error(
      'Unexpected release manifest label.'
    );
  }

  if (
    manifest.status
      ?.legacyFullMigrationApproved !==
    false
  ) {
    throw new Error(
      'MVP RC must not claim full legacy migration approval.'
    );
  }

  for (
    const entry of
    manifest.sourceSnapshot
      .files
  ) {
    const filePath =
      path.join(
        projectRoot,
        entry.path
      );

    const hash =
      await sha256File(
        filePath
      );

    if (
      hash !==
      entry.sha256
    ) {
      throw new Error(
        `RC source changed after manifest generation: ${entry.path}`
      );
    }
  }

  console.log(
    'Release source hashes: OK'
  );

  const fingerprintInput =
    manifest
      .sourceSnapshot
      .files
      .map(
        (entry) =>
          `${entry.path}:${entry.sha256}`
      )
      .join('\n');

  const fingerprint =
    crypto
      .createHash('sha256')
      .update(
        fingerprintInput
      )
      .digest('hex');

  if (
    fingerprint !==
    manifest
      .sourceSnapshot
      .contentFingerprint
  ) {
    throw new Error(
      'Release content fingerprint mismatch.'
    );
  }

  console.log(
    'Release content fingerprint: OK'
  );

  if (
    getTrackedEnv() ===
    '.env'
  ) {
    throw new Error(
      '.env is tracked by Git. Remove secrets from version control before release.'
    );
  }

  console.log(
    '.env Git tracking protection: OK'
  );

  const [
    studentUser,
    librarianUser,
    managementUser,
    devFaculty,
    devDepartment,
    mainBranch,
    pilotBranches,
    pilotLogs
  ] = await Promise.all([
    prisma.user.findUnique({
      where: {
        universityEmail:
          'student@sams.dev'
      },
      include: {
        userRoles: {
          include: {
            role: true
          }
        }
      }
    }),

    prisma.user.findUnique({
      where: {
        universityEmail:
          'librarian@sams.dev'
      },
      include: {
        userRoles: {
          include: {
            role: true
          }
        }
      }
    }),

    prisma.user.findUnique({
      where: {
        universityEmail:
          'management@sams.dev'
      },
      include: {
        userRoles: {
          include: {
            role: true
          }
        }
      }
    }),

    prisma.faculty.findUnique({
      where: {
        name:
          'DEV Faculty'
      }
    }),

    prisma.department.findFirst({
      where: {
        name:
          'DEV Department',
        faculty: {
          name:
            'DEV Faculty'
        }
      }
    }),

    prisma.branch.findUnique({
      where: {
        code:
          'MAIN'
      }
    }),

    prisma.branch.count({
      where: {
        code: {
          startsWith:
            'LEGACY_PILOT_'
        }
      }
    }),

    prisma.auditLog.count({
      where: {
        action:
          'LEGACY_PILOT_IMPORT'
      }
    })
  ]);

  const expectedRoles = [
    [
      studentUser,
      'STUDENT'
    ],
    [
      librarianUser,
      'LIBRARIAN'
    ],
    [
      managementUser,
      'MANAGEMENT'
    ]
  ];

  for (
    const [
      user,
      roleName
    ] of expectedRoles
  ) {
    if (!user) {
      throw new Error(
        `Missing persistent ${roleName} development user.`
      );
    }

    const roles =
      user.userRoles.map(
        (entry) =>
          entry.role.name
      );

    if (
      !roles.includes(
        roleName
      )
    ) {
      throw new Error(
        `Persistent development user is missing ${roleName}.`
      );
    }

    console.log(
      `${roleName} role: OK`
    );
  }

  if (
    !devFaculty?.isActive ||
    !devDepartment?.isActive ||
    !mainBranch?.isActive
  ) {
    throw new Error(
      'Persistent DEV Faculty / DEV Department / MAIN branch seed is incomplete.'
    );
  }

  console.log(
    'Persistent master-data seed: OK'
  );

  if (
    pilotBranches !== 0 ||
    pilotLogs !== 0
  ) {
    throw new Error(
      `Legacy pilot cleanup incomplete: branches=${pilotBranches}, logs=${pilotLogs}`
    );
  }

  console.log(
    'Legacy pilot DB artifacts: CLEAN'
  );

  console.log('');
  console.log(
    'SAMS MVP RC1 release-state verification PASSED.'
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
