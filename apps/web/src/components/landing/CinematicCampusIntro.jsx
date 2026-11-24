import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { clamp01, FRAME_END, OPEN_END, readProgress } from './heroProgress';
import '../../styles/cinematic-campus.css';

const Sequence = lazy(() => import('./CanvasFrameSequence'));
const ease = value => value * value * (3 - 2 * value);

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

function useMotionAllowed() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)'), connection = navigator.connection;
    const update = () => setAllowed(!motion.matches && !connection?.saveData);
    update(); motion.addEventListener('change', update); connection?.addEventListener('change', update);
    return () => { motion.removeEventListener('change', update); connection?.removeEventListener('change', update); };
  }, []);
  return allowed;
}

/**
 * The home hero and the campus journey in one piece: the copy opens the page
 * beside an arched window onto the campus; scrolling widens the arch to the
 * full stage, plays the frames, then dissolves into the collections below.
 */
export function CampusHero({ children }) {
  const { t } = useLanguage();
  const animated = useMotionAllowed();
  const [chapter, setChapter] = useState(0);
  // Frames are only fetched once the visitor actually starts the journey.
  const [engaged, setEngaged] = useState(false);
  const root = useRef(null), track = useRef(null), stage = useRef(null);

  useEffect(() => {
    const element = track.current;
    const header = element.closest('.student-shell')?.querySelector('.student-shell__header');
    let raf = 0;
    const paint = () => {
      raf = 0;
      if (!animated || !root.current || !stage.current) return;
      const progress = readProgress(element, stage.current);
      if (progress > 0) setEngaged(true);
      const style = root.current.style;
      style.setProperty('--hero-open', ease(clamp01(progress / OPEN_END)).toFixed(4));
      style.setProperty('--hero-push', progress.toFixed(4));
      style.setProperty('--campus-outro', clamp01((progress - FRAME_END) / ((1 - FRAME_END) * 0.85)).toFixed(4));
      root.current.dataset.journey = String(progress > OPEN_END * 0.75 && progress < FRAME_END + (1 - FRAME_END) / 2);
      root.current.dataset.handoff = String(progress > FRAME_END + (1 - FRAME_END) * 0.6);
      style.setProperty('--hero-caption', clamp01((progress - OPEN_END * 0.8) / 0.08).toFixed(4));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const resize = () => {
      if (!root.current || !stage.current) return;
      const headerHeight = header?.getBoundingClientRect().height || 0;
      root.current.style.setProperty('--campus-header', `${headerHeight}px`);
      const stageHeight = stage.current.getBoundingClientRect().height;
      element.style.height = animated ? `${Math.round(stageHeight * 3.2)}px` : '';
      schedule();
    };
    if (!animated) { delete root.current.dataset.journey; delete root.current.dataset.handoff; }
    if (!animated) ['--hero-open', '--hero-push', '--campus-outro', '--hero-caption'].forEach(name => root.current.style.removeProperty(name));
    const observer = new ResizeObserver(resize);
    if (header) observer.observe(header);
    observer.observe(stage.current);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', schedule, { passive: true });
    resize();
    return () => { cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('scroll', schedule); };
  }, [animated]);

  return (
    <div className={`home-hero${animated ? ' home-hero--animated' : ''}`} ref={root}>
      <div className="home-hero__copy-layer student-home__hero">
        <div className="home-container">{children}</div>
      </div>
      <div className="campus-track" ref={track}>
        <div className="campus-sticky" ref={stage}>
          <div className="home-hero__window">
            <div className="home-hero__media">
              <picture>
                <source media="(max-width: 767px)" srcSet="/images/scrollVideo/v001/mobile/frame-001.webp" />
                <img
                  src="/images/scrollVideo/v001/desktop/frame-001.webp"
                  srcSet="/images/scrollVideo/v001/mobile/frame-001.webp 640w, /images/scrollVideo/v001/desktop/frame-001.webp 1280w"
                  sizes="100vw" width={1280} height={720} alt="" fetchpriority="high"
                />
              </picture>
              {animated && engaged && <Suspense fallback={null}><Sequence track={track} stage={stage} onChapter={setChapter} /></Suspense>}
            </div>
          </div>
          {animated && <>
            <div className="campus-caption" aria-live="off">
              <div>
                <span className="campus-eyebrow">{String(chapter + 1).padStart(2, '0')} / 06</span>
                <h3>{chapter === 5 ? <a href="#home-collections" onClick={skipCampusIntro}>{t('cinematic.chapters.5')}</a> : t(`cinematic.chapters.${chapter}`)}</h3>
              </div>
              <p>{t(chapter === 5 ? 'cinematic.finalDisclaimer' : 'cinematic.concept')}</p>
            </div>
            <div className="campus-handoff">
              <strong>{t('cinematic.handoffTitle')}</strong>
              <a href="#home-collections" onClick={skipCampusIntro}>{t('cinematic.chapters.5')}</a>
              <p>{t('cinematic.finalDisclaimer')}</p>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
