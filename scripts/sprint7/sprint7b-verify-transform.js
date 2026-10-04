import fs from 'node:fs/promises';
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

const transformDir =
  path.join(
    projectRoot,
    'data/processed/legacy-pilot/transform'
  );

async function readJson(
  name
) {
  return JSON.parse(
    await fs.readFile(
      path.join(
        transformDir,
        name
      ),
      'utf8'
    )
  );
}

async function readJsonl(
  name
) {
  const text =
    await fs.readFile(
      path.join(
        transformDir,
        name
      ),
      'utf8'
    );

  return text
    .trimEnd()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(
      (line) =>
        JSON.parse(line)
    );
}

async function main() {
  const summary =
    await readJson(
      'dry-run-summary.json'
    );

  const books =
    await readJsonl(
      'canonical-books.jsonl'
    );

  if (
    summary.mutationPolicy !==
    'DRY_RUN_ONLY_NO_APPLICATION_DB_WRITES'
  ) {
    throw new Error(
      'Unexpected Sprint 7B mutation policy.'
    );
  }

  if (
    books.length !== 22
  ) {
    throw new Error(
      `Expected 22 canonical book candidates, found ${books.length}.`
    );
  }

  if (
    summary.source.sourceRows !==
    2130
  ) {
    throw new Error(
      'Expected 2,130 reconstructed source rows.'
    );
  }

  if (
    summary.source.missingTitleRows !==
    2108
  ) {
    throw new Error(
      'Expected 2,108 missing-title source rows.'
    );
  }

  if (
    summary.canonical
      .publicationYearParsed !==
    21
  ) {
    throw new Error(
      `Expected 21 parsed publication years, found ${summary.canonical.publicationYearParsed}.`
    );
  }

  if (
    summary.canonical
      .isbnPresent !==
    13
  ) {
    throw new Error(
      `Expected 13 ISBN-bearing candidates, found ${summary.canonical.isbnPresent}.`
    );
  }

  if (
    summary.canonical
      .publisherPresent !==
    21
  ) {
    throw new Error(
      `Expected 21 publisher-bearing candidates, found ${summary.canonical.publisherPresent}.`
    );
  }

  if (
    summary.dedupe
      .strongCollisionGroups !==
    0
  ) {
    throw new Error(
      'Expected zero strong ISBN collision groups.'
    );
  }

  if (
    summary.dedupe
      .reviewCollisionGroups !==
    1
  ) {
    throw new Error(
      `Expected one title/year review group, found ${summary.dedupe.reviewCollisionGroups}.`
    );
  }

  if (
    summary.dedupe
      .reviewCollisionRows !==
    2
  ) {
    throw new Error(
      `Expected two rows in dedupe review group, found ${summary.dedupe.reviewCollisionRows}.`
    );
  }

  if (
    summary.dedupe
      .autoMergedRows !==
    0
  ) {
    throw new Error(
      'Sprint 7B must never auto-merge legacy records.'
    );
  }

  if (
    summary.copies
      .recoveredCurrentCopyCount !==
    34
  ) {
    throw new Error(
      `Expected recovered current copy count = 34, found ${summary.copies.recoveredCurrentCopyCount}.`
    );
  }

  if (
    summary.copies
      .explicitCopyPreviewRows !==
    34
  ) {
    throw new Error(
      `Expected 34 explicit copy preview rows, found ${summary.copies.explicitCopyPreviewRows}.`
    );
  }

  if (
    summary.copies
      .copyCountMismatchItems !==
    0
  ) {
    throw new Error(
      'Expected zero copy-count mismatches among the 22 titled book candidates.'
    );
  }

  if (
    summary.copies
      .deletedCopyEvidenceCount !==
    1
  ) {
    throw new Error(
      `Expected one deleted-copy evidence record, found ${summary.copies.deletedCopyEvidenceCount}.`
    );
  }

  if (
    summary.corroboration
      .partialReferenceRows !==
    22
  ) {
    throw new Error(
      'Expected 22 partial-reference rows.'
    );
  }

  if (
    summary.corroboration
      .reconstructedCandidatesMatchedToPartial !==
    22
  ) {
    throw new Error(
      `Expected all 22 reconstructed candidates to match the partial reference across selected fields, found ${summary.corroboration.reconstructedCandidatesMatchedToPartial}.`
    );
  }

  if (
    summary.corroboration
      .reconciliationReviewRows !==
    0
  ) {
    throw new Error(
      'Expected zero partial/reconstructed reconciliation review rows.'
    );
  }

  if (
    summary.importGate
      .applicationDatabaseWritten !==
    false
  ) {
    throw new Error(
      'Sprint 7B must not write to the application database.'
    );
  }

  for (
    const book of
    books
  ) {
    if (
      book.libraryItem
        .type !==
      'BOOK'
    ) {
      throw new Error(
        'All Sprint 7B canonical candidates must be BOOK records.'
      );
    }

    if (
      !book.libraryItem
        .title
    ) {
      throw new Error(
        'Canonical book title cannot be empty.'
      );
    }

    if (
      book.libraryItem
        .deweyCodeRaw !==
      null
    ) {
      throw new Error(
        'Sprint 7B must not infer Dewey code from CALL_NUM.'
      );
    }

    if (
      book.libraryItem
        .language !==
      null
    ) {
      throw new Error(
        'Sprint 7B must not guess language mapping.'
      );
    }

    if (
      !book._legacy
        .sourceFileSha256 ||
      !book._legacy
        .rowSha256 ||
      !book._transform
        .canonicalSha256
    ) {
      throw new Error(
        'Canonical transform traceability hash is missing.'
      );
    }
  }

  const sameTitleBooks =
    books.filter(
      (book) =>
        book.libraryItem
          .title ===
        'الإدارة الإلكترونية'
    );

  if (
    sameTitleBooks.length !==
    2
  ) {
    throw new Error(
      'Expected two distinct الإدارة الإلكترونية records for manual dedupe review.'
    );
  }

  const authors =
    new Set(
      sameTitleBooks.map(
        (book) =>
          book.unresolved
            .authorsEditorsRaw
            .join(' | ')
      )
    );

  if (
    authors.size !==
    2
  ) {
    throw new Error(
      'Same-title records must remain separate because their contributor evidence differs.'
    );
  }

  const requiredFiles = [
    'book-import-preview.csv',
    'physical-copy-preview.csv',
    'copy-reconciliation.csv',
    'dedupe-review.csv',
    'partial-vs-reconstructed-reconciliation.csv'
  ];

  for (
    const fileName of
    requiredFiles
  ) {
    const stat =
      await fs.stat(
        path.join(
          transformDir,
          fileName
        )
      );

    if (
      !stat.isFile() ||
      stat.size === 0
    ) {
      throw new Error(
        `${fileName} is missing or empty.`
      );
    }
  }

  console.log(
    '22 canonical book transforms: OK'
  );
  console.log(
    'No destructive Dewey/language inference: OK'
  );
  console.log(
    '34 current-copy preview rows reconcile exactly: OK'
  );
  console.log(
    'Deleted-copy evidence preserved without recreating it: OK'
  );
  console.log(
    'Strong duplicate collisions: 0'
  );
  console.log(
    'Review-only duplicate groups: 1 (2 distinct records)'
  );
  console.log(
    'All 22 partial-reference rows corroborate reconstructed fields: OK'
  );
  console.log(
    'Application database writes: NONE'
  );
  console.log('');
  console.log(
    'Sprint 7B canonical transform dry-run verification PASSED.'
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
