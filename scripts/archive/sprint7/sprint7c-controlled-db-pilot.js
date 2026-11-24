import { loadEnvFile } from 'node:process';
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

loadEnvFile(
  path.join(
    projectRoot,
    '.env'
  )
);

import { prisma } from '../../apps/api/src/config/prisma.js';

const configPath =
  path.join(
    __dirname,
    'sprint7c-pilot-config.json'
  );

const canonicalPath =
  path.join(
    projectRoot,
    'data/processed/legacy-pilot/transform/canonical-books.jsonl'
  );

const outputDir =
  path.join(
    projectRoot,
    'data/processed/legacy-pilot/db-pilot'
  );

const planPath =
  path.join(
    outputDir,
    'db-pilot-plan.json'
  );

function normalize(
  value
) {
  return String(
    value ?? ''
  ).trim();
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

async function readConfig() {
  const config =
    JSON.parse(
      await fs.readFile(
        configPath,
        'utf8'
      )
    );

  if (
    config.mappingPurpose !==
    'TEST_ONLY_SYNTHETIC_QUARANTINE'
  ) {
    throw new Error(
      'Sprint 7C refuses to run with a config that is not explicitly marked TEST_ONLY_SYNTHETIC_QUARANTINE.'
    );
  }

  if (
    !Array.isArray(
      config.sampleLegacyBookCodes
    ) ||
    config.sampleLegacyBookCodes.length === 0
  ) {
    throw new Error(
      'Pilot sampleLegacyBookCodes is empty.'
    );
  }

  return config;
}

async function loadPilotBooks(
  config
) {
  const books =
    await readJsonl(
      canonicalPath
    );

  const wanted =
    new Set(
      config.sampleLegacyBookCodes.map(
        String
      )
    );

  const selected =
    books.filter(
      (book) =>
        wanted.has(
          String(
            book._legacy
              .legacySourceKey
          )
        )
    );

  if (
    selected.length !==
    wanted.size
  ) {
    const found =
      new Set(
        selected.map(
          (book) =>
            String(
              book._legacy
                .legacySourceKey
            )
        )
      );

    const missing =
      [...wanted].filter(
        (code) =>
          !found.has(code)
      );

    throw new Error(
      `Pilot canonical sample is incomplete. Missing BOOK_CODE(s): ${missing.join(', ')}`
    );
  }

  return selected;
}

function getMappedBranch(
  config,
  sourceDb
) {
  const mapping =
    config
      .sourceDbToPilotBranch[
        sourceDb
      ];

  if (!mapping) {
    throw new Error(
      `No explicit pilot branch mapping for legacy source DB: ${sourceDb}`
    );
  }

  return mapping;
}

function getMappedStatus(
  config,
  rawStatuses
) {
  const unique =
    [...new Set(
      rawStatuses
        .map(normalize)
        .filter(Boolean)
    )];

  if (
    unique.length !== 1
  ) {
    throw new Error(
      `Pilot expects exactly one legacy status per selected record. Got: ${unique.join(' | ')}`
    );
  }

  const legacyStatus =
    unique[0];

  const mapped =
    config
      .legacyStatusHandling[
        legacyStatus
      ];

  if (!mapped) {
    throw new Error(
      `No explicit pilot status handling for legacy status: ${legacyStatus}`
    );
  }

  if (
    mapped !==
    'UNAVAILABLE'
  ) {
    throw new Error(
      `Sprint 7C test pilot only permits quarantine status UNAVAILABLE. Received ${mapped}.`
    );
  }

  return {
    legacyStatus,
    targetStatus:
      mapped
  };
}

async function ensureOutputDir() {
  await fs.mkdir(
    outputDir,
    {
      recursive: true
    }
  );
}

async function cleanupPilot() {
  const config =
    await readConfig();

  const pilotLogs =
    await prisma.auditLog.findMany({
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
      },
      select: {
        id: true,
        entityId: true
      }
    });

  const itemIds =
    [...new Set(
      pilotLogs.map(
        (log) =>
          log.entityId
      )
    )];

  if (
    itemIds.length > 0
  ) {
    await prisma.$transaction(
      async (tx) => {
        await tx.auditLog.deleteMany({
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
        });

        await tx.physicalCopy.deleteMany({
          where: {
            itemId: {
              in: itemIds
            }
          }
        });

        await tx.itemContributor.deleteMany({
          where: {
            itemId: {
              in: itemIds
            }
          }
        });

        await tx.bookDetails.deleteMany({
          where: {
            itemId: {
              in: itemIds
            }
          }
        });

        await tx.academicWorkDetails.deleteMany({
          where: {
            itemId: {
              in: itemIds
            }
          }
        });

        await tx.libraryItem.deleteMany({
          where: {
            id: {
              in: itemIds
            }
          }
        });
      },
      {
        timeout: 20000
      }
    );
  } else {
    await prisma.auditLog.deleteMany({
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
    });
  }

  const branchCodes =
    Object.values(
      config
        .sourceDbToPilotBranch
    ).map(
      (entry) =>
        entry.code
    );

  for (
    const code of
    branchCodes
  ) {
    const branch =
      await prisma.branch.findUnique({
        where: {
          code
        },
        select: {
          id: true
        }
      });

    if (!branch) {
      continue;
    }

    const references =
      await Promise.all([
        prisma.physicalCopy.count({
          where: {
            branchId:
              branch.id
          }
        }),
        prisma.reservation.count({
          where: {
            branchId:
              branch.id
          }
        }),
        prisma.borrowing.count({
          where: {
            branchId:
              branch.id
          }
        }),
        prisma.libraryVisit.count({
          where: {
            branchId:
              branch.id
          }
        }),
        prisma.circulationPolicy.count({
          where: {
            branchId:
              branch.id
          }
        }),
        prisma.auditLog.count({
          where: {
            branchId:
              branch.id
          }
        })
      ]);

    const totalRefs =
      references.reduce(
        (
          total,
          count
        ) =>
          total + count,
        0
      );

    if (
      totalRefs !== 0
    ) {
      throw new Error(
        `Refusing to delete pilot branch ${code}; ${totalRefs} referencing record(s) remain.`
      );
    }

    await prisma.branch.delete({
      where: {
        id: branch.id
      }
    });
  }

  console.log(
    'Sprint 7C pilot cleanup completed.'
  );
}

