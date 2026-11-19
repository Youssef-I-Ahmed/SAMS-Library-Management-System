import { Scene, OrthographicCamera, WebGLRenderer, HemisphereLight, DirectionalLight,
  AnimationMixer, LoopRepeat, LoopOnce, SRGBColorSpace, NoToneMapping } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const clipNames = { idle: 'idle', greeting: 'idle', searching: 'searching', thinking: 'thinking',
  success: 'success', 'no-results': 'no_results', error: 'error' };
const loops = new Set(['idle', 'searching', 'thinking']);
const modelUrl = new URL('../../assets/knowledge_spirit_v3_animated_v001.glb', import.meta.url).href;

export function createSpiritViewer(host, onFailure) {
  let renderer, model, mixer, observer, raf = 0, disposed = false, visible = false, current, last = 0;
  const scene = new Scene(), camera = new OrthographicCamera(-1.2, 1.2, 1.5, -1.5, .1, 30);
  camera.position.set(0, 2, 7); camera.lookAt(0, 1.21, .04);
  const hemisphere = new HemisphereLight(0xfff3e3, 0x39465d, 2.2); scene.add(hemisphere);
  for (const [position, color, power] of [[[-3, 5, 5], 0xffeed4, 2.8], [[4, 2, 3], 0xd2e5ff, 1.5], [[-1, 4, -4], 0xffefd8, 2]]) {
    const light = new DirectionalLight(color, power); light.position.set(...position); scene.add(light);
  }
  const actions = new Map();
  function stop() { cancelAnimationFrame(raf); raf = 0; last = 0; }
  function tick(now) {
    raf = 0;
    if (disposed || !visible || document.hidden) { last = 0; return; }
    // 24 fps ceiling. No catch-up after a hidden tab or a long main-thread stall.
    if (!last || now - last >= 1000 / 24) {
      const delta = last ? Math.min((now - last) / 1000, .08) : 0; last = now;
      try { mixer?.update(delta); renderer.render(scene, camera); renderer.domElement.dataset.frame = String(Number(renderer.domElement.dataset.frame || 0) + 1); }
      catch { dispose(); onFailure(); return; }
      if (current?.loop === LoopOnce && !current.isRunning()) { last = 0; return; }
    }
    raf = requestAnimationFrame(tick);
  }
  function start() { if (!disposed && visible && !document.hidden && !raf) raf = requestAnimationFrame(tick); }
  function visibility() { if (document.hidden) stop(); else start(); }
  function contextLost(event) { event.preventDefault(); dispose(); onFailure(); }
  function dispose() {
    if (disposed) return; disposed = true; stop(); observer?.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    renderer?.domElement.removeEventListener('webglcontextlost', contextLost);
    mixer?.stopAllAction(); if (model) mixer?.uncacheRoot(model);
    const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
    model?.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.skeleton) skeletons.add(node.skeleton);
      for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
        materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    for (const texture of textures) { texture.source?.data?.close?.(); texture.dispose(); }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const skeleton of skeletons) skeleton.dispose();
    scene.clear(); renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
  }
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = NoToneMapping;
    renderer.setClearColor(0x000000, 0); renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    host.appendChild(renderer.domElement);
    document.addEventListener('visibilitychange', visibility);
    observer = new ResizeObserver(() => {
      if (disposed) return;
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      const aspect = width / height; camera.left = -1.45 * aspect; camera.right = 1.45 * aspect;
      camera.top = 1.45; camera.bottom = -1.45; camera.updateProjectionMatrix();
      renderer.setSize(width, height, false); start();
    }); observer.observe(host);
    const ready = new GLTFLoader().loadAsync(modelUrl).then((gltf) => {
    model = gltf.scene;
    if (disposed) { disposed = false; dispose(); throw new Error('Disposed during load'); }
    scene.add(model); mixer = new AnimationMixer(model);
    for (const name of Object.values(clipNames)) {
      const clip = gltf.animations.find((candidate) => candidate.name === name);
      if (!clip) throw new Error(`Missing character clip: ${name}`);
      if (!actions.has(name)) {
        const action = mixer.clipAction(clip); action.setLoop(loops.has(name) ? LoopRepeat : LoopOnce, loops.has(name) ? Infinity : 1);
        action.clampWhenFinished = !loops.has(name); actions.set(name, action);
      }
    }
    }).catch((error) => { dispose(); throw error; });
    return { dispose, ready,
      setVisible(value) { visible = value; if (visible) start(); else stop(); },
      setState(state) {
        const next = actions.get(clipNames[state] ?? 'idle'); if (next === current || disposed) return;
        next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        if (current) {
          for (const action of actions.values()) if (action !== next && action.enabled) {
            const weight = action.getEffectiveWeight(); action.stopFading().setEffectiveWeight(weight).fadeOut(.35);
          }
          next.fadeIn(.35);
        }
        current = next; renderer.domElement.dataset.clip = next.getClip().name; start();
      }
    };
  } catch (error) { dispose(); throw error; }
}
