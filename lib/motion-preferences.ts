export type MotionIntensity = 'reduced' | 'balanced' | 'rich';

export type MotionPreferences = {
  intensity: MotionIntensity;
  backgroundAnimations: boolean;
  interactiveCards: boolean;
  pageTransitions: boolean;
  reducedMotion: boolean | null;
};

export const DEFAULT_MOTION_PREFERENCES: MotionPreferences = {
  intensity: 'balanced',
  backgroundAnimations: true,
  interactiveCards: true,
  pageTransitions: true,
  reducedMotion: null
};

export function normalizeMotionPreferences(value: unknown): MotionPreferences {
  if (!value || typeof value !== 'object') return DEFAULT_MOTION_PREFERENCES;
  const input = value as Partial<MotionPreferences>;
  return {
    intensity: input.intensity === 'reduced' || input.intensity === 'rich' ? input.intensity : 'balanced',
    backgroundAnimations: input.backgroundAnimations !== false,
    interactiveCards: input.interactiveCards !== false,
    pageTransitions: input.pageTransitions !== false,
    reducedMotion: typeof input.reducedMotion === 'boolean' ? input.reducedMotion : null
  };
}

export function applyMotionPreferences(preferences: MotionPreferences) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.motionIntensity = preferences.intensity;
  document.documentElement.dataset.backgroundMotion = String(preferences.backgroundAnimations);
  document.documentElement.dataset.cardMotion = String(preferences.interactiveCards);
  document.documentElement.dataset.pageMotion = String(preferences.pageTransitions);
  document.documentElement.dataset.reduceMotion = preferences.reducedMotion === null ? 'system' : String(preferences.reducedMotion);
}
