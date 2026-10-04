const [
  librarianToken,
  copyId,
  studentNumberA,
  studentNumberB
] = process.argv.slice(2);

if (
  !librarianToken ||
  !copyId ||
  !studentNumberA ||
  !studentNumberB
) {
  throw new Error(
    'Usage: node sprint5a-checkout-concurrency-smoke.js <librarianToken> <copyId> <studentNumberA> <studentNumberB>'
  );
}

const baseUrl =
  process.env.SAMS_API_URL ??
  'http://localhost:4000';

async function checkout(studentNumber) {
  const response = await fetch(
    `${baseUrl}/api/v1/borrowings/checkout`,
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
        copyId
      })
    }
  );

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    status: response.status,
    body
  };
}

async function main() {
  const [resultA, resultB] =
    await Promise.all([
      checkout(studentNumberA),
      checkout(studentNumberB)
    ]);

  const successes = [
    resultA,
    resultB
  ].filter(
    (result) => result.status === 201
  );

  const conflicts = [
    resultA,
    resultB
  ].filter(
    (result) => result.status === 409
  );

  if (successes.length !== 1) {
    throw new Error(
      `Expected exactly one successful checkout, got ${successes.length}. A=${JSON.stringify(resultA)} B=${JSON.stringify(resultB)}`
    );
  }

  if (conflicts.length !== 1) {
    throw new Error(
      `Expected exactly one checkout conflict, got ${conflicts.length}. A=${JSON.stringify(resultA)} B=${JSON.stringify(resultB)}`
    );
  }

  console.log(
    'Exactly one checkout claimed the physical copy.'
  );
  console.log(
    'Competing checkout received HTTP 409.'
  );
  console.log(
    'Sprint 5A checkout concurrency smoke PASSED.'
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
