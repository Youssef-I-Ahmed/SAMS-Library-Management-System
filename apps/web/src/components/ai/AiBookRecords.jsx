import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../hooks/useLanguage';

export function AiBookRecords({ books, title, itemDetailsBase, preview = false }) {
  const { t, language } = useLanguage();
  const [shown, setShown] = useState(20);
  if (!books?.length) return null;
  const number = (n) => new Intl.NumberFormat(language).format(n);
  return <section className="ai-records">
    <h3>{title}</h3>
    {preview && <p className="ai-secondary">{t('ai.previewHint')}</p>}
    <ul className="ai-records__list">
      {books.slice(0, shown).map((book, index) => {
        const legacyCodes = book.book_codes.filter((code) => !code.startsWith('sams:'));
        return <li key={`${book.book_codes.join('|')}-${index}`} className="ai-record">
        <span className="ai-record__kind">{t('ai.scopeBooks')}</span>
        <h4 dir="auto">{book.tag && <bdi className="ai-record__tag">[{book.tag}] </bdi>}{book.title || t('ai.unknownTitle')}</h4>
        <p className="ai-record__byline"><span className="ai-visually-hidden">{t('ai.author')}: </span><bdi>{book.author || t('ai.notRecorded')}</bdi></p>
        <dl>
          <div><dt>{t('ai.year')}</dt><dd>{book.year == null ? t('ai.notRecorded') : new Intl.NumberFormat(language, { useGrouping: false }).format(book.year)}</dd></div>
          <div><dt>{t('ai.callNumber')}</dt><dd dir="auto">{book.call_number || t('ai.notRecorded')}</dd></div>
          {legacyCodes.length > 0 && <div><dt>{t('discovery.detail.legacyCode')}</dt><dd dir="auto">{legacyCodes.join(' · ')}</dd></div>}
        </dl>
        <div className="ai-record__footer"><p className="ai-record__identity">{t(`ai.identity.${book.identity.status}`)}</p>
        {book.identity.status === 'mapped' && book.identity.library_item_id &&
          <Link aria-label={t('ai.details')} to={`${itemDetailsBase}/${encodeURIComponent(book.identity.library_item_id)}`}><span className="ai-action-label--full">{t('ai.details')}</span><span className="ai-action-label--short">{t('ai.detailsShort')}</span><span aria-hidden="true">↗</span></Link>}
        </div>
        </li>;
      })}
    </ul>
    {books.length > 20 && <p className="ai-secondary">{t('ai.showing').replace('{shown}', number(Math.min(shown, books.length))).replace('{total}', number(books.length))}</p>}
    {shown < books.length && <button type="button" className="ai-button ai-button--quiet" onClick={() => setShown((n) => n + 20)}>{t('ai.more')}</button>}
  </section>;
}
