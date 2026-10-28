import { useId } from 'react';
import { useLanguage } from '../../hooks/useLanguage';

// The current student API exposes circulation counts, not inventory provenance.
// Qualify those records without classifying individual copies as demo or real.
export function InventoryNotice({ descriptionId }) {
  const titleId = useId();
  const { t } = useLanguage();

  return (
    <div className="admin-source-notice" role="note" aria-labelledby={titleId}>
      <strong id={titleId}>{t('discovery.inventoryNotice.title')}</strong>
      <span id={descriptionId}>{t('discovery.inventoryNotice.body')}</span>
    </div>
  );
}
