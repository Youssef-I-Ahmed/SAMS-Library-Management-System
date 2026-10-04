import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalRecordJson,
  parseCsv,
  sha256Buffer,
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

function readArg(
  name,
  fallback
) {
  const prefix =
    `--${name}=`;

  const found =
    process.argv.find(
      (arg) =>
        arg.startsWith(
          prefix
        )
    );

  if (!found) {
    return fallback;
  }

  return found.slice(
    prefix.length
  );
}

const rawDir =
  path.resolve(
    projectRoot,
    readArg(
      'raw-dir',
      'data/raw'
    )
  );

const outDir =
  path.resolve(
    projectRoot,
    readArg(
      'out-dir',
      'data/processed/legacy-pilot'
    )
  );

const SOURCES = [
  {
    fileName:
      'books-extracted-partial.csv',
    dataset:
      'BOOKS_PARTIAL_REFERENCE',
    sourceRole:
      'REFERENCE_EVIDENCE_ONLY'
  },
  {
    fileName:
      'books-reconstructed-recovery.csv',
    dataset:
      'BOOKS_RECONSTRUCTED',
    sourceRole:
      'PRIMARY_BOOK_RECOVERY'
  },
  {
    fileName:
      'projects-theses-extracted.csv',
    dataset:
      'ACADEMIC_WORKS_RECOVERED',
    sourceRole:
      'PRIMARY_ACADEMIC_WORK_RECOVERY'
  }
];

function normalize(
  value
) {
  return String(
    value ?? ''
  ).trim();
}

function profileField(
  records,
  header
) {
  const values =
    records.map(
      (record) =>
        normalize(
          record[header]
        )
    );

  const nonEmptyValues =
    values.filter(Boolean);

  const distinctValues =
    new Set(
      nonEmptyValues
    );

  const sampleValues = [];

  for (
    const value of
    distinctValues
  ) {
    sampleValues.push(value);

    if (
      sampleValues.length >= 5
    ) {
      break;
    }
  }

  return {
    field: header,
    totalRows:
      records.length,
    nonEmptyCount:
      nonEmptyValues.length,
    emptyCount:
      records.length -
      nonEmptyValues.length,
    distinctNonEmptyCount:
      distinctValues.size,
    sampleValues:
      sampleValues.join(' | ')
  };
}

function createException(
  {
    dataset,
    sourceFile,
    recordNumber,
    sourceKey,
    severity,
    code,
    field,
    value,
    message
  }
) {
  return {
    dataset,
    sourceFile,
    recordNumber,
    sourceKey,
    severity,
    code,
    field,
    value,
    message
  };
}

function isFourDigitYear(
  value
) {
  return /^\d{4}$/.test(
    normalize(value)
  );
}

