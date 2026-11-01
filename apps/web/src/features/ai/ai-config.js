// Public build-time switch only. No service origin, credentials or internal config.
export const AI_ASSISTANT_ENABLED = import.meta.env?.VITE_AI_ASSISTANT_ENABLED === 'true';
export const AI_PATIENCE_MS = 240000;
