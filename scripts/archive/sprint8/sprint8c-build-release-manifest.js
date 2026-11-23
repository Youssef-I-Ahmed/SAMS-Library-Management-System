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

const outputDir =
  path.join(
    projectRoot,
    'docs/release'
  );

const outputPath =
  path.join(
    outputDir,
    'mvp-rc1-manifest.json'
  );

const INCLUDE_PATHS = [
  'package.json',
  'package-lock.json',
  '.env.example',
  'prisma/schema.prisma',
  'database/sql/postgres-extensions.sql',
  'apps/api/src',
  'apps/api/tests',
  'scripts/sprint1',
  'scripts/sprint2',
  'scripts/sprint3',
  'scripts/sprint4',
  'scripts/sprint5',
  'scripts/sprint6',
  'scripts/sprint7',
  'scripts/sprint8',
  'docs/analytics',
  'docs/hardening',
  'docs/migration'
];

const EXCLUDED_NAMES =
  new Set([
    'node_modules',
    '.git',
    'dist',
    '.cache'
  ]);

async function exists(
  filePath
) {
  try {
    await fs.access(
      filePath
    );

    return true;
  } catch {
    return false;
  }
}

async function collectFiles(
  absolutePath
) {
  const stat =
    await fs.stat(
      absolutePath
    );

  if (stat.isFile()) {
    return [
      absolutePath
    ];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  const files = [];

  const entries =
    await fs.readdir(
      absolutePath,
      {
        withFileTypes: true
      }
    );

  entries.sort(
    (
      left,
      right
    ) =>
      left.name.localeCompare(
        right.name
      )
  );

  for (
    const entry of
    entries
  ) {
    if (
      EXCLUDED_NAMES.has(
        entry.name
      )
    ) {
      continue;
    }

    files.push(
      ...await collectFiles(
        path.join(
          absolutePath,
          entry.name
        )
      )
    );
  }

  return files;
}

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
  const packageJson =
    JSON.parse(
      await fs.readFile(
        path.join(
          projectRoot,
          'package.json'
        ),
        'utf8'
      )
    );

  const files = [];

  for (
    const relativePath of
    INCLUDE_PATHS
  ) {
    const absolutePath =
      path.join(
        projectRoot,
        relativePath
      );

    if (
      !await exists(
        absolutePath
      )
    ) {
      throw new Error(
        `Required RC manifest path is missing: ${relativePath}`
      );
    }

    files.push(
      ...await collectFiles(
        absolutePath
      )
    );
  }

  const uniqueFiles =
    [...new Set(files)]
      .sort();

  const entries = [];

  for (
    const filePath of
    uniqueFiles
  ) {
    const relativePath =
      path.relative(
        projectRoot,
        filePath
      ).replace(
        /\\/g,
        '/'
      );

    const stat =
      await fs.stat(
        filePath
      );

    entries.push({
      path:
        relativePath,
      bytes:
        stat.size,
      sha256:
        await sha256File(
          filePath
        )
    });
  }

  const fingerprintInput =
    entries
      .map(
        (entry) =>
          `${entry.path}:${entry.sha256}`
      )
      .join('\n');

  const contentFingerprint =
    crypto
      .createHash('sha256')
      .update(
        fingerprintInput
      )
      .digest('hex');

  const sprint7EvidencePath =
    path.join(
      projectRoot,
      'data/processed/legacy-pilot/evidence/sprint7-evidence-manifest.json'
    );

  const sprint7EvidenceSha256 =
    await exists(
      sprint7EvidencePath
    )
      ? await sha256File(
          sprint7EvidencePath
        )
      : null;

  const manifest = {
    generatedAt:
      new Date()
        .toISOString(),

    release: {
      label:
        'SAMS-MVP-RC1',
      projectVersion:
        packageJson.version ??
        null,
      nodeVersion:
        process.version
    },

    status: {
      releaseCandidate:
        true,
      productionDeploymentPerformed:
        false,
      legacyFullMigrationApproved:
        false
    },

    verifiedCapabilities: [
      'AUTH_RBAC',
      'MASTER_DATA',
      'STUDENT_SYNC_ADAPTER',
      'CATALOG_INVENTORY',
      'STUDENT_DISCOVERY',
      'RESERVATIONS',
      'BORROW_RETURN_OVERDUE',
      'LIBRARY_VISITS',
      'ANALYTICS',
      'LEGACY_MIGRATION_PILOT',
      'HTTP_SECURITY_BASELINE',
      'LIVENESS_READINESS',
      'GRACEFUL_SHUTDOWN',
      'POSTGRESQL_CUSTOM_CONTRACT',
      'BACKUP_RESTORE_SMOKE'
    ],

    deploymentDependencies: {
      node:
        '>=20',
      postgresql:
        '16-compatible',
      requiredProductionDecisions: [
        'REAL_UNIVERSITY_AUTH_OR_SSO_CONFIGURATION',
        'PRODUCTION_DATABASE_AND_BACKUP_POLICY',
        'HTTPS_WEB_ORIGIN',
        'DEV_AUTH_DISABLED',
        'STRONG_AUTH_TOKEN_SECRET'
      ]
    },

    legacyMigration: {
      fullMigrationApproved:
        false,
      sprint7EvidenceSha256
    },

    sourceSnapshot: {
      fileCount:
        entries.length,
      contentFingerprint,
      files:
        entries
    }
  };

  await fs.mkdir(
    outputDir,
    {
      recursive: true
    }
  );

  await fs.writeFile(
    outputPath,
    `${JSON.stringify(
      manifest,
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log(
    'SAMS MVP RC1 release manifest generated.'
  );
  console.log(
    `Manifested files: ${entries.length}`
  );
  console.log(
    `Content fingerprint: ${contentFingerprint}`
  );
  console.log(
    `Output: ${path.relative(projectRoot, outputPath)}`
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
