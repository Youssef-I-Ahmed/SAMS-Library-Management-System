import { describe, it, expect, vi } from 'vitest';
import { createIdentityResolver } from '../src/modules/ai/ai-identity.js';

const A = '4afd2005-c0c3-5889-911a-b3952b7ef670';
const B = 'fe19858e-1ab4-5a75-abe6-d90f07a09e6e';
const row = (id) => ({ id, isActive: true, type: 'BOOK', bookDetails: { itemId: id } });
const db = () => ({ libraryItem: { findMany: vi.fn(async () => [row(A), row(B)]) } });
const map = new Map([['1687', A], ['1896', B], ['0002', A]]);
const reply = (codes) => ({ preview: { books: [{ book_codes: codes }] } });

describe('PostgreSQL UUID-native identity remains an explicit validated server mode', () => {
  it('keeps native codes unmapped by default', async () => {
    const database = db(); const result = await createIdentityResolver({ mapping: map, db: database })(reply(['sams:'+A]));
    expect(result.preview.books[0].identity).toEqual({ status: 'unmapped', library_item_id: null });
    expect(database.libraryItem.findMany).not.toHaveBeenCalled();
  });
  it('validates a UUID-native target with the same batched active BOOK/BookDetails read', async () => {
    const database = db(); const resolve = createIdentityResolver({ mapping: map, db: database, allowUuidCodes: true });
    const result = await resolve({ preview: { books: [{ book_codes: ['sams:'+A] }, { book_codes: ['0002'] }] } });
    expect(result.preview.books.map((book) => book.identity)).toEqual([row(A), row(A)].map(() => ({ status: 'mapped', library_item_id: A })));
    expect(database.libraryItem.findMany).toHaveBeenCalledTimes(1);
    expect(database.libraryItem.findMany.mock.calls[0][0].where).toMatchObject({ isActive: true, type: 'BOOK', bookDetails: { isNot: null } });
  });
  it('keeps 1687/1896 ambiguous and does not prefer a requested native UUID', async () => {
    const result = await createIdentityResolver({ mapping: map, db: db(), allowUuidCodes: true })({ book_code: 'sams:'+A, card: { 'Book code': '1687; 1896' } });
    expect(result.identity).toEqual({ status: 'ambiguous', library_item_id: null });
  });
  it('fails missing targets and partial groups explicitly', async () => {
    const database = db(); database.libraryItem.findMany.mockResolvedValue([]);
    const resolve = createIdentityResolver({ mapping: map, db: database, allowUuidCodes: true });
    expect((await resolve(reply(['sams:'+A]))).preview.books[0].identity.status).toBe('unavailable');
    expect((await resolve(reply(['sams:'+A, 'missing']))).preview.books[0].identity.status).toBe('unmapped');
  });
  it('does not infer a complete card group from a requested UUID when card codes are absent', async () => {
    const result = await createIdentityResolver({ mapping: map, db: db(), allowUuidCodes: true })({ book_code: 'sams:'+A, card: { 'Book code': 'NA' } });
    expect(result.identity).toEqual({ status: 'unmapped', library_item_id: null });
  });
});
