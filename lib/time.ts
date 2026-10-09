export const MINUTE = 60_000;
export const DAY = 86_400_000;
export const OFFSET = 7 * 60 * MINUTE;
export function localDay(date: Date) { return new Date(date.getTime() + OFFSET).toISOString().slice(0, 10); }
export function dayStart(day: string) { return new Date(`${day}T00:00:00+07:00`); }
export function localMinute(date: Date) { const d = new Date(date.getTime() + OFFSET); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
export function isBirthday(birthDate: string | null, at: Date) { return !!birthDate && birthDate.slice(5, 10) === localDay(at).slice(5, 10); }
