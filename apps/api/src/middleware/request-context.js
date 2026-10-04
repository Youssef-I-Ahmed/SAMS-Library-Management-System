import crypto from 'node:crypto';

const REQUEST_ID_HEADER =
  'x-request-id';

const SAFE_REQUEST_ID =
  /^[A-Za-z0-9._:-]{1,128}$/;

export function requestContext(
  req,
  res,
  next
) {
  const incoming =
    req.get(
      REQUEST_ID_HEADER
    );

  const requestId =
    incoming &&
    SAFE_REQUEST_ID.test(
      incoming
    )
      ? incoming
      : crypto.randomUUID();

  req.requestId =
    requestId;

  res.set(
    REQUEST_ID_HEADER,
    requestId
  );

  next();
}
