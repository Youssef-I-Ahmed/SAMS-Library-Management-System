import { useEffect, useRef } from 'react';

const frameUrl = (variant, index) => `/images/scrollVideo/v001/${variant}/frame-${String(index + 1).padStart(3, '0')}.webp`;
// Gate 1–10, courtyard 11–20, doorway 21–28, shelves 29–34,
// approach to knowledge/monitor 35–40, conceptual digital interface 41–50.
const chapterFor = index => index < 10 ? 0 : index < 20 ? 1 : index < 28 ? 2 : index < 34 ? 3 : index < 40 ? 4 : 5;
export default function CanvasFrameSequence({ track, stage, onChapter }) {
  const canvas = useRef(null);
  useEffect(() => {
    const element = canvas.current, ctx = element.getContext('2d', { alpha: false });
    if (!ctx || !window.createImageBitmap) return;
    track.current.style.setProperty('--campus-outro', '0');
    const cache = new Map(), pending = new Map(), failed = new Set();
    let disposed = false, inView = false, raf = 0, target = 0, drawn = -1, chapter = -1, revision = 0;
    let variant = innerWidth < 1000 ? 'mobile' : 'desktop';
    const isActive = () => !disposed && inView && !document.hidden;
    function cancelRequests() { for (const job of pending.values()) job.abort(); pending.clear(); }
    function trim() {
      const order = [...cache.keys()].sort((a,b) => Math.abs(a-target)-Math.abs(b-target));
      for (const key of order.slice(8)) { cache.get(key).close(); cache.delete(key); }
      element.dataset.cached = String(cache.size);
    }
    function schedule() { if (isActive() && !raf) raf = requestAnimationFrame(paint); }
    function load(index) {
      const abort = new AbortController(), version = revision; pending.set(index, abort);
      fetch(frameUrl(variant, index), { signal: abort.signal }).then(response => {
        if (!response.ok) throw new Error('Frame unavailable'); return response.blob();
      }).then(blob => createImageBitmap(blob)).then(bitmap => {
        if (disposed || version !== revision || abort.signal.aborted || !inView || document.hidden) { bitmap.close(); return; }
        cache.set(index, bitmap); trim(); schedule();
      }).catch(() => { if (!abort.signal.aborted && version === revision) failed.add(index); }).finally(() => {
        if (pending.get(index) === abort) pending.delete(index);
        if (isActive()) { warm(); schedule(); }
      });
    }
    function warm() {
      if (!isActive()) return;
      const wanted = [target,target+1,target-1,target+2,target-2,target+3].filter(i => i>=0 && i<50);
      for (const [index,job] of pending) if (!wanted.includes(index)) { job.abort(); pending.delete(index); }
      for (const index of wanted) { if (pending.size>=2) break; if (!cache.has(index) && !pending.has(index) && !failed.has(index)) load(index); }
    }
    function paint() {
      raf=0; if (!isActive()) return;
      const rect = track.current.getBoundingClientRect(), offset = parseFloat(getComputedStyle(track.current).getPropertyValue('--campus-header')) || 0;
      const distance = Math.max(1, rect.height-stage.current.getBoundingClientRect().height);
      target = Math.round(Math.max(0,Math.min(1,(offset-rect.top)/distance))*49);
      // The last six steps dissolve the fictional screen into ordinary page HTML.
      track.current.style.setProperty('--campus-outro', String(Math.max(0, Math.min(1, (target - 43) / 6))));
      const nextChapter = chapterFor(target); if (nextChapter!==chapter) { chapter=nextChapter; onChapter(chapter); }
      const next = cache.has(target) ? target : [...cache.keys()].sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0];
      if (next !== undefined && next !== drawn) {
        const image=cache.get(next); ctx.drawImage(image,0,0,element.width,element.height); drawn=next;
        element.dataset.frame=String(next+1); element.dataset.paints=String(Number(element.dataset.paints||0)+1); element.dataset.ready='true';
      }
      trim(); warm();
    }
    function resize() {
      if (disposed) return;
      const nextVariant=innerWidth<1000?'mobile':'desktop';
      if (nextVariant!==variant) { revision++;cancelRequests();for(const image of cache.values())image.close();cache.clear();failed.clear();variant=nextVariant; }
      const rect=element.getBoundingClientRect(), limit=variant==='mobile'?640:1280;
      element.width=Math.max(1,Math.round(Math.min(rect.width*Math.min(devicePixelRatio||1,1.5),limit)));element.height=Math.round(element.width*9/16);
      drawn=-1;schedule();
    }
    function visibility() { if (!isActive()) { cancelAnimationFrame(raf);raf=0;cancelRequests(); } else schedule(); }
    const observer=new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;visibility();});observer.observe(element);
    const sizing=new ResizeObserver(resize);sizing.observe(element);resize();
    window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);
    return ()=>{disposed=true;revision++;cancelAnimationFrame(raf);cancelRequests();observer.disconnect();sizing.disconnect();window.removeEventListener('scroll',schedule);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);for(const image of cache.values())image.close();cache.clear();};
  }, [track, stage, onChapter]);
  return <canvas className="campus-canvas" ref={canvas} aria-hidden="true" />;
}
