export type GreetingPeriod = 'morning' | 'afternoon' | 'evening' | 'late-night';
export type StartupGreetingPeriod = 'morning' | 'afternoon' | 'evening' | 'late-night';

export function normalizePreferredName(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function getGreetingPeriod(hour: number): GreetingPeriod {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) throw new Error('Hour must be between 0 and 23.');
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late-night';
}

export function formatPersonalGreeting(period: GreetingPeriod, preferredName: string): string {
  const name = normalizePreferredName(preferredName);
  if (period === 'late-night') return `Hey${name ? ` ${name}` : ''}, still up? 👋`;
  const greeting = period === 'morning' ? 'morning' : period === 'afternoon' ? 'afternoon' : 'evening';
  return `Good ${greeting}${name ? `, ${name}` : ''}! 👋`;
}

export function getStartupGreetingPeriod(hour: number): StartupGreetingPeriod {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) throw new Error('Hour must be between 0 and 23.');
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'late-night';
}

export function formatStartupGreeting(period: StartupGreetingPeriod | null, preferredName: string): string {
  const name = normalizePreferredName(preferredName);
  if (!name) return 'Welcome to AURA.';
  if (period === null) return `Welcome back, ${name}.`;
  if (period === 'morning') return `Good morning, ${name}.`;
  if (period === 'afternoon') return `Good afternoon, ${name}.`;
  if (period === 'evening') return `Good evening, ${name}.`;
  return `Welcome back, ${name}.`;
}
