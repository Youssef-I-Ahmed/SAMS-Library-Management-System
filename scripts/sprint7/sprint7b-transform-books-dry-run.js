import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sha256Text,
  toCsv
} from './legacy-csv.js';

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

const stagingDir =
  path.join(
    pilotDir,
    'staging'
  );

const transformDir =
  path.join(
    pilotDir,
    'transform'
  );

function normalizeText(
  value
) {
  const trimmed =
    String(
      value ?? ''
    ).trim();

  return trimmed || null;
}

function splitPipeValues(
  value
) {
  return String(
    value ?? ''
  )
    .split('|')
    .map(
      (entry) =>
        entry.trim()
    )
    .filter(Boolean);
}

function normalizeTitleFingerprint(
  value
) {
  return String(
    value ?? ''
  )
    .normalize('NFKC')
    .toLowerCase()
    .replace(
      /[\p{P}\p{S}_]+/gu,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}

function normalizeIsbnFingerprint(
  value
) {
  return String(
    value ?? ''
  )
    .toUpperCase()
    .replace(
      /[^0-9X]/g,
      ''
    );
}

function parsePublicationYear(
  value
) {
  const text =
    String(
      value ?? ''
    ).trim();

  if (
    /^\d{4}$/.test(text)
  ) {
    return Number(text);
  }

  return null;
}

function parseNonNegativeInteger(
  value
) {
  const text =
    String(
      value ?? ''
    ).trim();

  if (
    !/^\d+$/.test(text)
  ) {
    return null;
  }

  return Number(text);
}

async function readJsonl(
  filePath
) {
  const text =
    await fs.readFile(
      filePath,
      'utf8'
    );

  if (!text.trim()) {
    return [];
  }

  return text
    .trimEnd()
    .split(/\r?\n/)
    .map(
      (line) =>
        JSON.parse(line)
    );
}

async function writeJson(
  filePath,
  value
) {
  await fs.writeFile(
    filePath,
    `${JSON.stringify(
      value,
      null,
      2
    )}\n`,
    'utf8'
  );
}

function buildCanonicalBook(
  staged
) {
  const fields =
    staged.fields;

  const title =
    normalizeText(
      fields.TITLE
    );

  if (!title) {
    return null;
  }

  const publicationYear =
    parsePublicationYear(
      fields.PUBLISHING_DATE
    );

  const isbn =
    normalizeText(
      fields.ISBN
    );

  const publisher =
    normalizeText(
      fields.PUBLISHERS
    );

  const edition =
    normalizeText(
      fields.EDITION_STATEMENT
    );

  const callNumber =
    normalizeText(
      fields.CALL_NUM
    );

  const titleFingerprint =
    normalizeTitleFingerprint(
      title
    );

  const isbnFingerprint =
    isbn
      ? normalizeIsbnFingerprint(
          isbn
        )
      : null;

  const titleYearFingerprint =
    `${titleFingerprint}::${
      publicationYear ?? ''
    }`;

  const canonical = {
    _legacy: {
      ...staged._legacy,
      masterSourceDb:
        normalizeText(
          fields.MASTER_SOURCE_DB
        ),
      sourceEvidence:
        normalizeText(
          fields.SOURCE_EVIDENCE
        ),
      recoveryStatus:
        normalizeText(
          fields.RECOVERY_STATUS
        )
    },

    libraryItem: {
      type: 'BOOK',
      title,
      categoryId: null,
      deweyClassificationId:
        null,
      deweyCodeRaw: null,
      callNumber,
      language: null,
      publicationYear,
      abstractDescription:
        null,
      isActive: true
    },

    bookDetails: {
      isbn,
      publisher,
      edition
    },

    unresolved: {
      languageCode:
        normalizeText(
          fields.LANG_CODE
        ),
      authorsEditorsRaw:
        splitPipeValues(
          fields.AUTHORS_EDITORS
        ),
      subjectsRaw:
        splitPipeValues(
          fields.SUBJECTS
        ),
      editorCodes:
        splitPipeValues(
          fields.EDITOR_CODES
        ),
      unresolvedEditorCodes:
        splitPipeValues(
          fields.UNRESOLVED_EDITOR_CODES
        ),
      publisherCodes:
        splitPipeValues(
          fields.PUBLISHER_CODES
        ),
      unresolvedPublisherCodes:
        splitPipeValues(
          fields.UNRESOLVED_PUBLISHER_CODES
        ),
      subjectCodes:
        splitPipeValues(
          fields.SUBJECT_CODES
        ),
      unresolvedSubjectCodes:
        splitPipeValues(
          fields.UNRESOLVED_SUBJECT_CODES
        ),
      copyStatusesRaw:
        splitPipeValues(
          fields.COPY_STATUSES
        ),
      alternateTitlesRaw:
        splitPipeValues(
          fields.ALTERNATE_TITLES
        )
    },

    copyEvidence: {
      recoveredCopyCount:
        parseNonNegativeInteger(
          fields.RECOVERED_COPY_COUNT
        ),
      copyGeneralCodes:
        splitPipeValues(
          fields.COPY_GENERAL_CODES
        ),
      copyGeneralNumbers:
        splitPipeValues(
          fields.COPY_GENERAL_NUMBERS
        ),
      copyClassificationOtherNumber:
        normalizeText(
          fields.COPY_CLASSIFICATION_OTHER_NUMBER
        ),
      deletedCopyCount:
        parseNonNegativeInteger(
          fields.DELETED_COPY_COUNT
        )
    },

    fingerprints: {
      title:
        titleFingerprint,
      titleYear:
        titleYearFingerprint,
      isbn:
        isbnFingerprint
    }
  };

  canonical._transform = {
    transformVersion:
      'sprint7b-v1',
    canonicalSha256:
      sha256Text(
        JSON.stringify({
          libraryItem:
            canonical.libraryItem,
          bookDetails:
            canonical.bookDetails,
          unresolved:
            canonical.unresolved,
          copyEvidence:
            canonical.copyEvidence,
          fingerprints:
            canonical.fingerprints
        })
      )
  };

  return canonical;
}

function buildDedupeReview(
  canonicalBooks
) {
  const isbnGroups =
    new Map();

  const titleYearGroups =
    new Map();

  for (
    const book of
    canonicalBooks
  ) {
    const isbn =
      book.fingerprints
        .isbn;

    if (isbn) {
      if (
        !isbnGroups.has(isbn)
      ) {
        isbnGroups.set(
          isbn,
          []
        );
      }

      isbnGroups
        .get(isbn)
        .push(book);
    }

    const titleYear =
      book.fingerprints
        .titleYear;

    if (
      !titleYearGroups.has(
        titleYear
      )
    ) {
      titleYearGroups.set(
        titleYear,
        []
      );
    }

    titleYearGroups
      .get(titleYear)
      .push(book);
  }

  const strongCollisions = [];
  const reviewCollisions = [];

  for (
    const [
      fingerprint,
      books
    ] of isbnGroups
  ) {
    if (
      books.length > 1
    ) {
      strongCollisions.push({
        fingerprintType:
          'ISBN',
        fingerprint,
        books
      });
    }
  }

  for (
    const [
      fingerprint,
      books
    ] of titleYearGroups
  ) {
    if (
      books.length <= 1
    ) {
      continue;
    }

    const ids =
      new Set(
        books.map(
          (book) =>
            book._legacy
              .legacySourceKey
        )
      );

    if (
      ids.size > 1
    ) {
      reviewCollisions.push({
        fingerprintType:
          'TITLE_YEAR',
        fingerprint,
        books
      });
    }
  }

  return {
    strongCollisions,
    reviewCollisions
  };
}

function buildCopyPreview(
  canonicalBooks
) {
  const rows = [];
  const reconciliation = [];

  for (
    const book of
    canonicalBooks
  ) {
    const sourceKey =
      book._legacy
        .legacySourceKey ??
      '';

    const codes =
      book.copyEvidence
        .copyGeneralCodes;

    const recoveredCount =
      book.copyEvidence
        .recoveredCopyCount;

    const countMatches =
      recoveredCount !== null &&
      recoveredCount ===
        codes.length;

    reconciliation.push({
      legacyBookCode:
        sourceKey,
      title:
        book.libraryItem
          .title,
      recoveredCopyCount:
        recoveredCount ??
        '',
      explicitCurrentCopyCodes:
        codes.length,
      deletedCopyEvidenceCount:
        book.copyEvidence
          .deletedCopyCount ??
        '',
      countMatches:
        countMatches
          ? 'YES'
          : 'NO',
      action:
        countMatches
          ? 'STRUCTURE_READY_STATUS_BRANCH_UNRESOLVED'
          : 'COPY_COUNT_RECONCILIATION_REQUIRED'
    });

    for (
      let index = 0;
      index < codes.length;
      index += 1
    ) {
      rows.push({
        legacyBookCode:
          sourceKey,
        title:
          book.libraryItem
            .title,
        copyOrdinal:
          index + 1,
        legacyCopyCode:
          codes[index],
        legacyStatusEvidence:
          book.unresolved
            .copyStatusesRaw
            .join(' | '),
        sourceDb:
          book._legacy
            .masterSourceDb ??
          '',
        targetBranchCode:
          '',
        proposedTargetStatus:
          '',
        copyCode:
          codes[index],
        barcode:
          '',
        shelfLocation:
          '',
        action:
          'BLOCKED_BRANCH_AND_STATUS_MAPPING'
      });
    }
  }

  return {
    rows,
    reconciliation
  };
}

function buildCrossSourceReconciliation(
  canonicalBooks,
  partialRows
) {
  const partialByKey =
    new Map(
      partialRows.map(
        (row) => [
          row._legacy
            .legacySourceKey,
          row
        ]
      )
    );

  const checks = [
    [
      'PUBLISHING_DATE',
      'PUBLISHING_DATE'
    ],
    [
      'TITLE',
      'TITLE'
    ],
    [
      'CALL_NUM',
      'CALL_NUM'
    ],
    [
      'BOOK_TYPE',
      'BOOK_TYPE'
    ],
    [
      'LANG_CODE',
      'LANG_CODE'
    ],
    [
      'ISBN',
      'ISBN'
    ],
    [
      'EDITION_STATMENT',
      'EDITION_STATEMENT'
    ],
    [
      'AUTHORS_EDITORS',
      'AUTHORS_EDITORS'
    ],
    [
      'PUBLISHERS',
      'PUBLISHERS'
    ],
    [
      'COPY_GENERAL_CODES',
      'COPY_GENERAL_CODES'
    ],
    [
      'COPY_STATUSES',
      'COPY_STATUSES'
    ],
    [
      'EXTRACTED_COPY_COUNT',
      'RECOVERED_COPY_COUNT'
    ]
  ];

  const rows = [];

  for (
    const book of
    canonicalBooks
  ) {
    const sourceKey =
      book._legacy
        .legacySourceKey;

    const partial =
      partialByKey.get(
        sourceKey
      );

    if (!partial) {
      rows.push({
        legacyBookCode:
          sourceKey,
        title:
          book.libraryItem
            .title,
        partialReferenceFound:
          'NO',
        comparedFields:
          checks.length,
        mismatchCount:
          checks.length,
        mismatchedFields:
          'REFERENCE_ROW_MISSING',
        result:
          'REVIEW'
      });

      continue;
    }

    const mismatches = [];

    for (
      const [
        partialField,
        reconstructedField
      ] of checks
    ) {
      const left =
        String(
          partial.fields[
            partialField
          ] ??
          ''
        ).trim();

      const right =
        String(
          (
            book._legacy
              .dataset ===
            'BOOKS_RECONSTRUCTED'
          )
            ? (
                reconstructedField ===
                'RECOVERED_COPY_COUNT'
                  ? book.copyEvidence
                      .recoveredCopyCount ??
                    ''
                  : reconstructedField ===
                    'TITLE'
                    ? book.libraryItem
                        .title
                    : reconstructedField ===
                      'PUBLISHING_DATE'
                      ? (
                          book.libraryItem
                            .publicationYear ??
                          ''
                        )
                      : reconstructedField ===
                        'CALL_NUM'
                        ? (
                            book.libraryItem
                              .callNumber ??
                            ''
                          )
                        : reconstructedField ===
                          'ISBN'
                          ? (
                              book.bookDetails
                                .isbn ??
                              ''
                            )
                          : reconstructedField ===
                            'EDITION_STATEMENT'
                            ? (
                                book.bookDetails
                                  .edition ??
                                ''
                              )
                            : reconstructedField ===
                              'AUTHORS_EDITORS'
                              ? book.unresolved
                                  .authorsEditorsRaw
                                  .join(' | ')
                              : reconstructedField ===
                                'PUBLISHERS'
                                ? (
                                    book.bookDetails
                                      .publisher ??
                                    ''
                                  )
                                : reconstructedField ===
                                  'COPY_GENERAL_CODES'
                                  ? book.copyEvidence
                                      .copyGeneralCodes
                                      .join(' | ')
                                  : reconstructedField ===
                                    'COPY_STATUSES'
                                    ? book.unresolved
                                        .copyStatusesRaw
                                        .join(' | ')
                                    : reconstructedField ===
                                      'LANG_CODE'
                                      ? (
                                          book.unresolved
                                            .languageCode ??
                                          ''
                                        )
                                      : reconstructedField ===
                                        'BOOK_TYPE'
                                        ? 'B'
                                        : ''
              )
            : ''
        ).trim();

      if (
        left !== right
      ) {
        mismatches.push(
          `${partialField}->${reconstructedField}`
        );
      }
    }

    rows.push({
      legacyBookCode:
        sourceKey,
      title:
        book.libraryItem
          .title,
      partialReferenceFound:
        'YES',
      comparedFields:
        checks.length,
      mismatchCount:
        mismatches.length,
      mismatchedFields:
        mismatches.join(' | '),
      result:
        mismatches.length === 0
          ? 'MATCH'
          : 'REVIEW'
    });
  }

  return rows;
}

function buildImportPreviewRows(
  canonicalBooks
) {
  return canonicalBooks.map(
    (book) => ({
      legacyBookCode:
        book._legacy
          .legacySourceKey,
      sourceDb:
        book._legacy
          .masterSourceDb ??
        '',
      type:
        book.libraryItem.type,
      title:
        book.libraryItem.title,
      publicationYear:
        book.libraryItem
          .publicationYear ??
        '',
      callNumber:
        book.libraryItem
          .callNumber ??
        '',
      isbn:
        book.bookDetails
          .isbn ??
        '',
      publisher:
        book.bookDetails
          .publisher ??
        '',
      edition:
        book.bookDetails
          .edition ??
        '',
      legacyLanguageCode:
        book.unresolved
          .languageCode ??
        '',
      authorsEditorsRaw:
        book.unresolved
          .authorsEditorsRaw
          .join(' | '),
      recoveredCopyCount:
        book.copyEvidence
          .recoveredCopyCount ??
        '',
      deletedCopyEvidenceCount:
        book.copyEvidence
          .deletedCopyCount ??
        '',
      currentCopyCodes:
        book.copyEvidence
          .copyGeneralCodes
          .join(' | '),
      transformAction:
        'DRY_RUN_ONLY'
    })
  );
}

async function main() {
  const sourceManifestPath =
    path.join(
      pilotDir,
      'source-manifest.json'
    );

  const sourceManifest =
    JSON.parse(
      await fs.readFile(
        sourceManifestPath,
        'utf8'
      )
    );

  if (
    sourceManifest
      .mutationPolicy !==
    'READ_RAW_ONLY_NO_APPLICATION_DB_WRITES'
  ) {
    throw new Error(
      'Sprint 7A source manifest is missing or incompatible. Run Sprint 7A first.'
    );
  }

  const booksStaged =
    await readJsonl(
      path.join(
        stagingDir,
        'BOOKS_RECONSTRUCTED.jsonl'
      )
    );

  const partialStaged =
    await readJsonl(
      path.join(
        stagingDir,
        'BOOKS_PARTIAL_REFERENCE.jsonl'
      )
    );

  const canonicalBooks =
    booksStaged
      .map(
        buildCanonicalBook
      )
      .filter(Boolean);

  await fs.rm(
    transformDir,
    {
      recursive: true,
      force: true
    }
  );

  await fs.mkdir(
    transformDir,
    {
      recursive: true
    }
  );

  const canonicalPath =
    path.join(
      transformDir,
      'canonical-books.jsonl'
    );

  await fs.writeFile(
    canonicalPath,
    canonicalBooks
      .map(
        (book) =>
          JSON.stringify(book)
      )
      .join('\n') +
      (
        canonicalBooks.length
          ? '\n'
          : ''
      ),
    'utf8'
  );

  const importPreviewRows =
    buildImportPreviewRows(
      canonicalBooks
    );

  await fs.writeFile(
    path.join(
      transformDir,
      'book-import-preview.csv'
    ),
    toCsv(
      [
        'legacyBookCode',
        'sourceDb',
        'type',
        'title',
        'publicationYear',
        'callNumber',
        'isbn',
        'publisher',
        'edition',
        'legacyLanguageCode',
        'authorsEditorsRaw',
        'recoveredCopyCount',
        'deletedCopyEvidenceCount',
        'currentCopyCodes',
        'transformAction'
      ],
      importPreviewRows
    ),
    'utf8'
  );

  const {
    rows: copyRows,
    reconciliation:
      copyReconciliation
  } =
    buildCopyPreview(
      canonicalBooks
    );

  await fs.writeFile(
    path.join(
      transformDir,
      'physical-copy-preview.csv'
    ),
    toCsv(
      [
        'legacyBookCode',
        'title',
        'copyOrdinal',
        'legacyCopyCode',
        'legacyStatusEvidence',
        'sourceDb',
        'targetBranchCode',
        'proposedTargetStatus',
        'copyCode',
        'barcode',
        'shelfLocation',
        'action'
      ],
      copyRows
    ),
    'utf8'
  );

  await fs.writeFile(
    path.join(
      transformDir,
      'copy-reconciliation.csv'
    ),
    toCsv(
      [
        'legacyBookCode',
        'title',
        'recoveredCopyCount',
        'explicitCurrentCopyCodes',
        'deletedCopyEvidenceCount',
        'countMatches',
        'action'
      ],
      copyReconciliation
    ),
    'utf8'
  );

  const dedupe =
    buildDedupeReview(
      canonicalBooks
    );

  const dedupeRows = [
    ...dedupe.strongCollisions
      .flatMap(
        (group) =>
          group.books.map(
            (book) => ({
              reviewLevel:
                'STRONG_COLLISION',
              fingerprintType:
                group.fingerprintType,
              fingerprint:
                group.fingerprint,
              legacyBookCode:
                book._legacy
                  .legacySourceKey,
              title:
                book.libraryItem
                  .title,
              publicationYear:
                book.libraryItem
                  .publicationYear ??
                '',
              isbn:
                book.bookDetails
                  .isbn ??
                '',
              authorsEditorsRaw:
                book.unresolved
                  .authorsEditorsRaw
                  .join(' | '),
              callNumber:
                book.libraryItem
                  .callNumber ??
                '',
              action:
                'REVIEW_DO_NOT_AUTO_MERGE'
            })
          )
      ),

    ...dedupe.reviewCollisions
      .flatMap(
        (group) =>
          group.books.map(
            (book) => ({
              reviewLevel:
                'REVIEW_COLLISION',
              fingerprintType:
                group.fingerprintType,
              fingerprint:
                group.fingerprint,
              legacyBookCode:
                book._legacy
                  .legacySourceKey,
              title:
                book.libraryItem
                  .title,
              publicationYear:
                book.libraryItem
                  .publicationYear ??
                '',
              isbn:
                book.bookDetails
                  .isbn ??
                '',
              authorsEditorsRaw:
                book.unresolved
                  .authorsEditorsRaw
                  .join(' | '),
              callNumber:
                book.libraryItem
                  .callNumber ??
                '',
              action:
                'REVIEW_DO_NOT_AUTO_MERGE'
            })
          )
      )
  ];

  await fs.writeFile(
    path.join(
      transformDir,
      'dedupe-review.csv'
    ),
    toCsv(
      [
        'reviewLevel',
        'fingerprintType',
        'fingerprint',
        'legacyBookCode',
        'title',
        'publicationYear',
        'isbn',
        'authorsEditorsRaw',
        'callNumber',
        'action'
      ],
      dedupeRows
    ),
    'utf8'
  );

  const crossSource =
    buildCrossSourceReconciliation(
      canonicalBooks,
      partialStaged
    );

  await fs.writeFile(
    path.join(
      transformDir,
      'partial-vs-reconstructed-reconciliation.csv'
    ),
    toCsv(
      [
        'legacyBookCode',
        'title',
        'partialReferenceFound',
        'comparedFields',
        'mismatchCount',
        'mismatchedFields',
        'result'
      ],
      crossSource
    ),
    'utf8'
  );

  const summary = {
    generatedAt:
      new Date()
        .toISOString(),

    mutationPolicy:
      'DRY_RUN_ONLY_NO_APPLICATION_DB_WRITES',

    source: {
      dataset:
        'BOOKS_RECONSTRUCTED',
      sourceRows:
        booksStaged.length,
      titledTransformCandidates:
        canonicalBooks.length,
      missingTitleRows:
        booksStaged.length -
        canonicalBooks.length
    },

    canonical: {
      canonicalBookRows:
        canonicalBooks.length,
      publicationYearParsed:
        canonicalBooks.filter(
          (book) =>
            book.libraryItem
              .publicationYear !==
            null
        ).length,
      isbnPresent:
        canonicalBooks.filter(
          (book) =>
            Boolean(
              book.bookDetails
                .isbn
            )
        ).length,
      publisherPresent:
        canonicalBooks.filter(
          (book) =>
            Boolean(
              book.bookDetails
                .publisher
            )
        ).length,
      languageMapped:
        0,
      contributorRowsCreated:
        0,
      deweyCodesParsed:
        0
    },

    dedupe: {
      strongCollisionGroups:
        dedupe
          .strongCollisions
          .length,
      reviewCollisionGroups:
        dedupe
          .reviewCollisions
          .length,
      reviewCollisionRows:
        dedupe
          .reviewCollisions
          .reduce(
            (
              total,
              group
            ) =>
              total +
              group.books.length,
            0
          ),
      autoMergedRows:
        0
    },

    copies: {
      recoveredCurrentCopyCount:
        canonicalBooks.reduce(
          (
            total,
            book
          ) =>
            total +
            (
              book.copyEvidence
                .recoveredCopyCount ??
              0
            ),
          0
        ),
      explicitCopyPreviewRows:
        copyRows.length,
      copyCountMismatchItems:
        copyReconciliation
          .filter(
            (row) =>
              row.countMatches !==
              'YES'
          ).length,
      deletedCopyEvidenceCount:
        canonicalBooks.reduce(
          (
            total,
            book
          ) =>
            total +
            (
              book.copyEvidence
                .deletedCopyCount ??
              0
            ),
          0
        ),
      branchMappingResolved:
        false,
      legacyStatusMappingResolved:
        false
    },

    corroboration: {
      partialReferenceRows:
        partialStaged.length,
      reconstructedCandidatesMatchedToPartial:
        crossSource.filter(
          (row) =>
            row.result ===
            'MATCH'
        ).length,
      reconciliationReviewRows:
        crossSource.filter(
          (row) =>
            row.result !==
            'MATCH'
        ).length
    },

    importGate: {
      applicationDatabaseWritten:
        false,
      canonicalBibliographicCandidates:
        canonicalBooks.length,
      physicalCopiesImportReady:
        false,
      blockers: [
        'BRANCH_MAPPING_UNRESOLVED',
        'LEGACY_COPY_STATUS_MAPPING_UNRESOLVED',
        'LANGUAGE_CODE_MAPPING_UNRESOLVED',
        'CONTRIBUTOR_ROLE_MAPPING_UNRESOLVED'
      ],
      nextSafeStep:
        'CONTROLLED_IMPORT_PLAN_WITH_EXPLICIT_BRANCH_AND_STATUS_MAPPING'
    }
  };

  await writeJson(
    path.join(
      transformDir,
      'dry-run-summary.json'
    ),
    summary
  );

  console.log(
    'Sprint 7B canonical transform dry run completed.'
  );

  console.log(
    `Canonical book candidates: ${summary.canonical.canonicalBookRows}`
  );

  console.log(
    `Physical copy preview rows: ${summary.copies.explicitCopyPreviewRows}`
  );

  console.log(
    `Copy count mismatches: ${summary.copies.copyCountMismatchItems}`
  );

  console.log(
    `Strong dedupe collision groups: ${summary.dedupe.strongCollisionGroups}`
  );

  console.log(
    `Review-only dedupe groups: ${summary.dedupe.reviewCollisionGroups}`
  );

  console.log(
    `Partial-vs-reconstructed exact matches: ${summary.corroboration.reconstructedCandidatesMatchedToPartial}`
  );

  console.log(
    `Output: ${path.relative(projectRoot, transformDir)}`
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
