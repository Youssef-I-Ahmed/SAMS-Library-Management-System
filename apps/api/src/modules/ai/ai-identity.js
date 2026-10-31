import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseUniqueJson } from './ai-json.js';
import { bookCode } from './ai-schemas.js';
import { aiError, unavailable, withDeadline } from './ai-errors.js';

export function loadBookCodeMap(config) {
  try {
    if (statSync(config.AI_BOOK_CODE_MAP_PATH).size > 4 * 1024 * 1024) throw new Error();
    const bytes = readFileSync(config.AI_BOOK_CODE_MAP_PATH);
    if (createHash('sha256').update(bytes).digest('hex') !== config.AI_BOOK_CODE_MAP_SHA256) throw new Error();
    const artifact = parseUniqueJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!artifact || Array.isArray(artifact) ||
        Object.keys(artifact).sort().join(',') !== 'map,sourceSha256' ||
        artifact.sourceSha256 !== config.AI_SOURCE_SHA256 ||
        !artifact.map || Array.isArray(artifact.map) || typeof artifact.map !== 'object') throw new Error();
    const entries = Object.entries(artifact.map);
    if (!entries.length || entries.length > 50000) throw new Error();
    for (const [code, id] of entries) {
      if (!bookCode.safeParse(code).success || !z.string().uuid().safeParse(id).success) throw new Error();
    }
    return new Map(entries.map(([code, id]) => [code, id.toLowerCase()]));
  } catch {
    // No file path, fingerprint, JSON content or fs exception in error/log output.
    throw unavailable();
  }
}

export function createIdentityResolver({ mapping, db, timeoutMs = 3000 }) {
  let outstandingReads = 0;
  return async function enrich(payload) {
    const entries = [];
    const cardCodes = (card) => card['Book code'] === 'NA' ? [] : card['Book code'].split(';').map((part) => part.trim());
    if (payload.card) {
      entries.push({ target: payload, codes: cardCodes(payload.card) });
    }
    for (const target of payload.preview?.books ?? []) entries.push({ target, codes: target.book_codes });
    for (const target of payload.result?.sources ?? []) {
      // A full card must not quietly introduce another code/UUID behind a mapped
      // summary. Resolve its codes too, even if the upstream arrays disagree.
      entries.push({ target, codes: [...target.book_codes, ...cardCodes(target.card)] });
    }
    for (const target of payload.result?.all_books?.items ?? []) entries.push({ target, codes: target.book_codes });
    const targets = new Set();
    for (const entry of entries) {
      entry.ids = new Set();
      entry.partial = !entry.codes.length;
      for (const code of entry.codes) {
        const id = bookCode.safeParse(code).success ? mapping.get(code) : undefined;
        if (id) { entry.ids.add(id); targets.add(id); }
        else entry.partial = true;
      }
    }
    let active = new Set();
    if (targets.size) {
      if (outstandingReads >= 4) throw aiError(503, 'AI_CATALOG_UNAVAILABLE');
      outstandingReads++;
      // One read for all groups, no title/ISBN/description fallback. Timed-out reads
      // keep a slot until Prisma actually settles; a timeout cannot grow a DB queue.
      const read = Promise.resolve().then(() => db.libraryItem.findMany({
        where: { id: { in: [...targets] }, isActive: true, type: 'BOOK', bookDetails: { isNot: null } },
        select: { id: true, isActive: true, type: true, bookDetails: { select: { itemId: true } } }
      })).finally(() => { outstandingReads--; });
      try {
        const rows = await withDeadline(read, timeoutMs, aiError(503, 'AI_CATALOG_UNAVAILABLE'));
        active = new Set(rows.filter((row) => row.isActive && row.type === 'BOOK' &&
          row.bookDetails?.itemId === row.id && targets.has(row.id)).map((row) => row.id));
      } catch {
        throw aiError(503, 'AI_CATALOG_UNAVAILABLE');
      }
    }
    for (const entry of entries) {
      let status;
      let id = null;
      if (entry.partial) status = 'unmapped';
      else if (entry.ids.size > 1) status = 'ambiguous';
      else {
        const candidate = [...entry.ids][0];
        status = active.has(candidate) ? 'mapped' : 'unavailable';
        if (status === 'mapped') id = candidate;
      }
      entry.target.identity = { status, library_item_id: id };
    }
    return payload;
  };
}
