// Reads and writes simple tables (a header row, then one row per record) as CSV, JSON or XLSX.
import { readXlsx } from './xlsx-read.js';
import { writeXlsx } from './xlsx-write.js';
import { AppError } from '../../utils/app-error.js';

export const FORMATS = ['xlsx', 'csv', 'json'];
export const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8'
};

const invalidFile = (message) => new AppError(400, 'IMPORT_FILE_INVALID', message);

function detectDelimiter(text) {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/** RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF/LF, ; or tab delimiters). */
export function parseCsv(text) {
  const source = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(source);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (quoted) throw invalidFile('The CSV file has an unclosed quote.');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ''));
}

/** Returns { headers: string[], records: [{ rowNumber, values: {header: string} }] } */
export function parseTable(buffer, format) {
  let rows;
  if (format === 'csv') {
    rows = parseCsv(buffer.toString('utf8'));
  } else if (format === 'json') {
    let data;
    try { data = JSON.parse(buffer.toString('utf8').replace(/^﻿/, '')); } catch { throw invalidFile('The JSON file could not be read.'); }
    const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
    if (!list || list.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw invalidFile('The JSON file must be an array of objects (or {"items": [...]}).');
    }
    const headers = [...new Set(list.flatMap((item) => Object.keys(item)))];
    const cell = (value) => (value === null || value === undefined ? ''
      : Array.isArray(value) ? value.join('; ') : typeof value === 'object' ? JSON.stringify(value) : String(value));
    rows = [headers, ...list.map((item) => headers.map((header) => cell(item[header])))];
  } else if (format === 'xlsx') {
    let sheets;
    try { sheets = readXlsx(buffer); } catch (error) { throw invalidFile(error.message || 'The Excel file could not be read.'); }
    const first = [...sheets.values()][0];
    if (!first) throw invalidFile('The Excel file has no sheets.');
    rows = first.map((row) => Array.from(row, (value) => (value === null || value === undefined ? '' : String(value))))
      .filter((cells) => cells.some((cell) => cell.trim() !== ''));
  } else {
    throw invalidFile('Unsupported file format.');
  }
  if (!rows.length) throw invalidFile('The file is empty.');
  const headers = rows[0].map((header) => String(header ?? '').trim());
  if (!headers.some(Boolean)) throw invalidFile('The first row must hold the column names.');
  const records = rows.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, c) => [header, String(cells[c] ?? '').trim()]).filter(([header]) => header))
  }));
  return { headers: headers.filter(Boolean), records };
}

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",;\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** columns: string[]; rows: object[]; extraSheets: [{name, rows}] for XLSX only. */
export function serializeTable(format, columns, rows, { sheetName = 'Catalog', extraSheets = [] } = {}) {
  if (format === 'json') return Buffer.from(JSON.stringify(rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]))), null, 2), 'utf8');
  if (format === 'csv') {
    // The BOM makes Excel open Arabic text correctly.
    const lines = [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(','))];
    return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
  }
  if (format === 'xlsx') {
    return writeXlsx([{ name: sheetName, rows: [columns, ...rows.map((row) => columns.map((c) => row[c] ?? ''))] }, ...extraSheets]);
  }
  throw invalidFile('Unsupported file format.');
}