function classifyRecord(
  source,
  record,
  recordNumber
) {
  const exceptions = [];

  const sourceKey =
    normalize(
      record.BOOK_CODE
    );

  const title =
    normalize(
      record.TITLE
    );

  const publishingDate =
    normalize(
      record.PUBLISHING_DATE
    );

  const callNumber =
    normalize(
      record.CALL_NUM
    );

  if (source.dataset ===
      'BOOKS_PARTIAL_REFERENCE') {
    exceptions.push(
      createException({
        dataset:
          source.dataset,
        sourceFile:
          source.fileName,
        recordNumber,
        sourceKey,
        severity:
          'INFO',
        code:
          'REFERENCE_ONLY_PARTIAL_BOOK_EXTRACT',
        field:
          '',
        value:
          '',
        message:
          'Partial extraction is retained as corroborating evidence and is not a separate import source.'
      })
    );
  }

  if (source.dataset ===
      'BOOKS_RECONSTRUCTED') {
    if (!title) {
      exceptions.push(
        createException({
          dataset:
            source.dataset,
          sourceFile:
            source.fileName,
          recordNumber,
          sourceKey,
          severity:
            'BLOCKER',
          code:
            'MISSING_TITLE',
          field:
            'TITLE',
          value:
            '',
          message:
            'LibraryItem.title is required. Keep this legacy record staged until the complete legacy folder/source can recover the title.'
        })
      );
    }

    const status =
      normalize(
        record.RECOVERY_STATUS
      );

    if (
      status ===
      'MASTER_TITLE_MISSING_RELATIONS_RECOVERED'
    ) {
      exceptions.push(
        createException({
          dataset:
            source.dataset,
          sourceFile:
            source.fileName,
          recordNumber,
          sourceKey,
          severity:
            'BLOCKER',
          code:
            'MASTER_TITLE_MISSING',
          field:
            'RECOVERY_STATUS',
          value:
            status,
          message:
            'Relations/copy evidence exists, but the master bibliographic record was not recovered.'
        })
      );
    }
  }

  if (source.dataset ===
      'ACADEMIC_WORKS_RECOVERED') {
    exceptions.push(
      createException({
        dataset:
          source.dataset,
        sourceFile:
          source.fileName,
        recordNumber,
        sourceKey,
        severity:
          'BLOCKER',
        code:
          'ITEM_TYPE_UNRESOLVED',
        field:
          'BOOK_TYPE',
        value:
          normalize(
            record.BOOK_TYPE
          ),
        message:
          'Current source does not reliably distinguish PROJECT from THESIS. Do not guess the target ItemType.'
      })
    );

    if (
      callNumber.includes(',')
    ) {
      exceptions.push(
        createException({
          dataset:
            source.dataset,
          sourceFile:
            source.fileName,
          recordNumber,
          sourceKey,
          severity:
            'WARNING',
          code:
            'CALL_NUMBER_COMMA_DECIMAL_STYLE',
          field:
            'CALL_NUM',
          value:
            callNumber,
          message:
            'Preserve raw call number. Do not automatically replace comma with decimal point before library validation.'
        })
      );
    }

    const copies =
      normalize(
        record.NUM_OF_COPIES
      );

    if (
      /^-\d+$/.test(copies)
    ) {
      exceptions.push(
        createException({
          dataset:
            source.dataset,
          sourceFile:
            source.fileName,
          recordNumber,
          sourceKey,
          severity:
            'BLOCKER',
          code:
            'NEGATIVE_COPY_COUNT',
          field:
            'NUM_OF_COPIES',
          value:
            copies,
          message:
            'Negative legacy copy count cannot create PhysicalCopy records without reconciliation.'
        })
      );
    }
  }

  if (
    publishingDate &&
    !isFourDigitYear(
      publishingDate
    )
  ) {
    exceptions.push(
      createException({
        dataset:
          source.dataset,
        sourceFile:
          source.fileName,
        recordNumber,
        sourceKey,
        severity:
          'WARNING',
        code:
          'PUBLICATION_YEAR_UNRESOLVED',
        field:
          'PUBLISHING_DATE',
        value:
          publishingDate,
        message:
          'Publication year is not a simple four-digit value. Preserve raw value until normalized explicitly.'
      })
    );
  }

  return exceptions;
}

