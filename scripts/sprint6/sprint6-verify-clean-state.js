import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

loadEnvFile(
  path.resolve(
    __dirname,
    '../../.env'
  )
);

import { prisma } from '../../apps/api/src/config/prisma.js';

async function main() {
  console.log(
    'Verifying Sprint 6 clean state and persistent development seed...'
  );

  const mainBranch =
    await prisma.branch.findUnique({
      where: {
        code: 'MAIN'
      }
    });

  const [
    smokeItems,
    smokeBorrowings,
    smokeReservations,
    smokeUsers,
    smokeVisits,
    smokePolicies,
    studentUser,
    librarianUser,
    managementUser,
    devFaculty,
    devDepartment
  ] = await Promise.all([
    prisma.libraryItem.count({
      where: {
        OR: [
          {
            title: {
              startsWith:
                'Sprint6A '
            }
          },
          {
            title: {
              startsWith:
                'Sprint6B '
            }
          }
        ]
      }
    }),

    prisma.borrowing.count({
      where: {
        OR: [
          {
            copy: {
              item: {
                is: {
                  OR: [
                    {
                      title: {
                        startsWith:
                          'Sprint6A '
                      }
                    },
                    {
                      title: {
                        startsWith:
                          'Sprint6B '
                      }
                    }
                  ]
                }
              }
            }
          },
          {
            student: {
              is: {
                user: {
                  is: {
                    OR: [
                      {
                        universityEmail: {
                          startsWith:
                            'sprint6a-'
                        }
                      },
                      {
                        universityEmail: {
                          startsWith:
                            'sprint6b-'
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        ]
      }
    }),

    prisma.reservation.count({
      where: {
        OR: [
          {
            item: {
              is: {
                OR: [
                  {
                    title: {
                      startsWith:
                        'Sprint6A '
                    }
                  },
                  {
                    title: {
                      startsWith:
                        'Sprint6B '
                    }
                  }
                ]
              }
            }
          },
          {
            student: {
              is: {
                user: {
                  is: {
                    OR: [
                      {
                        universityEmail: {
                          startsWith:
                            'sprint6a-'
                        }
                      },
                      {
                        universityEmail: {
                          startsWith:
                            'sprint6b-'
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        ]
      }
    }),

    prisma.user.count({
      where: {
        OR: [
          {
            universityEmail: {
              startsWith:
                'sprint6a-'
            }
          },
          {
            universityEmail: {
              startsWith:
                'sprint6b-'
            }
          }
        ]
      }
    }),

    prisma.libraryVisit.count({
      where: {
        student: {
          is: {
            user: {
              is: {
                OR: [
                  {
                    universityEmail: {
                      startsWith:
                        'sprint6a-'
                    }
                  },
                  {
                    universityEmail: {
                      startsWith:
                        'sprint6b-'
                    }
                  }
                ]
              }
            }
          }
        }
      }
    }),

    prisma.circulationPolicy.count({
      where: {
        ...(mainBranch
          ? {
              branchId:
                mainBranch.id
            }
          : {}),
        itemType: 'BOOK',
        loanDays: 9,
        reservationHoldHours: 11,
        maxActiveLoans: 10,
        maxActiveReservations: 10,
        renewalLimit: 0
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
    })
  ]);

  if (smokeItems !== 0) {
    throw new Error(
      `Expected 0 Sprint 6 smoke items, found ${smokeItems}.`
    );
  }

  if (smokeBorrowings !== 0) {
    throw new Error(
      `Expected 0 Sprint 6 smoke borrowings, found ${smokeBorrowings}.`
    );
  }

  if (smokeReservations !== 0) {
    throw new Error(
      `Expected 0 Sprint 6 smoke reservations, found ${smokeReservations}.`
    );
  }

  if (smokeUsers !== 0) {
    throw new Error(
      `Expected 0 Sprint 6 temporary users, found ${smokeUsers}.`
    );
  }

  if (smokeVisits !== 0) {
    throw new Error(
      `Expected 0 Sprint 6 smoke visits, found ${smokeVisits}.`
    );
  }

  if (smokePolicies !== 0) {
    throw new Error(
      `Expected 0 Sprint 6 policy fixtures, found ${smokePolicies}.`
    );
  }

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

    const roleNames =
      user.userRoles.map(
        (entry) =>
          entry.role.name
      );

    if (
      !roleNames.includes(
        roleName
      )
    ) {
      throw new Error(
        `${email} is missing expected role ${roleName}`
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

  console.log(
    'Sprint 6 smoke records: CLEAN'
  );
  console.log('');
  console.log(
    'Sprint 6 clean-state verification PASSED.'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
