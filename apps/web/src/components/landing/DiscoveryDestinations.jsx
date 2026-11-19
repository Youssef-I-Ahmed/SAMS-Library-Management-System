import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { getDiscoveryFacets } from '../../features/discovery/discovery-api';
import { AI_ASSISTANT_ENABLED } from '../../features/ai/ai-config.js';

export function DiscoveryDestinations() {
  const { token } = useAuth(), { t } = useLanguage();
  const [types, setTypes] = useState([]);
  useEffect(() => {
    const abort = new AbortController(); setTypes([]);
    getDiscoveryFacets(token, abort.signal).then(reply => {
      if (!abort.signal.aborted) setTypes(Array.isArray(reply?.data?.types) ? reply.data.types : []);
    }).catch(() => {}); // Existing combined collection remains usable if facets fail.
    return () => abort.abort();
  }, [token]);
  const populated = type => types.some(row => row.value === type && Number(row.count) > 0);
  const project = populated('PROJECT'), thesis = populated('THESIS');
  return <nav className="home-destinations" aria-label={t('studentHome.collectionNavigation')}>
    <Link to="/student/catalog?type=BOOK">{t('cinematic.books')}</Link>
    <Link to={`/student/catalog?type=${project ? 'PROJECT' : 'ACADEMIC_WORK'}`} aria-describedby={!project ? 'home-academic-fallback' : undefined}>{t('cinematic.projects')}</Link>
    <Link to={`/student/catalog?type=${thesis ? 'THESIS' : 'ACADEMIC_WORK'}`} aria-describedby={!thesis ? 'home-academic-fallback' : undefined}>{t('cinematic.research')}</Link>
    {AI_ASSISTANT_ENABLED ? <Link to="/student/ai">{t('ai.nav')}</Link> : <span aria-disabled="true">{t('cinematic.aiUnavailable')}</span>}
    <small id="home-academic-fallback" aria-hidden={project && thesis}>{(!project || !thesis) ? t('cinematic.combined') : '\u00a0'}</small>
  </nav>;
}
