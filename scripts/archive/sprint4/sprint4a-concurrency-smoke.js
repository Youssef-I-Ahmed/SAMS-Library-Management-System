const [
  itemId,
  branchId,
  studentAEmail,
  studentBEmail
] = process.argv.slice(2);

if (
  !itemId ||
  !branchId ||
  !studentAEmail ||
  !studentBEmail
) {
  throw new Error(
    'Usage: node sprint4a-concurrency-smoke.js <itemId> <branchId> <studentAEmail> <studentBEmail>'
  );
}

const baseUrl =
  process.env.SAMS_API_URL ??
  'http://localhost:4000';

async function devLogin(universityEmail) {
  const response = await fetch(
    `${baseUrl}/api/v1/auth/dev-login`,
    {
      method: 'POST',
      headers: {
        'content-type':
          'application/json'
      },
      body: JSON.stringify({
        universityEmail
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Login failed for ${universityEmail}: ${response.status} ${await response.text()}`
    );
  }

  return response.json();
}

async function reserve(token) {
  const response = await fetch(
    `${baseUrl}/api/v1/reservations`,
    {
      method: 'POST',
      headers: {
        authorization:
          `Bearer ${token}`,
        'content-type':
          'application/json'
      },
      body: JSON.stringify({
        itemId,
        branchId
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
  const [studentA, studentB] =
    await Promise.all([
      devLogin(studentAEmail),
      devLogin(studentBEmail)
    ]);

  const [resultA, resultB] =
    await Promise.all([
      reserve(studentA.accessToken),
      reserve(studentB.accessToken)
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
      `Expected exactly one successful reservation, got ${successes.length}. A=${JSON.stringify(resultA)} B=${JSON.stringify(resultB)}`
    );
  }

  if (conflicts.length !== 1) {
    throw new Error(
      `Expected exactly one reservation conflict, got ${conflicts.length}. A=${JSON.stringify(resultA)} B=${JSON.stringify(resultB)}`
    );
  }

  const conflictCode =
    conflicts[0].body?.error?.code ??
    conflicts[0].body?.code ??
    null;

  if (
    conflictCode &&
    conflictCode !==
      'NO_AVAILABLE_COPY'
  ) {
    throw new Error(
      `Expected NO_AVAILABLE_COPY conflict, got ${conflictCode}`
    );
  }

  console.log(
    'Exactly one student reserved the last copy.'
  );
  console.log(
    'Competing reservation received HTTP 409.'
  );
  console.log(
    'Sprint 4A reservation concurrency smoke PASSED.'
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
