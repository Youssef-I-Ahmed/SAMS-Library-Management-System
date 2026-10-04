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

const outputDir =
  path.join(
    projectRoot,
    'data/processed/legacy-pilot'
  );

const EXPECTED = {
  'BOOKS_PARTIAL_REFERENCE': {
    rows: 22,
    sha256:
      '4f02384aff6e4a07d21e04e6b0b1c11c2319d9824269c91f3b047b8d061eac97'
  },
  'BOOKS_RECONSTRUCTED': {
    rows: 2130,
    sha256:
      '6d7117f0100f55dc3346d648adfeb6a2d84b6fafabe745084bb5079b3e688081'
  },
  'ACADEMIC_WORKS_RECOVERED': {
    rows: 3890,
    sha256:
      '150ced30b3b3d3068b66b6b27ff0fb137ec9b8dd6386e5f2278639595bf3f411'
  }
};

async function readJson(
  name
) {
  return JSON.parse(
    await fs.readFile(
      path.join(
        outputDir,
        name
      ),
      'utf8'
    )
  );
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

async function main() {
  const manifest =
    await readJson(
      'source-manifest.json'
    );

  const summary =
    await readJson(
      'profile-summary.json'
    );

  if (
    manifest.mutationPolicy !==
    'READ_RAW_ONLY_NO_APPLICATION_DB_WRITES'
  ) {
    throw new Error(
      'Unexpected Sprint 7A mutation policy.'
    );
  }

  if (
    manifest.sources.length !==
    3
  ) {
    throw new Error(
      `Expected 3 raw sources, found ${manifest.sources.length}.`
    );
  }

  for (
    const source of
    manifest.sources
  ) {
    const expected =
      EXPECTED[
        source.dataset
      ];

    if (!expected) {
      throw new Error(
        `Unexpected dataset: ${source.dataset}`
      );
    }

    if (
      source.rowCount !==
      expected.rows
    ) {
      throw new Error(
        `${source.dataset}: expected ${expected.rows} rows, found ${source.rowCount}.`
      );
    }

    if (
      source.sha256 !==
      expected.sha256
    ) {
      throw new Error(
        `${source.dataset}: raw file SHA-256 changed. Treat this as a new legacy-source version and profile it deliberately.`
      );
    }

    const stagingPath =
      path.resolve(
        projectRoot,
        source.stagingFile
      );

    const stagedRows =
      await countJsonl(
        stagingPath
      );

    if (
      stagedRows !==
      source.rowCount
    ) {
      throw new Error(
        `${source.dataset}: staging row count ${stagedRows} does not match raw row count ${source.rowCount}.`
      );
    }

    console.log(
      `${source.dataset}: source integrity + 1:1 staging OK`
    );
  }

  if (
    summary.totals.sourceRows !==
    6042
  ) {
    throw new Error(
      `Expected 6042 total source rows, found ${summary.totals.sourceRows}.`
    );
  }

  const books =
    summary.datasets.find(
      (item) =>
        item.dataset ===
        'BOOKS_RECONSTRUCTED'
    );

  if (!books) {
    throw new Error(
      'Missing BOOKS_RECONSTRUCTED summary.'
    );
  }

  if (
    books.missingTitleCount !==
    2108
  ) {
    throw new Error(
      `Expected 2108 reconstructed-book rows with missing titles, found ${books.missingTitleCount}.`
    );
  }

  if (
    books.importCandidateRows !==
    22
  ) {
    throw new Error(
      `Expected 22 titled book transform candidates, found ${books.importCandidateRows}.`
    );
  }

  const works =
    summary.datasets.find(
      (item) =>
        item.dataset ===
        'ACADEMIC_WORKS_RECOVERED'
    );

  if (!works) {
    throw new Error(
      'Missing ACADEMIC_WORKS_RECOVERED summary.'
    );
  }

  if (
    works.rowCount !==
    3890
  ) {
    throw new Error(
      'Academic-work row count mismatch.'
    );
  }

  if (
    works.importCandidateRows !==
    0
  ) {
    throw new Error(
      'Academic works must remain blocked until PROJECT vs THESIS mapping is confirmed.'
    );
  }

  if (
    works.callNumberCommaCount !==
    135
  ) {
    throw new Error(
      `Expected 135 comma-style call numbers, found ${works.callNumberCommaCount}.`
    );
  }

  if (
    works.negativeCopyCount !==
    1
  ) {
    throw new Error(
      `Expected one negative copy-count anomaly, found ${works.negativeCopyCount}.`
    );
  }

  if (
    works.duplicateTitleGroups !==
    6
  ) {
    throw new Error(
      `Expected 6 duplicate-title groups in academic works, found ${works.duplicateTitleGroups}.`
    );
  }

  const requiredOutputs = [
    'field-profile.csv',
    'mapping-readiness.csv',
    'exceptions.csv'
  ];

  for (
    const name of
    requiredOutputs
  ) {
    const stat =
      await fs.stat(
        path.join(
          outputDir,
          name
        )
      );

    if (
      !stat.isFile() ||
      stat.size === 0
    ) {
      throw new Error(
        `${name} was not generated correctly.`
      );
    }
  }

  console.log('');
  console.log(
    'Known legacy source hashes: OK'
  );
  console.log(
    'All 6,042 raw records staged 1:1: OK'
  );
  console.log(
    'Book recovery blockers identified: OK'
  );
  console.log(
    'Project/Thesis ambiguity preserved instead of guessed: OK'
  );
  console.log(
    'Call-number and copy-count anomalies identified: OK'
  );
  console.log('');
  console.log(
    'Sprint 7A legacy profiling + staging verification PASSED.'
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
