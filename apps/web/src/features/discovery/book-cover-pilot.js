// Local preview candidates only. This is not a production rights registry.
const candidates = [
  {
    itemId: 'e60bd2bb-1066-52fd-90ac-7dac28b4582b',
    title: 'Writing academic english', year: 2006, edition: '4',
    publisher: 'Pearson longman', language: 'en',
    contributors: ['Alice Oshima', 'Ann Hogue'],
    isbns: ['0131523597', '9780131523593'],
    imageUrl: 'https://covers.openlibrary.org/b/id/1108898-M.jpg?default=false',
    sourcePageUrl: 'https://openlibrary.org/books/OL3402861M'
  },
  {
    itemId: '51a5a672-a505-51c2-8cd8-5be9f0039720',
    title: 'Effective organisational communication', year: 2008, edition: '3',
    publisher: 'Pearson prentice Hall', language: 'en',
    contributors: ['Richard Blundel', 'Kate Ippolito'],
    isbns: ['0273713752', '9780273713753'],
    imageUrl: 'https://covers.openlibrary.org/b/id/6925566-M.jpg?default=false',
    sourcePageUrl: 'https://openlibrary.org/books/OL22795134M'
  }
];
const text = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const isbn = (value) => String(value ?? '').replace(/[\s-]/g, '').toUpperCase();

export function getPilotCover(item) {
  if (item?.type !== 'BOOK') return null;
  const candidate = candidates.find((entry) => entry.itemId === item.id);
  if (!candidate || text(item.title) !== text(candidate.title)
    || String(item.publicationYear) !== String(candidate.year)
    || text(item.language) !== candidate.language
    || text(item.bookDetails?.edition) !== text(candidate.edition)
    || text(item.bookDetails?.publisher) !== text(candidate.publisher)
    || !candidate.isbns.includes(isbn(item.bookDetails?.isbn))) return null;
  const names = new Set((item.itemContributors ?? [])
    .map((entry) => text(entry.contributor?.fullName)));
  if (!candidate.contributors.every((name) => names.has(text(name)))) return null;
  return { imageUrl: candidate.imageUrl, sourcePageUrl: candidate.sourcePageUrl };
}
