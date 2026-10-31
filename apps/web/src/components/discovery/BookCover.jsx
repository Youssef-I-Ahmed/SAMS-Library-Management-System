import { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { getPilotCover } from '../../features/discovery/book-cover-pilot';
import { BookCoverPlaceholder } from './BookCoverPlaceholder';
import './book-cover-pilot.css';

function PilotImage({ item, cover }) {
  const [failed, setFailed] = useState(false);
  const { language } = useLanguage();
  if (failed) return <BookCoverPlaceholder type={item.type} />;
  return (
    <div className="discovery-cover discovery-cover--book discovery-cover--pilot">
      <img src={cover.imageUrl} width="180" height="240" alt=""
        loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onError={() => setFailed(true)} />
      <a href={cover.sourcePageUrl} target="_blank" rel="noopener noreferrer">
        {language === 'ar' ? 'الغلاف: Open Library' : 'Cover: Open Library'}
      </a>
    </div>
  );
}

export function BookCover({ item }) {
  // Deliberately unavailable in production builds during the local pilot.
  const enabled = import.meta.env.DEV && import.meta.env.VITE_BOOK_COVER_PILOT === 'true';
  const cover = enabled ? getPilotCover(item) : null;
  if (!cover) return <BookCoverPlaceholder type={item?.type} />;
  return <PilotImage key={`${item.id}:${cover.imageUrl}`} item={item} cover={cover} />;
}
