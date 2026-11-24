import { useEffect, useState } from 'react';
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

// Open Library can take many seconds to say it has no cover; show the
// placeholder meanwhile and keep it if nothing arrives in time.
const OPEN_LIBRARY_WAIT_MS = 4000;

function CoverImage({ item, cover, typeLabel }) {
  const [state, setState] = useState('loading'); // loading | loaded | failed
  const { language } = useLanguage();
  useEffect(() => {
    if (!cover.sourcePageUrl) return undefined;
    const timer = setTimeout(() => setState((current) => (current === 'loading' ? 'failed' : current)), OPEN_LIBRARY_WAIT_MS);
    return () => clearTimeout(timer);
  }, [cover.sourcePageUrl]);
  if (state === 'failed') return <BookCoverPlaceholder type={item.type} typeLabel={typeLabel} />;
  const external = Boolean(cover.sourcePageUrl);
  return (
    <div className={`discovery-cover-stack${external && state === 'loading' ? ' is-loading' : ''}`}>
      {external && state === 'loading' && <BookCoverPlaceholder type={item.type} typeLabel={typeLabel} />}
      <div className="discovery-cover discovery-cover--book discovery-cover--pilot">
      <img src={cover.imageUrl} width="180" height="240" alt=""
        loading={external ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer"
        onLoad={(event) => setState(event.currentTarget.naturalWidth < 10 ? 'failed' : 'loaded')}
        onError={() => setState('failed')} />
      {external && state === 'loaded' && <a href={cover.sourcePageUrl} target="_blank" rel="noopener noreferrer">
        {language === 'ar' ? 'الغلاف: Open Library' : 'Cover: Open Library'}
      </a>}
      </div>
    </div>
  );
}

export function BookCover({ item, typeLabel }) {
  const cover = coverSource(item);
  if (!cover) return <BookCoverPlaceholder type={item?.type} typeLabel={typeLabel} />;
  return <CoverImage key={`${item.id}:${cover.imageUrl}`} item={item} cover={cover} typeLabel={typeLabel} />;
}