async function planPilot() {
  const config =
    await readConfig();

  const books =
    await loadPilotBooks(
      config
    );

  const collisionChecks = [];

  for (
    const book of
    books
  ) {
    const sourceDb =
      normalize(
        book._legacy
          .masterSourceDb
      );

    const branch =
      getMappedBranch(
        config,
        sourceDb
      );

    const status =
      getMappedStatus(
        config,
        book.unresolved
          .copyStatusesRaw
      );

    const exactExisting =
      await prisma.libraryItem.findMany({
        where: {
          type: 'BOOK',
          title:
            book.libraryItem
              .title,
          publicationYear:
            book.libraryItem
              .publicationYear,
          callNumber:
            book.libraryItem
              .callNumber
        },
        select: {
          id: true,
          title: true,
          publicationYear: true,
          callNumber: true
        }
      });

    collisionChecks.push({
      legacyBookCode:
        book._legacy
          .legacySourceKey,
      title:
        book.libraryItem.title,
      sourceDb,
      pilotBranchCode:
        branch.code,
      legacyStatus:
        status.legacyStatus,
      pilotTargetStatus:
        status.targetStatus,
      proposedCopyCount:
        book.copyEvidence
          .copyGeneralCodes
          .length,
      exactExistingCount:
        exactExisting.length,
      existingIds:
        exactExisting.map(
          (item) =>
            item.id
        )
    });
  }

  const blockers =
    collisionChecks.filter(
      (row) =>
        row.exactExistingCount >
        0
    );

  const plan = {
    generatedAt:
      new Date()
        .toISOString(),
    pilotTag:
      config.pilotTag,
    mappingPurpose:
      config.mappingPurpose,
    applicationDatabaseWritePlanned:
      blockers.length === 0,
    sampleBookCount:
      books.length,
    proposedCopyCount:
      collisionChecks.reduce(
        (
          total,
          row
        ) =>
          total +
          row.proposedCopyCount,
        0
      ),
    collisionBlockerCount:
      blockers.length,
    collisionChecks,
    safety: {
      pilotBranchesTemporary:
        true,
      copyTargetStatus:
        'UNAVAILABLE',
      lendableCopiesCreated:
        false,
      productionMappingApproved:
        false,
      autoMergeDuplicates:
        false
    }
  };

  await ensureOutputDir();

  await fs.writeFile(
    planPath,
    `${JSON.stringify(
      plan,
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log(
    'Sprint 7C DB pilot plan generated.'
  );
  console.log(
    `Sample books: ${plan.sampleBookCount}`
  );
  console.log(
    `Proposed copies: ${plan.proposedCopyCount}`
  );
  console.log(
    `Exact existing collision blockers: ${plan.collisionBlockerCount}`
  );
  console.log(
    `Plan: ${path.relative(projectRoot, planPath)}`
  );

  if (
    blockers.length > 0
  ) {
    throw new Error(
      'Controlled import blocked because exact SAMS LibraryItem collisions already exist.'
    );
  }
}

async function createPilotBranches(
  tx,
  config
) {
  const result =
    new Map();

  for (
    const [
      sourceDb,
      mapping
    ] of Object.entries(
      config
        .sourceDbToPilotBranch
    )
  ) {
    const existing =
      await tx.branch.findUnique({
        where: {
          code:
            mapping.code
        }
      });

    if (existing) {
      throw new Error(
        `Pilot branch already exists: ${mapping.code}. Run cleanup first.`
      );
    }

    const branch =
      await tx.branch.create({
        data: {
          code:
            mapping.code,
          name:
            mapping.name,
          location:
            `Temporary migration pilot for ${sourceDb}`,
          isActive: true
        }
      });

    result.set(
      sourceDb,
      branch
    );
  }

  return result;
}

async function importPilot() {
  const config =
    await readConfig();

  const books =
    await loadPilotBooks(
      config
    );

  const plan =
    JSON.parse(
      await fs.readFile(
        planPath,
        'utf8'
      )
    );

  if (
    plan.pilotTag !==
    config.pilotTag ||
    plan.collisionBlockerCount !==
    0
  ) {
    throw new Error(
      'Valid collision-free Sprint 7C pilot plan is required before import.'
    );
  }

  const imported =
    await prisma.$transaction(
      async (tx) => {
        const branches =
          await createPilotBranches(
            tx,
            config
          );

        const output = [];

        for (
          const book of
          books
        ) {
          const sourceDb =
            normalize(
              book._legacy
                .masterSourceDb
            );

          const branch =
            branches.get(
              sourceDb
            );

          if (!branch) {
            throw new Error(
              `Pilot branch not prepared for ${sourceDb}.`
            );
          }

          const statusMapping =
            getMappedStatus(
              config,
              book.unresolved
                .copyStatusesRaw
            );

          const item =
            await tx.libraryItem.create({
              data: {
                type: 'BOOK',
                title:
                  book.libraryItem
                    .title,
                callNumber:
                  book.libraryItem
                    .callNumber,
                publicationYear:
                  book.libraryItem
                    .publicationYear,
                language: null,
                deweyCodeRaw:
                  null,
                abstractDescription:
                  null,
                isActive: true
              }
            });

          const details =
            book.bookDetails;

          if (
            details.isbn ||
            details.publisher ||
            details.edition
          ) {
            await tx.bookDetails.create({
              data: {
                itemId:
                  item.id,
                isbn:
                  details.isbn,
                publisher:
                  details.publisher,
                edition:
                  details.edition
              }
            });
          }

          const copies = [];

          for (
            const legacyCopyCode of
            book.copyEvidence
              .copyGeneralCodes
          ) {
            const copy =
              await tx.physicalCopy.create({
                data: {
                  itemId:
                    item.id,
                  branchId:
                    branch.id,
                  copyCode:
                    legacyCopyCode,
                  barcode: null,
                  shelfLocation:
                    null,
                  status:
                    statusMapping
                      .targetStatus,
                  condition:
                    null
                }
              });

            copies.push(copy);
          }

          await tx.auditLog.create({
            data: {
              actorUserId:
                null,
              action:
                'LEGACY_PILOT_IMPORT',
              entityType:
                'LibraryItem',
              entityId:
                item.id,
              branchId:
                branch.id,
              metadata: {
                pilotTag:
                  config.pilotTag,
                mappingPurpose:
                  config.mappingPurpose,
                sourceDataset:
                  book._legacy
                    .dataset,
                sourceFile:
                  book._legacy
                    .sourceFile,
                sourceFileSha256:
                  book._legacy
                    .sourceFileSha256,
                sourceRecordNumber:
                  book._legacy
                    .sourceRecordNumber,
                legacyBookCode:
                  book._legacy
                    .legacySourceKey,
                sourceRowSha256:
                  book._legacy
                    .rowSha256,
                canonicalSha256:
                  book._transform
                    .canonicalSha256,
                sourceDb,
                legacyStatuses:
                  book.unresolved
                    .copyStatusesRaw,
                pilotTargetStatus:
                  statusMapping
                    .targetStatus,
                legacyCopyCodes:
                  book.copyEvidence
                    .copyGeneralCodes,
                deletedCopyEvidenceCount:
                  book.copyEvidence
                    .deletedCopyCount,
                productionMappingApproved:
                  false
              }
            }
          });

          output.push({
            legacyBookCode:
              book._legacy
                .legacySourceKey,
            itemId:
              item.id,
            branchCode:
              branch.code,
            copies:
              copies.map(
                (copy) =>
                  copy.id
              )
          });
        }

        return output;
      },
      {
        timeout: 20000
      }
    );

  await ensureOutputDir();

  await fs.writeFile(
    path.join(
      outputDir,
      'db-pilot-import-result.json'
    ),
    `${JSON.stringify(
      {
        importedAt:
          new Date()
            .toISOString(),
        pilotTag:
          config.pilotTag,
        items:
          imported
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log(
    'Sprint 7C controlled pilot import committed.'
  );
  console.log(
    `Imported items: ${imported.length}`
  );
  console.log(
    `Imported copies: ${imported.reduce(
      (
        total,
        entry
      ) =>
        total +
        entry.copies.length,
      0
    )}`
  );
  console.log(
    'All imported copies are quarantined as UNAVAILABLE.'
  );
}

async function verifyPilot() {
  const config =
    await readConfig();

  const logs =
    await prisma.auditLog.findMany({
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
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

  if (
    logs.length !== 3
  ) {
    throw new Error(
      `Expected 3 pilot audit records, found ${logs.length}.`
    );
  }

  const itemIds =
    logs.map(
      (log) =>
        log.entityId
    );

  const items =
    await prisma.libraryItem.findMany({
      where: {
        id: {
          in: itemIds
        }
      },
      include: {
        bookDetails: true,
        physicalCopies: {
          include: {
            branch: true
          }
        }
      }
    });

  if (
    items.length !== 3
  ) {
    throw new Error(
      `Expected 3 pilot LibraryItems, found ${items.length}.`
    );
  }

  const totalCopies =
    items.reduce(
      (
        total,
        item
      ) =>
        total +
        item.physicalCopies
          .length,
      0
    );

  if (
    totalCopies !== 4
  ) {
    throw new Error(
      `Expected 4 pilot PhysicalCopies, found ${totalCopies}.`
    );
  }

  for (
    const item of
    items
  ) {
    if (
      item.type !==
      'BOOK'
    ) {
      throw new Error(
        'Pilot item type must remain BOOK.'
      );
    }

    if (
      item.language !==
      null ||
      item.deweyCodeRaw !==
      null
    ) {
      throw new Error(
        'Pilot must not invent language or Dewey mappings.'
      );
    }

    for (
      const copy of
      item.physicalCopies
    ) {
      if (
        copy.status !==
        'UNAVAILABLE'
      ) {
        throw new Error(
          `Pilot copy ${copy.id} is unexpectedly lendable/status=${copy.status}.`
        );
      }

      if (
        !copy.branch.code
          .startsWith(
            'LEGACY_PILOT_'
          )
      ) {
        throw new Error(
          'Pilot copy was assigned outside temporary pilot branches.'
        );
      }
    }
  }

  const sameTitle =
    items.filter(
      (item) =>
        item.title ===
        'الإدارة الإلكترونية'
    );

  if (
    sameTitle.length !== 2
  ) {
    throw new Error(
      'Expected two distinct الإدارة الإلكترونية pilot items.'
    );
  }

  if (
    sameTitle[0].id ===
    sameTitle[1].id
  ) {
    throw new Error(
      'Review-only duplicate candidates were incorrectly merged.'
    );
  }

  const callNumbers =
    new Set(
      sameTitle.map(
        (item) =>
          item.callNumber
      )
    );

  if (
    callNumbers.size !== 2
  ) {
    throw new Error(
      'Same-title pilot records lost distinct call-number evidence.'
    );
  }

  const digiBranch =
    await prisma.branch.findUnique({
      where: {
        code:
          'LEGACY_PILOT_DIGI1'
      },
      include: {
        physicalCopies: true
      }
    });

  const sssBranch =
    await prisma.branch.findUnique({
      where: {
        code:
          'LEGACY_PILOT_SSS'
      },
      include: {
        physicalCopies: true
      }
    });

  if (
    digiBranch
      ?.physicalCopies
      .length !== 3
  ) {
    throw new Error(
      'Expected 3 quarantined copies in LEGACY_PILOT_DIGI1.'
    );
  }

  if (
    sssBranch
      ?.physicalCopies
      .length !== 1
  ) {
    throw new Error(
      'Expected 1 quarantined copy in LEGACY_PILOT_SSS.'
    );
  }

  const circulationRefs =
    await Promise.all([
      prisma.reservation.count({
        where: {
          itemId: {
            in: itemIds
          }
        }
      }),
      prisma.borrowing.count({
        where: {
          copy: {
            itemId: {
              in: itemIds
            }
          }
        }
      })
    ]);

  if (
    circulationRefs.some(
      (count) =>
        count !== 0
    )
  ) {
    throw new Error(
      'Pilot migration items unexpectedly have circulation records.'
    );
  }

  console.log(
    '3 bibliographic pilot items: OK'
  );
  console.log(
    '4 quarantined PhysicalCopies: OK'
  );
  console.log(
    'Two same-title records remain distinct: OK'
  );
  console.log(
    'Temporary source branches: 3 digi1 copies + 1 sss copy: OK'
  );
  console.log(
    'Legacy traceability AuditLogs: OK'
  );
  console.log(
    'No reservation/borrowing side effects: OK'
  );
  console.log('');
  console.log(
    'Sprint 7C controlled DB pilot verification PASSED.'
  );
}

async function verifyClean() {
  const config =
    await readConfig();

  const branchCodes =
    Object.values(
      config
        .sourceDbToPilotBranch
    ).map(
      (entry) =>
        entry.code
    );

  const [
    auditCount,
    branchCount
  ] =
    await Promise.all([
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
      prisma.branch.count({
        where: {
          code: {
            in:
              branchCodes
          }
        }
      })
    ]);

  if (
    auditCount !== 0 ||
    branchCount !== 0
  ) {
    throw new Error(
      `Pilot cleanup incomplete. audit=${auditCount}, branches=${branchCount}`
    );
  }

  console.log(
    'Sprint 7C pilot clean-state verification PASSED.'
  );
}

async function main() {
  const action =
    process.argv[2];

  switch (action) {
    case 'plan':
      await planPilot();
      break;

    case 'import':
      await importPilot();
      break;

    case 'verify':
      await verifyPilot();
      break;

    case 'cleanup':
      await cleanupPilot();
      break;

    case 'verify-clean':
      await verifyClean();
      break;

    default:
      throw new Error(
        'Usage: node sprint7c-controlled-db-pilot.js plan|import|verify|cleanup|verify-clean'
      );
  }
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
