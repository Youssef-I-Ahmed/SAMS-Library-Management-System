import {inflateRawSync} from 'node:zlib';
import {posix as path} from 'node:path';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;

function fail(message) {
  throw new Error(`Invalid XLSX: ${message}`);
}

function findEocd(buffer) {
  const lower = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= lower; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD) return offset;
  }
  fail('ZIP end record missing');
}

function zipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_ARCHIVE_BYTES) {
    fail('archive exceeds the allowed size');
  }
  const eocd = findEocd(buffer);
  const entries = buffer.readUInt16LE(eocd + 10);
  const centralBytes = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (entries === 0xffff || centralBytes === 0xffffffff || centralOffset === 0xffffffff) {
    fail('ZIP64 is not supported');
  }
  if (centralOffset + centralBytes > buffer.length) fail('central directory is out of bounds');

  const result = new Map();
  let offset = centralOffset;
  let totalInflated = 0;
  for (let index = 0; index < entries; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL) fail('central directory entry is malformed');
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    offset += 46 + nameLength + extraLength + commentLength;

    if (flags & 1) fail('encrypted entries are not supported');
    if (![0, 8].includes(method)) fail('unsupported ZIP compression');
    if (uncompressedSize > MAX_ENTRY_BYTES) fail('entry exceeds the allowed size');
    if (buffer.readUInt32LE(localOffset) !== LOCAL) fail('local ZIP entry is malformed');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    if (compressed.length !== compressedSize) fail('entry data is truncated');
    const value = method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed);
    if (value.length !== uncompressedSize) fail('entry size mismatch');
    totalInflated += value.length;
    if (totalInflated > MAX_ARCHIVE_BYTES) fail('inflated archive exceeds the allowed size');
    const normalizedName = name.replaceAll('\\', '/');
    if (result.has(normalizedName)) fail('duplicate ZIP entry name');
    result.set(normalizedName, value);
  }
  return result;
}

function xmlDecode(value = '') {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll('&amp;', '&');
}

function attribute(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`));
  return match ? xmlDecode(match[1]) : null;
}

function textNodes(source) {
  let value = '';
  for (const match of source.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)) {
    value += xmlDecode(match[1]);
  }
  return value;
}

function columnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) fail('cell reference is missing');
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}

function parseSharedStrings(entries) {
  const file = entries.get('xl/sharedStrings.xml');
  if (!file) return [];
  const xml = file.toString('utf8');
  return [...xml.matchAll(/<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g)]
    .map(match => textNodes(match[1]));
}

function resolveSheetEntries(entries) {
  const workbook = entries.get('xl/workbook.xml')?.toString('utf8');
  const relationships = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8');
  if (!workbook || !relationships) fail('workbook metadata is missing');

  const targets = new Map();
  for (const match of relationships.matchAll(/<Relationship\b([^>]*?)\/?\s*>/g)) {
    const id = attribute(match[1], 'Id');
    const target = attribute(match[1], 'Target');
    if (id && target) targets.set(id, target);
  }

  const sheets = new Map();
  for (const match of workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?\s*>/g)) {
    const name = attribute(match[1], 'name');
    const id = attribute(match[1], 'r:id');
    const target = targets.get(id);
    if (!name || !target) fail('worksheet relationship is incomplete');
    const entry = target.startsWith('/') ? target.slice(1) : path.normalize(path.join('xl', target));
    if (!entry.startsWith('xl/worksheets/')) fail('worksheet target is outside the worksheet directory');
    sheets.set(name, entry);
  }
  return sheets;
}

function parseWorksheet(xml, sharedStrings) {
  if (/<(?:\w+:)?f(?:\s|\/?>)/.test(xml)) fail('formula cells are not accepted in migration sources');
  const rows = [];
  for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? '';
      const reference = attribute(attrs, 'r');
      const type = attribute(attrs, 't') ?? 'n';
      const valueMatch = body.match(/<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/);
      let value = null;
      if (type === 'inlineStr') value = textNodes(body);
      else if (valueMatch) {
        const raw = xmlDecode(valueMatch[1]);
        if (type === 's') {
          const shared = sharedStrings[Number(raw)];
          if (shared === undefined) fail('shared string index is invalid');
          value = shared;
        } else value = raw;
      }
      if (reference) row[columnIndex(reference)] = value;
    }
    rows.push(row);
  }
  return rows;
}

export function readXlsx(buffer) {
  const entries = zipEntries(buffer);
  const sharedStrings = parseSharedStrings(entries);
  const sheetEntries = resolveSheetEntries(entries);
  const result = new Map();
  for (const [name, entry] of sheetEntries) {
    const xml = entries.get(entry)?.toString('utf8');
    if (!xml) fail(`worksheet ${name} is missing`);
    result.set(name, parseWorksheet(xml, sharedStrings));
  }
  return result;
}

export const xlsxInternals = Object.freeze({xmlDecode, columnIndex});
