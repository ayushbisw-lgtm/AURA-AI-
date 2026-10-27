export type AttendanceStatus = 'present' | 'absent' | 'cancelled';
export type AttendanceSubject = {
  id: string; name: string; code: string; faculty_name: string | null; semester: string;
  target_percentage: number; weekly_schedule: { day: number; time: string }[];
};
export type AttendanceSession = {
  id: string; subject_id: string; session_date: string; session_number: number;
  status: AttendanceStatus; notes: string | null;
};
export function summarizeAttendance(sessions: AttendanceSession[]) {
  const conducted = sessions.filter(session => session.status !== 'cancelled');
  const present = conducted.filter(session => session.status === 'present').length;
  const absent = conducted.length - present;
  return { total: sessions.length, conducted: conducted.length, present, absent, cancelled: sessions.length - conducted.length,
    percentage: conducted.length ? present / conducted.length * 100 : null };
}
export function planAttendance(present: number, conducted: number, target: number) {
  if (!Number.isFinite(present) || !Number.isFinite(conducted) || !Number.isFinite(target) || target < 0 || target > 100 || present < 0 || conducted < present) throw new Error('Invalid attendance values.');
  if (conducted === 0) return { minimumToReach: target === 0 ? 0 : 1, additionalMisses: target === 0 ? null : 0, reachable: true };
  const current = present / conducted * 100;
  const minimumToReach = current >= target ? 0 : target === 100 ? null : Math.ceil((target * conducted - 100 * present) / (100 - target));
  const additionalMisses = target === 0 ? null : Math.max(0, Math.floor(present * 100 / target - conducted + 1e-9));
  return { minimumToReach, additionalMisses, reachable: minimumToReach !== null };
}
export function validateSubject(input: { name: string; code: string; semester: string; target: number }) {
  if (!input.name.trim() || input.name.trim().length > 100) throw new Error('Enter a subject name of 1 to 100 characters.');
  if (input.code.trim().length > 30) throw new Error('Subject code must be 30 characters or fewer.');
  if (!input.semester.trim() || input.semester.trim().length > 40) throw new Error('Enter a semester of 1 to 40 characters.');
  if (!Number.isFinite(input.target) || input.target < 0 || input.target > 100) throw new Error('Target must be between 0% and 100%.');
}
