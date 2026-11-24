// One-time setup: gives every active librarian that has no permissions yet the
// full librarian permission set, granted by a Management account.
// Usage: npm run staff:baseline -w @sams/api [-- management@sams.dev]
import { prisma } from '../src/config/prisma.js';
import { grantBaselineToUnconfiguredLibrarians } from '../src/modules/staff/staff.service.js';

const grantor = process.argv[2] || 'management@sams.dev';
try {
  const done = await grantBaselineToUnconfiguredLibrarians(grantor);
  console.log(done.length ? `Granted the librarian permissions to: ${done.join(', ')}` : 'Every active librarian already has permissions.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
