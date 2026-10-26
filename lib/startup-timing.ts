export const STARTUP_INTRO_DURATION_MS = 5_000;
export const STARTUP_FADE_DURATION_MS = 360;

export function getStartupIntroDelay(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  if (!Number.isFinite(elapsedMs)) return STARTUP_INTRO_DURATION_MS;
  return Math.max(0, STARTUP_INTRO_DURATION_MS - Math.max(0, elapsedMs));
}
