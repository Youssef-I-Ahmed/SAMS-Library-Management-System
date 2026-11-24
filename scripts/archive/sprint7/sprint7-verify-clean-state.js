import { loadEnvFile } from 'node:process';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
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

const pilotDir =
  path.join(
    projectRoot,
    'data/processed/legacy-pilot'
  );

const evidencePath =
  path.join(
    pilotDir,
    'evidence/sprint7-evidence-manifest.json'
  );

const configPath =
  path.join(
    __dirname,
    'sprint7c-pilot-config.json'
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

async function main() {
  console.log(
    'Verifying Sprint 7 migration evidence and clean DB state...'
  );

  const evidence =
    JSON.parse(
      await fs.readFile(
        evidencePath,
        'utf8'
      )
    );

  const config =
    JSON.parse(
      await fs.readFile(
        configPath,
        'utf8'
      )
    );

  if (
    evidence.status !==
    'PILOT_EVIDENCE_COMPLETE_FULL_MIGRATION_NOT_APPROVED'
  ) {
    throw new Error(
      'Sprint 7 evidence status is not the expected pilot-only status.'
    );
  }

  if (
    evidence.sourceSnapshot
      .rawRows !==
    6042
  ) {
    throw new Error(
      `Expected 6,042 raw rows in evidence manifest, found ${evidence.sourceSnapshot.rawRows}.`
    );
  }

  if (
    evidence.transformSnapshot
      .canonicalBooks !==
    22
  ) {
    throw new Error(
      'Expected 22 canonical book candidates.'
    );
  }

  if (
    evidence.transformSnapshot
      .explicitCopyPreviewRows !==
    34
  ) {
    throw new Error(
      'Expected 34 copy preview rows.'
    );
  }

  if (
    evidence.transformSnapshot
      .autoMergedRows !==
    0
  ) {
    throw new Error(
      'Sprint 7 must not auto-merge legacy candidates.'
    );
  }

  if (
    evidence.dbPilotSnapshot
      .importedItems !==
    3 ||
    evidence.dbPilotSnapshot
      .importedCopies !==
    4
  ) {
    throw new Error(
      'Controlled DB pilot evidence counts are incorrect.'
    );
  }

  if (
    evidence.principles
      .fullMigrationApproved !==
    false
  ) {
    throw new Error(
      'Sprint 7 must not mark full legacy migration as approved.'
    );
  }

  for (
    const source of
    evidence
      .sourceSnapshot
      .sources
  ) {
    const rawPath =
      path.join(
        projectRoot,
        'data/raw',
        source.fileName
      );

    const currentHash =
      await sha256File(
        rawPath
      );

    if (
      currentHash !==
      source.sha256
    ) {
      throw new Error(
        `Raw source changed after evidence creation: ${source.fileName}`
      );
    }
  }

  for (
    const file of
    evidence.evidenceFiles
  ) {
    const absolutePath =
      path.join(
        projectRoot,
        file.path
      );

    const currentHash =
      await sha256File(
        absolutePath
      );

    if (
      currentHash !==
      file.sha256
    ) {
      throw new Error(
        `Evidence output changed after manifest creation: ${file.path}`
      );
    }
  }

  console.log(
    'Evidence file hashes: OK'
  );
  console.log(
    'Raw input hashes unchanged: OK'
  );

  const branchCodes =
    Object.values(
      config
        .sourceDbToPilotBranch
    ).map(
      (entry) =>
        entry.code
    );

  const importResult =
    JSON.parse(
      await fs.readFile(
        path.join(
          pilotDir,
          'db-pilot/db-pilot-import-result.json'
        ),
        'utf8'
      )
    );

  const importedItemIds =
    importResult
      .items
      .map(
        (item) =>
          item.itemId
      );

  const importedCopyIds =
    importResult
      .items
      .flatMap(
        (item) =>
          item.copies
      );

  const [
    pilotBranchCount,
    pilotAuditCount,
    importedItemCount,
    importedCopyCount,
    studentUser,
    librarianUser,
    managementUser,
    devFaculty,
    devDepartment,
    mainBranch
  ] = await Promise.all([
    prisma.branch.count({
      where: {
        code: {
          in:
            branchCodes
        }
      }
    }),

    prisma.auditLog.count({
      where: {
        action:
          'LEGACY_PILOT_IMPORT',
        metadata: {
          path: [
            'pilotTag'
          ],
          equals:
            config.pilotTag
        }
      }
    }),

    prisma.libraryItem.count({
      where: {
        id: {
          in:
            importedItemIds
        }
      }
    }),

    prisma.physicalCopy.count({
      where: {
        id: {
          in:
            importedCopyIds
        }
      }
    }),

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
    })
  ]);

  if (
    pilotBranchCount !== 0
  ) {
    throw new Error(
      `Expected 0 temporary pilot branches, found ${pilotBranchCount}.`
    );
  }

  if (
    pilotAuditCount !== 0
  ) {
    throw new Error(
      `Expected 0 pilot AuditLogs after cleanup, found ${pilotAuditCount}.`
    );
  }

  if (
    importedItemCount !== 0
  ) {
    throw new Error(
      `Expected imported pilot items to be cleaned, found ${importedItemCount}.`
    );
  }

  if (
    importedCopyCount !== 0
  ) {
    throw new Error(
      `Expected imported pilot copies to be cleaned, found ${importedCopyCount}.`
    );
  }

  console.log(
    'Temporary pilot DB records: CLEAN'
  );

  const expectedRoles = [
    [
      studentUser,
      'STUDENT',
      'student@sams.dev'
    ],
    [
      librarianUser,
      'LIBRARIAN',
      'librarian@sams.dev'
    ],
    [
      managementUser,
      'MANAGEMENT',
      'management@sams.dev'
    ]
  ];

  for (
    const [
      user,
      roleName,
      email
    ] of expectedRoles
  ) {
    if (!user) {
      throw new Error(
        `Missing persistent dev user: ${email}`
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
        `${email} is missing expected role ${roleName}.`
      );
    }

    console.log(
      `${roleName} role: OK`
    );
  }

  if (!devFaculty?.isActive) {
    throw new Error(
      'Active DEV Faculty is missing.'
    );
  }

  console.log(
    'DEV Faculty: OK'
  );

  if (!devDepartment?.isActive) {
    throw new Error(
      'Active DEV Department is missing.'
    );
  }

  console.log(
    'DEV Department: OK'
  );

  if (!mainBranch?.isActive) {
    throw new Error(
      'Active MAIN branch is missing.'
    );
  }

  console.log(
    'MAIN branch: OK'
  );

  console.log('');
  console.log(
    'Sprint 7 clean-state verification PASSED.'
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
      await prisma.$disconnect();
    }
  );
