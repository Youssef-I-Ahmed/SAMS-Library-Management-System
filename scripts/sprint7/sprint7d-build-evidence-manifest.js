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

const pilotDir =
  path.join(
    projectRoot,
    'data/processed/legacy-pilot'
  );

const evidenceDir =
  path.join(
    pilotDir,
    'evidence'
  );

const evidencePath =
  path.join(
    evidenceDir,
    'sprint7-evidence-manifest.json'
  );

const EVIDENCE_FILES = [
  'source-manifest.json',
  'profile-summary.json',
  'field-profile.csv',
  'mapping-readiness.csv',
  'exceptions.csv',

  'staging/BOOKS_PARTIAL_REFERENCE.jsonl',
  'staging/BOOKS_RECONSTRUCTED.jsonl',
  'staging/ACADEMIC_WORKS_RECOVERED.jsonl',

  'transform/canonical-books.jsonl',
  'transform/book-import-preview.csv',
  'transform/physical-copy-preview.csv',
  'transform/copy-reconciliation.csv',
  'transform/dedupe-review.csv',
  'transform/partial-vs-reconstructed-reconciliation.csv',
  'transform/dry-run-summary.json',

  'db-pilot/db-pilot-plan.json',
  'db-pilot/db-pilot-import-result.json'
];

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

async function countJsonl(
  filePath
) {
  const text =
    await fs.readFile(
      filePath,
      'utf8'
    );

  if (!text.trim()) {
    return 0;
  }

  return text
    .trimEnd()
    .split(/\r?\n/)
    .length;
}

async function readJson(
  filePath
) {
  return JSON.parse(
    await fs.readFile(
      filePath,
      'utf8'
    )
  );
}

async function main() {
  await fs.mkdir(
    evidenceDir,
    {
      recursive: true
    }
  );

  const entries = [];

  for (
    const relativePath of
    EVIDENCE_FILES
  ) {
    const absolutePath =
      path.join(
        pilotDir,
        relativePath
      );

    const stat =
      await fs.stat(
        absolutePath
      );

    if (!stat.isFile()) {
      throw new Error(
        `Expected evidence file is not a regular file: ${relativePath}`
      );
    }

    const entry = {
      path:
        `data/processed/legacy-pilot/${relativePath}`,
      bytes:
        stat.size,
      sha256:
        await sha256File(
          absolutePath
        )
    };

    if (
      relativePath.endsWith(
        '.jsonl'
      )
    ) {
      entry.rowCount =
        await countJsonl(
          absolutePath
        );
    }

    entries.push(entry);
  }

  const sourceManifest =
    await readJson(
      path.join(
        pilotDir,
        'source-manifest.json'
      )
    );

  const profileSummary =
    await readJson(
      path.join(
        pilotDir,
        'profile-summary.json'
      )
    );

  const transformSummary =
    await readJson(
      path.join(
        pilotDir,
        'transform/dry-run-summary.json'
      )
    );

  const pilotPlan =
    await readJson(
      path.join(
        pilotDir,
        'db-pilot/db-pilot-plan.json'
      )
    );

  const pilotResult =
    await readJson(
      path.join(
        pilotDir,
        'db-pilot/db-pilot-import-result.json'
      )
    );

  const manifest = {
    generatedAt:
      new Date()
        .toISOString(),

    sprint:
      'Sprint 7 — Legacy Migration Pilot',

    status:
      'PILOT_EVIDENCE_COMPLETE_FULL_MIGRATION_NOT_APPROVED',

    principles: {
      rawInputModified:
        false,
      stagedOneToOne:
        true,
      destructiveNormalization:
        false,
      ambiguousProjectThesisGuessed:
        false,
      productionBranchMappingApproved:
        false,
      productionStatusMappingApproved:
        false,
      fullMigrationApproved:
        false
    },

    sourceSnapshot: {
      sourceFiles:
        sourceManifest
          .sources.length,
      rawRows:
        profileSummary
          .totals
          .sourceRows,
      sources:
        sourceManifest
          .sources.map(
            (source) => ({
              dataset:
                source.dataset,
              fileName:
                source.fileName,
              sha256:
                source.sha256,
              rowCount:
                source.rowCount
            })
          )
    },

    transformSnapshot: {
      canonicalBooks:
        transformSummary
          .canonical
          .canonicalBookRows,
      explicitCopyPreviewRows:
        transformSummary
          .copies
          .explicitCopyPreviewRows,
      autoMergedRows:
        transformSummary
          .dedupe
          .autoMergedRows,
      reviewCollisionGroups:
        transformSummary
          .dedupe
          .reviewCollisionGroups,
      academicWorksImportReady:
        0
    },

    dbPilotSnapshot: {
      sampleBooks:
        pilotPlan
          .sampleBookCount,
      proposedCopies:
        pilotPlan
          .proposedCopyCount,
      collisionBlockers:
        pilotPlan
          .collisionBlockerCount,
      importedItems:
        pilotResult
          .items.length,
      importedCopies:
        pilotResult
          .items.reduce(
            (
              total,
              item
            ) =>
              total +
              item.copies.length,
            0
          ),
      pilotTag:
        pilotPlan
          .pilotTag,
      cleanupRequiredAfterImport:
        true
    },

    unresolvedProductionDecisions: [
      'RECOVER_MISSING_MASTER_TITLES_FOR_2108_BOOK_ROWS',
      'PROJECT_VS_THESIS_MAPPING_FOR_3890_ACADEMIC_WORK_ROWS',
      'LEGACY_SOURCE_OR_PC_TO_REAL_SAMS_BRANCH_MAPPING',
      'LEGACY_COPY_STATUS_CODE_SEMANTICS',
      'LANG_CODE_MAPPING',
      'CONTRIBUTOR_ROLE_MAPPING',
      'CONFIRM_CALL_NUMBER_ITEM_VS_COPY_SCOPE'
    ],

    evidenceFiles:
      entries
  };

  await fs.writeFile(
    evidencePath,
    `${JSON.stringify(
      manifest,
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log(
    'Sprint 7 migration evidence manifest generated.'
  );
  console.log(
    `Evidence files hashed: ${entries.length}`
  );
  console.log(
    `Raw rows represented: ${manifest.sourceSnapshot.rawRows}`
  );
  console.log(
    `Canonical books: ${manifest.transformSnapshot.canonicalBooks}`
  );
  console.log(
    `Controlled pilot imported/verified: ${manifest.dbPilotSnapshot.importedItems} items, ${manifest.dbPilotSnapshot.importedCopies} copies`
  );
  console.log(
    `Output: ${path.relative(projectRoot, evidencePath)}`
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
