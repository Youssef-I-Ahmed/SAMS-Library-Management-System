import { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { API_URL } from '../../lib/api';
import { getPilotCover } from '../../features/discovery/book-cover-pilot';
import { BookCoverPlaceholder } from './BookCoverPlaceholder';
import './book-cover-pilot.css';

/** Where to load a cover from: an uploaded file, Open Library by ISBN, or nothing. */
export function coverSource(item) {
  const cover = item?.cover;
  if (cover?.source === 'UPLOAD' && cover.path) return { imageUrl: `${API_URL}/${cover.path}` };
  if (cover?.source === 'OPEN_LIBRARY' && cover.url) return { imageUrl: cover.url, sourcePageUrl: cover.sourcePageUrl };
  const enabled = import.meta.env.DEV && import.meta.env.VITE_BOOK_COVER_PILOT === 'true';
  return enabled ? getPilotCover(item) : null;
}

function CoverImage({ item, cover, typeLabel }) {
  const [failed, setFailed] = useState(false);
  const { language } = useLanguage();
  if (failed) return <BookCoverPlaceholder type={item.type} typeLabel={typeLabel} />;
  return (
    <div className="discovery-cover discovery-cover--book discovery-cover--pilot">
      <img src={cover.imageUrl} width="180" height="240" alt=""
        loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onLoad={(event) => { if (event.currentTarget.naturalWidth < 10) setFailed(true); }}
        onError={() => setFailed(true)} />
      {cover.sourcePageUrl && <a href={cover.sourcePageUrl} target="_blank" rel="noopener noreferrer">
        {language === 'ar' ? 'الغلاف: Open Library' : 'Cover: Open Library'}
      </a>}
    </div>
  );
}

export function BookCover({ item, typeLabel }) {
  const cover = coverSource(item);
  if (!cover) return <BookCoverPlaceholder type={item?.type} typeLabel={typeLabel} />;
  return <CoverImage key={`${item.id}:${cover.imageUrl}`} item={item} cover={cover} typeLabel={typeLabel} />;
}
