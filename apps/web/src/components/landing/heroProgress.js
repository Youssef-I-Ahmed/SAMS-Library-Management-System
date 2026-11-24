// Shared scroll math for the home hero so the CSS reveal and the canvas frames
// always agree on where the visitor is in the journey.
export const FRAME_COUNT = 50;
// The arch opens over [0, OPEN_END]; frames play over [FRAME_START, FRAME_END];
// the stage dissolves into the page over [FRAME_END, 1].
export const OPEN_END = 0.3;
export const FRAME_START = 0.16;
export const FRAME_END = 0.9;

export const clamp01 = value => Math.max(0, Math.min(1, value));

export function readProgress(track, stage) {
  const rect = track.getBoundingClientRect();
  const offset = parseFloat(getComputedStyle(track).getPropertyValue('--campus-header')) || 0;
  const distance = Math.max(1, rect.height - stage.getBoundingClientRect().height);
  return clamp01((offset - rect.top) / distance);
}

export const frameFor = progress => Math.round(clamp01((progress - FRAME_START) / (FRAME_END - FRAME_START)) * (FRAME_COUNT - 1));