function createMappingRows() {
  return [
    {
      dataset:
        'BOOKS_RECONSTRUCTED',
      sourceField:
        'BOOK_CODE',
      target:
        'legacy source key',
      action:
        'PRESERVE',
      confidence:
        'HIGH',
      notes:
        'Do not use as new-system primary key. Preserve for traceability/reconciliation.'
    },
    {
      dataset:
        'BOOKS_RECONSTRUCTED',
      sourceField:
        'TITLE',
      target:
        'LibraryItem.title',
      action:
        'DIRECT_WHEN_PRESENT',
      confidence:
        'HIGH',
      notes:
        'Required target field. Missing legacy titles are blockers.'
    },
    {
      dataset:
        'BOOKS_RECONSTRUCTED',
      sourceField:
        'PUBLISHING_DATE',
      target:
        'LibraryItem.publicationYear',
      action:
        'PARSE_4_DIGIT_YEAR',
      confidence:
        'HIGH',
      notes:
        'Preserve source value in staging even when parse succeeds.'
    },
    {
      dataset:
        'BOOKS_RECONSTRUCTED',
      sourceField:
        'CALL_NUM',
      target:
        'LibraryItem.callNumber',
      action:
        'PRESERVE_RAW',
      confidence:
        'HIGH',
      notes:
        'Do not parse/normalize Dewey automatically.'
    },
    {
      dataset:
        'BOOKS_RECONSTRUCTED',
      sourceField:
        'ISBN',
      target:
        'BookDetails.isbn',
      action:
        'TRIM_ONLY',
      confidence:
        'HIGH',
      notes:
        'Validation/normalization can be added later without changing raw staging.'
    },
    {
      dataset:
        'BOOKS_RECONSTRUCTED',
      sourceField:
        'PUBLISHERS',
      target:
        'BookDetails.publisher',
      action:
        'DIRECT_WHEN_SINGLE_VALUE',
      confidence:
        'MEDIUM',
      notes:
        'Legacy field can contain recovered/combined evidence; review multi-value cases.'
    },
    {
      dataset:
        'BOOKS_RECONSTRUCTED',
      sourceField:
        'EDITION_STATEMENT',
      target:
        'BookDetails.edition',
      action:
        'TRIM_ONLY',
      confidence:
        'MEDIUM',
      notes:
        'Keep original statement text.'
    },
    {
      dataset:
        'BOOKS_RECONSTRUCTED',
      sourceField:
        'BOOK_TYPE',
      target:
        'LibraryItem.type',
      action:
        'CANDIDATE_BOOK',
      confidence:
        'MEDIUM',
      notes:
        'Current recovered titled book rows use B, but legacy semantics should still be confirmed before full migration.'
    },
    {
      dataset:
        'BOOKS_RECONSTRUCTED',
      sourceField:
        'LANG_CODE',
      target:
        'LibraryItem.language',
      action:
        'REQUIRES_CODE_MAP',
      confidence:
        'LOW',
      notes:
        'Do not guess language-code meanings from title text.'
    },
    {
      dataset:
        'BOOKS_RECONSTRUCTED',
      sourceField:
        'AUTHORS_EDITORS',
      target:
        'Contributor + ItemContributor',
      action:
        'REQUIRES_NAME_AND_ROLE_PARSING',
      confidence:
        'LOW',
      notes:
        'Pipe-separated names and legacy role semantics require controlled parsing.'
    },
    {
      dataset:
        'BOOKS_RECONSTRUCTED',
      sourceField:
        'RECOVERED_COPY_COUNT',
      target:
        'PhysicalCopy count',
      action:
        'REQUIRES_RECONCILIATION',
      confidence:
        'LOW',
      notes:
        'Use copy evidence fields and complete source folders before generating final physical copies.'
    },
    {
      dataset:
        'ACADEMIC_WORKS_RECOVERED',
      sourceField:
        'BOOK_CODE',
      target:
        'legacy source key',
      action:
        'PRESERVE',
      confidence:
        'HIGH',
      notes:
        'Traceability only.'
    },
    {
      dataset:
        'ACADEMIC_WORKS_RECOVERED',
      sourceField:
        'TITLE',
      target:
        'LibraryItem.title',
      action:
        'DIRECT_WHEN_PRESENT',
      confidence:
        'HIGH',
      notes:
        'All current pilot rows contain a title.'
    },
    {
      dataset:
        'ACADEMIC_WORKS_RECOVERED',
      sourceField:
        'PUBLISHING_DATE',
      target:
        'LibraryItem.publicationYear',
      action:
        'PARSE_4_DIGIT_YEAR',
      confidence:
        'HIGH',
      notes:
        'Preserve source value in staging.'
    },
    {
      dataset:
        'ACADEMIC_WORKS_RECOVERED',
      sourceField:
        'CALL_NUM',
      target:
        'LibraryItem.callNumber',
      action:
        'PRESERVE_RAW',
      confidence:
        'HIGH',
      notes:
        'Comma/dot variants must remain untouched until classification rules are confirmed.'
    },
    {
      dataset:
        'ACADEMIC_WORKS_RECOVERED',
      sourceField:
        'BOOK_TYPE + RECORD_CATEGORY',
      target:
        'LibraryItem.type',
      action:
        'BLOCKED_PROJECT_VS_THESIS',
      confidence:
        'NONE',
      notes:
        'Current export groups project/thesis/research together and does not reliably distinguish target PROJECT vs THESIS.'
    },
    {
      dataset:
        'ACADEMIC_WORKS_RECOVERED',
      sourceField:
        'LANG_CODE',
      target:
        'LibraryItem.language',
      action:
        'REQUIRES_CODE_MAP',
      confidence:
        'LOW',
      notes:
        'Observed codes are preserved, not interpreted.'
    },
    {
      dataset:
        'ACADEMIC_WORKS_RECOVERED',
      sourceField:
        'NUM_OF_COPIES',
      target:
        'PhysicalCopy count',
      action:
        'REQUIRES_VALIDATION',
      confidence:
        'MEDIUM',
      notes:
        'Negative/invalid values are blockers. No copy rows are generated in Sprint 7A.'
    }
  ];
}

