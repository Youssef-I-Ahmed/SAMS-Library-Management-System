import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import '../../styles/cinematic-campus.css';

const Sequence = lazy(() => import('./CanvasFrameSequence'));
export function skipCampusIntro(event) {
  event.preventDefault();
  const target = document.getElementById('home-collections');
  if (target) {
    const header = target.closest('.student-shell')?.querySelector('.student-shell__header');
    target.style.scrollMarginBlockStart = `${(header?.getBoundingClientRect().height || 0) + 12}px`;
  }
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ behavior: 'instant', block: 'start' });
}
export function CinematicCampusIntro() {
  const { t } = useLanguage();
  const [eligible, setEligible] = useState(false), [active, setActive] = useState(false), [chapter, setChapter] = useState(0);
  const track = useRef(null), stage = useRef(null);
  useEffect(() => {
    const wide = matchMedia('(min-width: 768px)'), motion = matchMedia('(prefers-reduced-motion: reduce)'), connection = navigator.connection;
    const update = () => { const allowed = wide.matches && !motion.matches && !connection?.saveData; setEligible(allowed); if (!allowed) setActive(false); };
    update(); wide.addEventListener('change', update); motion.addEventListener('change', update); connection?.addEventListener('change', update);
    return () => { wide.removeEventListener('change', update); motion.removeEventListener('change', update); connection?.removeEventListener('change', update); };
  }, []);
  useEffect(() => {
    if (!active) return;
    const header = track.current.closest('.student-shell').querySelector('.student-shell__header');
    const resize = () => {
      if (!track.current || !stage.current) return;
      track.current.style.setProperty('--campus-header', `${header.getBoundingClientRect().height}px`);
      const stageHeight = stage.current.getBoundingClientRect().height;
      const available = innerHeight - header.getBoundingClientRect().height - 24;
      const travel = Math.min(1000, Math.max(560, Math.min(available * 1.1, stageHeight * 1.4)));
      track.current.style.height = `${stageHeight + travel}px`;
    };
    const observer = new ResizeObserver(resize); observer.observe(header); observer.observe(stage.current);
    window.addEventListener('resize', resize); resize();
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [active]);
  if (!eligible) return null;
  return <section className="campus-intro" aria-label={t('cinematic.title')}>
    <div className="home-container campus-invitation">
      <div><span className="campus-eyebrow">{t('cinematic.eyebrow')}</span><h2>{t('cinematic.title')}</h2><p>{t('cinematic.invitation')}</p></div>
      <button type="button" aria-expanded={active} aria-controls="campus-journey" onClick={() => { setActive(!active); setChapter(0); }}>{t(active ? 'cinematic.close' : 'cinematic.start')}</button>
    </div>
    <div id="campus-journey" className="campus-track" ref={track} hidden={!active}>
      {active && <div className="campus-sticky" ref={stage}>
        <div className="campus-toolbar"><span>{t('cinematic.scroll')}</span><a href="#home-collections" onClick={skipCampusIntro}>{t('cinematic.skip')} <span aria-hidden="true">↓</span></a></div>
        <div className="campus-screen">
          <img src="/images/scrollVideo/v001/mobile/frame-001.webp" width="640" height="360" alt="" />
          <Suspense fallback={null}><Sequence track={track} stage={stage} onChapter={setChapter} /></Suspense>
          <div className="campus-handoff" aria-hidden="true"><strong>{t('cinematic.handoffTitle')}</strong></div>
        </div>
        <div className="campus-caption"><div><span className="campus-eyebrow">{String(chapter + 1).padStart(2, '0')} / 06</span><h3>{chapter === 5 ? <a href="#home-collections" onClick={skipCampusIntro}>{t('cinematic.chapters.5')}</a> : t(`cinematic.chapters.${chapter}`)}</h3></div><p>{t(chapter === 5 ? 'cinematic.finalDisclaimer' : 'cinematic.concept')}</p></div>
      </div>}
    </div>
  </section>;
}
