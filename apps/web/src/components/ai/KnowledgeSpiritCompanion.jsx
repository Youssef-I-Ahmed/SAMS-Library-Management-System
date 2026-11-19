import { useEffect, useRef, useState } from 'react';
import { KnowledgeSpirit } from './KnowledgeSpirit';
import { useLanguage } from '../../hooks/useLanguage';

// Only this assistant-owned adapter can request the renderer; the SVG stays intact.
export function KnowledgeSpiritCompanion({ state, visible }) {
  const { t } = useLanguage();
  const host = useRef(null), viewer = useRef(null), latest = useRef(state);
  latest.current = state;
  const [choice, setChoice] = useState(null);
  const [capability, setCapability] = useState({ wide: false, reduced: true, limited: true });
  const [inView, setInView] = useState(false), [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    const wide = matchMedia('(min-width: 1100px)'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setCapability({ wide: wide.matches, reduced: reduced.matches,
      limited: Boolean(navigator.connection?.saveData || navigator.deviceMemory && navigator.deviceMemory <= 4 || navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) });
    update(); wide.addEventListener('change', update); reduced.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(host.current);
    return () => { observer.disconnect(); wide.removeEventListener('change', update); reduced.removeEventListener('change', update); };
  }, []);
  const enabled = !capability.reduced && !failed && (choice ?? (capability.wide && !capability.limited));
  const active = visible && inView;
  const activeNow = useRef(active); activeNow.current = active;
  // Retain a loaded viewer while collapsed. Pause it rather than reloading the asset.
  useEffect(() => {
    if (!enabled) { viewer.current?.dispose(); viewer.current = null; setReady(false); return; }
    if (!active || viewer.current) return;
    let cancelled = false, instance;
    import('./knowledge-spirit-viewer.js').then(({ createSpiritViewer }) => {
      if (cancelled) return;
      instance = createSpiritViewer(host.current, () => { setFailed(true); setReady(false); });
      viewer.current = instance;
      instance.ready.then(() => {
        if (viewer.current !== instance) return;
        instance.setState(latest.current); instance.setVisible(activeNow.current); setReady(true);
      }).catch(() => { if (viewer.current === instance) { setFailed(true); setReady(false); } });
    }).catch(() => { if (!cancelled) { setFailed(true); setReady(false); } });
    return () => { cancelled = true; };
  }, [enabled, active]);
  useEffect(() => { viewer.current?.setState(state); }, [state]);
  useEffect(() => { viewer.current?.setVisible(active); }, [active]);
  useEffect(() => () => { viewer.current?.dispose(); viewer.current = null; }, []);
  return <><div className="ai-spirit-presenter" data-viewer={ready ? '3d' : 'svg'}>
    <div className="ai-spirit-frame" ref={host} data-ready={ready}>
      <KnowledgeSpirit state={state} />
    </div>
    {failed && <span className="ai-visually-hidden" role="status">{t('ai.spiritFallback')}</span>}
  </div><div className="ai-companion__identity">
    <h2 id="ai-spirit-title">{t('ai.spirit')}</h2>
    <p className="ai-companion__state">{t(`ai.spiritState.${state}`)}</p>
    <div className="ai-spirit-controls">
    <p id="ai-spirit-view-mode" className="ai-spirit-mode" role="status">{t(enabled && !ready ? 'ai.loading3d' : ready ? 'ai.view3dActive' : 'ai.view2dActive')}</p>
    {!capability.reduced && !failed && <button type="button" className="ai-text-button ai-spirit-toggle"
      aria-describedby="ai-spirit-view-mode"
      onClick={() => setChoice(!enabled)}>{t(enabled ? 'ai.showSvg' : 'ai.show3d')}</button>}
    </div>
  </div></>;
}