function duplicateTitleStats(
  records
) {
  const counts =
    new Map();

  for (const record of records) {
    const title =
      normalize(
        record.TITLE
      );

    if (!title) {
      continue;
    }

    counts.set(
      title,
      (
        counts.get(title) ??
        0
      ) + 1
    );
  }

  let duplicateGroups = 0;
  let duplicateExtraRows = 0;

  for (
    const count of
    counts.values()
  ) {
    if (count > 1) {
      duplicateGroups += 1;
      duplicateExtraRows +=
        count - 1;
    }
  }

  return {
    uniqueNonEmptyTitles:
      counts.size,
    duplicateTitleGroups:
      duplicateGroups,
    duplicateExtraRows
  };
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

async function main() {
  await fs.rm(
    outDir,
    {
      recursive: true,
      force: true
    }
  );

  await fs.mkdir(
    path.join(
      outDir,
      'staging'
    ),
    {
      recursive: true
    }
  );

  const manifestSources = [];
  const summaries = [];
  const fieldProfiles = [];
  const exceptions = [];

  for (const source of SOURCES) {
    const filePath =
      path.join(
        rawDir,
        source.fileName
      );

    const buffer =
      await fs.readFile(
        filePath
      );

    const text =
      buffer.toString(
        'utf8'
      );

    const parsed =
      parseCsv(text);

    const sourceHash =
      sha256Buffer(
        buffer
      );

    const stagingPath =
      path.join(
        outDir,
        'staging',
        `${source.dataset}.jsonl`
      );

    const stagingLines = [];

    for (
      let index = 0;
      index <
      parsed.records.length;
      index += 1
    ) {
      const record =
        parsed.records[index];

      const canonicalJson =
        canonicalRecordJson(
          parsed.headers,
          record
        );

      const rowHash =
        sha256Text(
          canonicalJson
        );

      const staged = {
        _legacy: {
          dataset:
            source.dataset,
          sourceRole:
            source.sourceRole,
          sourceFile:
            source.fileName,
          sourceFileSha256:
            sourceHash,
          sourceRecordNumber:
            index + 1,
          logicalRowNumber:
            index + 2,
          legacySourceKey:
            normalize(
              record.BOOK_CODE
            ) || null,
          rowSha256:
            rowHash
        },
        fields:
          JSON.parse(
            canonicalJson
          )
      };

      stagingLines.push(
        JSON.stringify(
          staged
        )
      );

      exceptions.push(
        ...classifyRecord(
          source,
          record,
          index + 1
        )
      );
    }

    await fs.writeFile(
      stagingPath,
      stagingLines.length
        ? `${stagingLines.join(
            '\n'
          )}\n`
        : '',
      'utf8'
    );

    for (
      const malformed of
      parsed.malformedRows
    ) {
      exceptions.push(
        createException({
          dataset:
            source.dataset,
          sourceFile:
            source.fileName,
          recordNumber:
            malformed.recordNumber,
          sourceKey:
            '',
          severity:
            'BLOCKER',
          code:
            'CSV_COLUMN_COUNT_MISMATCH',
          field:
            '',
          value:
            `${malformed.actualColumns}/${malformed.expectedColumns}`,
          message:
            'CSV record does not match the header column count.'
        })
      );
    }

    const titleStats =
      duplicateTitleStats(
        parsed.records
      );

    const missingTitleCount =
      parsed.records.filter(
        (record) =>
          !normalize(
            record.TITLE
          )
      ).length;

    const callNumberCommaCount =
      parsed.records.filter(
        (record) =>
          normalize(
            record.CALL_NUM
          ).includes(',')
      ).length;

    const negativeCopyCount =
      parsed.records.filter(
        (record) =>
          /^-\d+$/.test(
            normalize(
              record.NUM_OF_COPIES ??
              record.RECOVERED_COPY_COUNT
            )
          )
      ).length;

    const datasetExceptions =
      exceptions.filter(
        (entry) =>
          entry.dataset ===
          source.dataset
      );

    const blockerCount =
      datasetExceptions.filter(
        (entry) =>
          entry.severity ===
          'BLOCKER'
      ).length;

    const warningCount =
      datasetExceptions.filter(
        (entry) =>
          entry.severity ===
          'WARNING'
      ).length;

    const importCandidateRows =
      source.dataset ===
      'BOOKS_RECONSTRUCTED'
        ? parsed.records.length -
          missingTitleCount
        : source.dataset ===
          'ACADEMIC_WORKS_RECOVERED'
          ? 0
          : 0;

    const summary = {
      dataset:
        source.dataset,
      sourceRole:
        source.sourceRole,
      fileName:
        source.fileName,
      sha256:
        sourceHash,
      columnCount:
        parsed.headers.length,
      rowCount:
        parsed.records.length,
      malformedRowCount:
        parsed.malformedRows.length,
      missingTitleCount,
      importCandidateRows,
      blockedRows:
        source.dataset ===
        'BOOKS_RECONSTRUCTED'
          ? missingTitleCount
          : source.dataset ===
            'ACADEMIC_WORKS_RECOVERED'
            ? parsed.records.length
            : parsed.records.length,
      callNumberCommaCount,
      negativeCopyCount,
      blockerExceptionCount:
        blockerCount,
      warningExceptionCount:
        warningCount,
      ...titleStats
    };

    summaries.push(
      summary
    );

    for (
      const header of
      parsed.headers
    ) {
      fieldProfiles.push({
        dataset:
          source.dataset,
        sourceFile:
          source.fileName,
        ...profileField(
          parsed.records,
          header
        )
      });
    }

    manifestSources.push({
      dataset:
        source.dataset,
      sourceRole:
        source.sourceRole,
      fileName:
        source.fileName,
      sha256:
        sourceHash,
      bytes:
        buffer.length,
      rowCount:
        parsed.records.length,
      columnCount:
        parsed.headers.length,
      headers:
        parsed.headers,
      stagingFile:
        path.relative(
          projectRoot,
          stagingPath
        ).replace(
          /\\/g,
          '/'
        )
    });
  }

  const severityCounts =
    exceptions.reduce(
      (
        acc,
        entry
      ) => {
        acc[
          entry.severity
        ] =
          (
            acc[
              entry.severity
            ] ??
            0
          ) + 1;

        return acc;
      },
      {}
    );

  const manifest = {
    generatedAt:
      new Date()
        .toISOString(),
    rawDirectory:
      path.relative(
        projectRoot,
        rawDir
      ).replace(
        /\\/g,
        '/'
      ),
    outputDirectory:
      path.relative(
        projectRoot,
        outDir
      ).replace(
        /\\/g,
        '/'
      ),
    mutationPolicy:
      'READ_RAW_ONLY_NO_APPLICATION_DB_WRITES',
    sources:
      manifestSources
  };

  const profileSummary = {
    generatedAt:
      manifest.generatedAt,
    totals: {
      sourceFiles:
        summaries.length,
      sourceRows:
        summaries.reduce(
          (
            total,
            item
          ) =>
            total +
            item.rowCount,
          0
        ),
      exceptionCount:
        exceptions.length,
      severityCounts
    },
    datasets:
      summaries,
    migrationGate: {
      applicationDatabaseWritten:
        false,
      rawFilesModified:
        false,
      booksReadyForNextTransformPilot:
        summaries.find(
          (item) =>
            item.dataset ===
            'BOOKS_RECONSTRUCTED'
        )?.importCandidateRows ??
        0,
      academicWorksReadyForImport:
        0,
      unresolvedDecision:
        'PROJECT_VS_THESIS_MAPPING_REQUIRED'
    }
  };

  await writeJson(
    path.join(
      outDir,
      'source-manifest.json'
    ),
    manifest
  );

  await writeJson(
    path.join(
      outDir,
      'profile-summary.json'
    ),
    profileSummary
  );

  await fs.writeFile(
    path.join(
      outDir,
      'field-profile.csv'
    ),
    toCsv(
      [
        'dataset',
        'sourceFile',
        'field',
        'totalRows',
        'nonEmptyCount',
        'emptyCount',
        'distinctNonEmptyCount',
        'sampleValues'
      ],
      fieldProfiles
    ),
    'utf8'
  );

  const mappingRows =
    createMappingRows();

  await fs.writeFile(
    path.join(
      outDir,
      'mapping-readiness.csv'
    ),
    toCsv(
      [
        'dataset',
        'sourceField',
        'target',
        'action',
        'confidence',
        'notes'
      ],
      mappingRows
    ),
    'utf8'
  );

  await fs.writeFile(
    path.join(
      outDir,
      'exceptions.csv'
    ),
    toCsv(
      [
        'dataset',
        'sourceFile',
        'recordNumber',
        'sourceKey',
        'severity',
        'code',
        'field',
        'value',
        'message'
      ],
      exceptions
    ),
    'utf8'
  );

  console.log(
    'Legacy source profiling completed.'
  );

  console.log(
    `Raw source files: ${summaries.length}`
  );

  console.log(
    `Raw rows staged: ${profileSummary.totals.sourceRows}`
  );

  console.log(
    `Exceptions: ${profileSummary.totals.exceptionCount}`
  );

  for (
    const summary of
    summaries
  ) {
    console.log(
      `${summary.dataset}: ${summary.rowCount} rows, ${summary.importCandidateRows} next-step candidates, ${summary.blockerExceptionCount} blocker exception(s)`
    );
  }

  console.log(
    `Output: ${path.relative(projectRoot, outDir)}`
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
