import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPersonalGreeting, formatStartupGreeting, getGreetingPeriod, getStartupGreetingPeriod, normalizePreferredName } from '../lib/profile.ts';

test('chooses greeting periods using the user local hour', () => {
  assert.equal(getGreetingPeriod(5), 'morning');
  assert.equal(getGreetingPeriod(11), 'morning');
  assert.equal(getGreetingPeriod(12), 'afternoon');
  assert.equal(getGreetingPeriod(16), 'afternoon');
  assert.equal(getGreetingPeriod(17), 'evening');
  assert.equal(getGreetingPeriod(21), 'evening');
  assert.equal(getGreetingPeriod(22), 'late-night');
  assert.equal(getGreetingPeriod(4), 'late-night');
  assert.throws(() => getGreetingPeriod(24), /between 0 and 23/i);
});

test('normalizes saved names and handles missing names safely', () => {
  assert.equal(normalizePreferredName('  Ayush   Kumar  '), 'Ayush Kumar');
  assert.equal(normalizePreferredName('   '), '');
  assert.equal(normalizePreferredName('n'.repeat(90)).length, 80);
  assert.equal(formatPersonalGreeting('morning', '  Mira  '), 'Good morning, Mira! 👋');
  assert.equal(formatPersonalGreeting('afternoon', ''), 'Good afternoon! 👋');
  assert.equal(formatPersonalGreeting('late-night', 'Sam'), 'Hey Sam, still up? 👋');
});

test('startup greeting follows its specified time ranges and has a no-name fallback', () => {
  assert.equal(getStartupGreetingPeriod(5), 'morning');
  assert.equal(getStartupGreetingPeriod(11), 'morning');
  assert.equal(getStartupGreetingPeriod(12), 'afternoon');
  assert.equal(getStartupGreetingPeriod(16), 'afternoon');
  assert.equal(getStartupGreetingPeriod(17), 'evening');
  assert.equal(getStartupGreetingPeriod(20), 'evening');
  assert.equal(getStartupGreetingPeriod(21), 'late-night');
  assert.equal(getStartupGreetingPeriod(4), 'late-night');
  assert.equal(formatStartupGreeting('morning', 'Mira'), 'Good morning, Mira.');
  assert.equal(formatStartupGreeting('afternoon', 'Mira'), 'Good afternoon, Mira.');
  assert.equal(formatStartupGreeting('evening', 'Mira'), 'Good evening, Mira.');
  assert.equal(formatStartupGreeting('late-night', 'Mira'), 'Welcome back, Mira.');
  assert.equal(formatStartupGreeting('morning', ''), 'Welcome to AURA.');
});
