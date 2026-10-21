import { useLanguage } from '../../hooks/useLanguage';

export function FeaturePlaceholderPage({
  titleKey,
  checkpoint
}) {
  const { t } = useLanguage();

  return (
    <section className="feature-placeholder">
      <span>{checkpoint}</span>
      <h1>{t(titleKey)}</h1>
      <p>{t('placeholder.body')}</p>
    </section>
  );
}
