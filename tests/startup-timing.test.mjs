import test from 'node:test';
import assert from 'node:assert/strict';
import { getStartupIntroDelay, STARTUP_FADE_DURATION_MS, STARTUP_INTRO_DURATION_MS } from '../lib/startup-timing.ts';

test('normal startup holds until five seconds from the intro start', () => {
  assert.equal(STARTUP_INTRO_DURATION_MS, 5_000);
  assert.equal(getStartupIntroDelay(0, false), 5_000);
  assert.equal(getStartupIntroDelay(1_000, false), 4_000);
  assert.equal(getStartupIntroDelay(4_999, false), 1);
  assert.equal(getStartupIntroDelay(5_000, false), 0);
  assert.equal(getStartupIntroDelay(7_500, false), 0);
  assert.equal(STARTUP_FADE_DURATION_MS, 360);
});

test('reduced motion skips the intro hold', () => {
  assert.equal(getStartupIntroDelay(0, true), 0);
  assert.equal(getStartupIntroDelay(4_900, true), 0);
});
