const [
  librarianToken,
  studentNumber,
  branchId
] = process.argv.slice(2);

if (
  !librarianToken ||
  !studentNumber ||
  !branchId
) {
  throw new Error(
    'Usage: node sprint5c-visit-concurrency-smoke.js <librarianToken> <studentNumber> <branchId>'
  );
}

const baseUrl =
  process.env.SAMS_API_URL ??
  'http://localhost:4000';

async function checkIn(source) {
  const response =
    await fetch(
      `${baseUrl}/api/v1/visits/check-in`,
      {
        method: 'POST',
        headers: {
          authorization:
            `Bearer ${librarianToken}`,
          'content-type':
            'application/json'
        },
        body: JSON.stringify({
          studentNumber,
          branchId,
          source
        })
      }
    );

  let body = null;

  try {
    body =
      await response.json();
  } catch {
    body = null;
  }

  return {
    status:
      response.status,
    body
  };
}

async function main() {
  const [resultA, resultB] =
    await Promise.all([
      checkIn('BARCODE'),
      checkIn('QR')
    ]);

  const successes =
    [resultA, resultB].filter(
      (result) =>
        result.status === 201
    );

  const conflicts =
    [resultA, resultB].filter(
      (result) =>
        result.status === 409
    );

  if (successes.length !== 1) {
    throw new Error(
      `Expected exactly one successful check-in, got ${successes.length}. A=${JSON.stringify(resultA)} B=${JSON.stringify(resultB)}`
    );
  }

  if (conflicts.length !== 1) {
    throw new Error(
      `Expected exactly one open-visit conflict, got ${conflicts.length}. A=${JSON.stringify(resultA)} B=${JSON.stringify(resultB)}`
    );
  }

  const visitId =
    successes[0].body?.data?.id;

  if (!visitId) {
    throw new Error(
      'Successful check-in did not return a visit id'
    );
  }

  console.log(
    'Exactly one concurrent check-in created an open visit.'
  );
  console.log(
    'Competing check-in received HTTP 409.'
  );
  console.log(
    'Sprint 5C visit concurrency smoke PASSED.'
  );

  process.stdout.write(
    `VISIT_ID=${visitId}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
