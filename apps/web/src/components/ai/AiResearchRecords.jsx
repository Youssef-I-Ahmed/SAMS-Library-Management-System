import { Link } from 'react-router-dom';
import { useLanguage } from '../../hooks/useLanguage';

export function AiResearchRecords({ records, itemDetailsBase }) {
  const { t, language } = useLanguage();
  const year = new Intl.NumberFormat(language === 'ar' ? 'ar-u-nu-latn' : language, { useGrouping: false });
  const languages = new Intl.DisplayNames([language], { type: 'language' });
  return <ul className="ai-records__list">
    {records.map((record) => {
      const fields = [
        ['ai.researchResearchers', record.researchers.join(' · ')],
        ['ai.researchSupervisors', record.supervisors.join(' · ')],
        ['discovery.detail.subjects', record.subjects.join(' · ')],
        ['ai.year', record.publication_year && year.format(record.publication_year)],
        ['ai.researchLanguage', record.language && (/^[a-z]{2,3}$/i.test(record.language)
          ? languages.of(record.language) : record.language)],
        ['ai.callNumber', record.call_number],
        ['discovery.detail.legacyCode', record.legacy_code],
        ['ai.researchAvailability', t(record.available ? 'ai.researchAvailable' : 'ai.researchUnavailable')]
      ];
      return <li className="ai-record ai-record--research" key={record.id}>
        <span className="ai-record__kind">{t('ai.scopeResearch')}</span>
        <h3 dir="auto">{record.title}</h3>
        <dl>{fields.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className={['discovery.detail.subjects', 'ai.researchAvailability'].includes(label) ? 'ai-record__wide' : undefined}><dt>{t(label)}</dt><dd dir="auto">{value}</dd></div>
        ))}</dl>
        <Link aria-label={t('ai.details')} to={`${itemDetailsBase}/${record.id}`}><span className="ai-action-label--full">{t('ai.details')}</span><span className="ai-action-label--short">{t('ai.detailsShort')}</span><span aria-hidden="true">↗</span></Link>
      </li>;
    })}
  </ul>;
}
