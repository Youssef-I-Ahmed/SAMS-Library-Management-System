// Book covers: a librarian-uploaded image wins; otherwise a book with a valid
// ISBN shows the Open Library cover for that ISBN (the browser loads it directly).
import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';

export const COVER_DIR = process.env.COVER_STORAGE_DIR
  ? resolve(process.env.COVER_STORAGE_DIR)
  : fileURLToPath(new URL('../../../uploads/covers/', import.meta.url));
export const MAX_COVER_BYTES = 3 * 1024 * 1024;
const FILE_NAME = /^[0-9a-f-]{36}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** Detects the image type from its first bytes; the declared type is not trusted. */
export function imageKind(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function validIsbn(value) {
  const isbn = String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((total, char, i) => total + (char === 'X' ? 10 : Number(char)) * (10 - i), 0);
    return sum % 11 === 0 ? isbn : null;
  }
  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn].reduce((total, char, i) => total + Number(char) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0 ? isbn : null;
  }
  return null;
}

/** The cover a page should show for this item, or null for the placeholder. */
export function coverOf(item) {
  if (item?.coverImagePath && FILE_NAME.test(item.coverImagePath)) {
    const stamp = item.coverUpdatedAt ? `?v=${new Date(item.coverUpdatedAt).getTime()}` : '';
    return { source: 'UPLOAD', path: `covers/${item.coverImagePath}${stamp}` };
  }
  const isbn = item?.type === 'BOOK' ? validIsbn(item.bookDetails?.isbn) : null;
  if (isbn) {
    return { source: 'OPEN_LIBRARY', url: `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,
      sourcePageUrl: `https://openlibrary.org/isbn/${isbn}` };
  }
  return null;
}

export const withCover = (item) => {
  const { coverImagePath: _path, coverUpdatedAt: _updated, ...rest } = item;
  return { ...rest, cover: coverOf(item) };
};

async function removeFile(name) {
  if (name && FILE_NAME.test(name)) await unlink(resolve(COVER_DIR, name)).catch(() => {});
}

export async function saveCover(itemId, buffer) {
  const kind = imageKind(buffer);
  if (!kind) throw new AppError(400, 'COVER_INVALID', 'Upload a JPEG, PNG or WebP image.');
  if (buffer.length > MAX_COVER_BYTES) throw new AppError(413, 'COVER_TOO_LARGE', 'The image must be 3 MB or smaller.');
  const item = await prisma.libraryItem.findUnique({ where: { id: itemId }, select: { id: true, coverImagePath: true } });
  if (!item) throw new AppError(404, 'NOT_FOUND', 'Library item not found');
  const name = `${itemId}-${randomBytes(6).toString('hex')}.${kind}`;
  await mkdir(COVER_DIR, { recursive: true });
  await writeFile(resolve(COVER_DIR, name), buffer, { flag: 'wx' });
  try {
    const updated = await prisma.libraryItem.update({ where: { id: itemId },
      data: { coverImagePath: name, coverUpdatedAt: new Date() },
      select: { id: true, type: true, title: true, coverImagePath: true, coverUpdatedAt: true, bookDetails: { select: { isbn: true } } } });
    await removeFile(item.coverImagePath);
    return { id: updated.id, title: updated.title, cover: coverOf(updated) };
  } catch (error) {
    await removeFile(name);
    throw error;
  }
}

export async function deleteCover(itemId) {
  const item = await prisma.libraryItem.findUnique({ where: { id: itemId }, select: { id: true, coverImagePath: true } });
  if (!item) throw new AppError(404, 'NOT_FOUND', 'Library item not found');
  const updated = await prisma.libraryItem.update({ where: { id: itemId },
    data: { coverImagePath: null, coverUpdatedAt: new Date() },
    select: { id: true, type: true, title: true, coverImagePath: true, coverUpdatedAt: true, bookDetails: { select: { isbn: true } } } });
  await removeFile(item.coverImagePath);
  return { id: updated.id, title: updated.title, cover: coverOf(updated) };
}
