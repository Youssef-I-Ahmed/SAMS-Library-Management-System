import { Link } from 'react-router-dom';
import { useLanguage } from '../../hooks/useLanguage';

export function AiResearchRecords({ records, itemDetailsBase }) {
  const { t, language } = useLanguage();
  const year = new Intl.NumberFormat(language, { useGrouping: false });
  const languages = new Intl.DisplayNames([language], { type: 'language' });
  return <ul className="ai-records__list">
    {records.map((record) => {
      const fields = [
        ['discovery.detail.legacyCode', record.legacy_code],
        ['ai.researchResearchers', record.researchers.join(' · ')],
        ['ai.researchSupervisors', record.supervisors.join(' · ')],
        ['discovery.detail.subjects', record.subjects.join(' · ')],
        ['ai.year', record.publication_year && year.format(record.publication_year)],
        ['ai.researchLanguage', record.language && (/^[a-z]{2,3}$/i.test(record.language)
          ? languages.of(record.language) : record.language)],
        ['ai.callNumber', record.call_number],
        ['ai.researchAvailability', t(record.available ? 'ai.researchAvailable' : 'ai.researchUnavailable')]
      ];
      return <li className="ai-record" key={record.id}>
        <h3 dir="auto">{record.title}</h3>
        <dl>{fields.filter(([, value]) => value).map(([label, value]) => (
          <div key={label}><dt>{t(label)}</dt><dd dir="auto">{value}</dd></div>
        ))}</dl>
        <Link to={`${itemDetailsBase}/${record.id}`}>{t('ai.details')}</Link>
      </li>;
    })}
  </ul>;
}
