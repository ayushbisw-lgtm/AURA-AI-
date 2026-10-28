import type { Semester } from './academic-types';

export const DEFAULT_SEMESTER_NAMES = Array.from({ length: 8 }, (_, index) => `Semester ${index + 1}`);
export const DEFAULT_SEMESTER_PREFIX = '__default_semester__:';

export type SemesterOption = { id: string; name: string; semester?: Semester };

export function getSemesterOptions(saved: Semester[]): SemesterOption[] {
  const options: SemesterOption[] = [];
  const seen = new Set<string>();
  for (const semester of saved) {
    const key = semester.name.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    options.push({ id: semester.id, name: semester.name, semester });
  }
  for (const name of DEFAULT_SEMESTER_NAMES) {
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    options.push({ id: `${DEFAULT_SEMESTER_PREFIX}${name}`, name });
  }
  return options;
}

export function createDefaultSemester(name: string, id: string): Semester {
  if (!DEFAULT_SEMESTER_NAMES.includes(name)) throw new Error('Choose a valid default semester.');
  return { id, name, startDate: '', endDate: '', createdAt: new Date().toISOString() };
}
