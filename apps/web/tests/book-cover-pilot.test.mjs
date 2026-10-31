import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPilotCover } from '../src/features/discovery/book-cover-pilot.js';
const book = () => ({
  id: 'e60bd2bb-1066-52fd-90ac-7dac28b4582b', type: 'BOOK',
  title: 'Writing academic english', publicationYear: 2006, language: 'en',
  bookDetails: { isbn: '0-13-152359-7', publisher: 'Pearson longman', edition: '4' },
  itemContributors: ['Alice Oshima', 'Ann Hogue'].map((fullName) => ({ contributor: { fullName } }))
});
test('reviewed candidate accepts its ISBN-10 and equivalent ISBN-13', () => {
  const item = book(); assert.ok(getPilotCover(item));
  item.bookDetails.isbn = '9780131523593'; assert.ok(getPilotCover(item));
});
for (const [field, value] of [['id', 'other'], ['type', 'THESIS'], ['title', 'Another edition'], ['publicationYear', 2007], ['language', 'ar']]) {
  test(`rejects changed ${field}`, () => { const item = book(); item[field] = value; assert.equal(getPilotCover(item), null); });
}
for (const [field, value] of [['isbn', '9780131523594'], ['edition', '5'], ['publisher', 'Other publisher']]) {
  test(`rejects changed bookDetails.${field}`, () => { const item = book(); item.bookDetails[field] = value; assert.equal(getPilotCover(item), null); });
}
test('missing bibliography and contributors fall back without exceptions', () => {
  assert.equal(getPilotCover(null), null);
  assert.equal(getPilotCover({ ...book(), bookDetails: null }), null);
  assert.equal(getPilotCover({ ...book(), itemContributors: [] }), null);
});
test('second candidate has an independent cover association', () => {
  const item = { id: '51a5a672-a505-51c2-8cd8-5be9f0039720', type: 'BOOK',
    title: 'Effective organisational communication', publicationYear: 2008, language: 'en',
    bookDetails: { isbn: '978-0-273-71375-3', publisher: 'Pearson prentice Hall', edition: '3' },
    itemContributors: ['Richard Blundel', 'Kate Ippolito'].map((fullName) => ({ contributor: { fullName } })) };
  assert.match(getPilotCover(item).imageUrl, /6925566-M/);
});
