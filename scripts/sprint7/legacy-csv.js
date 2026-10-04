import crypto from 'node:crypto';

export function sha256Buffer(
  buffer
) {
  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}

export function sha256Text(
  text
) {
  return sha256Buffer(
    Buffer.from(
      text,
      'utf8'
    )
  );
}

export function parseCsv(
  text
) {
  const source =
    text.charCodeAt(0) === 0xfeff
      ? text.slice(1)
      : text;

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (
    let index = 0;
    index < source.length;
    index += 1
  ) {
    const char =
      source[index];

    if (inQuotes) {
      if (char === '"') {
        if (
          source[index + 1] === '"'
        ) {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      field = '';

      if (
        row.length > 1 ||
        row[0] !== ''
      ) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    if (char === '\r') {
      if (
        source[index + 1] === '\n'
      ) {
        continue;
      }

      row.push(field);
      field = '';

      if (
        row.length > 1 ||
        row[0] !== ''
      ) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error(
      'CSV contains an unterminated quoted field.'
    );
  }

  if (
    field !== '' ||
    row.length > 0
  ) {
    row.push(field);

    if (
      row.length > 1 ||
      row[0] !== ''
    ) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    return {
      headers: [],
      records: [],
      malformedRows: []
    };
  }

  const headers =
    rows[0].map(
      (value) =>
        value.trim()
    );

  const records = [];
  const malformedRows = [];

  for (
    let index = 1;
    index < rows.length;
    index += 1
  ) {
    const values =
      rows[index];

    if (
      values.length !==
      headers.length
    ) {
      malformedRows.push({
        recordNumber:
          index,
        logicalRowNumber:
          index + 1,
        expectedColumns:
          headers.length,
        actualColumns:
          values.length
      });
    }

    const record = {};

    for (
      let columnIndex = 0;
      columnIndex <
      headers.length;
      columnIndex += 1
    ) {
      record[
        headers[columnIndex]
      ] =
        values[columnIndex] ??
        '';
    }

    if (
      values.length >
      headers.length
    ) {
      record.__extraValues =
        values.slice(
          headers.length
        );
    }

    records.push(record);
  }

  return {
    headers,
    records,
    malformedRows
  };
}

export function csvEscape(
  value
) {
  const text =
    value === null ||
    value === undefined
      ? ''
      : String(value);

  if (
    /[",\r\n]/.test(text)
  ) {
    return `"${text.replace(
      /"/g,
      '""'
    )}"`;
  }

  return text;
}

export function toCsv(
  headers,
  rows
) {
  const lines = [
    headers.map(
      csvEscape
    ).join(',')
  ];

  for (const row of rows) {
    lines.push(
      headers.map(
        (header) =>
          csvEscape(
            row[header]
          )
      ).join(',')
    );
  }

  return `${lines.join('\n')}\n`;
}

export function canonicalRecordJson(
  headers,
  record
) {
  const canonical = {};

  for (const header of headers) {
    canonical[header] =
      record[header] ?? '';
  }

  if (record.__extraValues) {
    canonical.__extraValues =
      record.__extraValues;
  }

  return JSON.stringify(
    canonical
  );
}
