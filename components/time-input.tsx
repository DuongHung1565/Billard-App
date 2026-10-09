'use client';
import { useEffect, useState } from 'react';
const clockText = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;
export function TimeInput({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const [text,setText] = useState(clockText(value));
  useEffect(() => { if (Number.isFinite(value)) setText(clockText(value)); },[value]);
  return <input type="text" inputMode="numeric" placeholder="18:00" maxLength={5} aria-invalid={!Number.isFinite(value)} value={text} onChange={e => {
    const draft = e.target.value; setText(draft);
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(draft)) { onChange(NaN); return; }
    const [hours,minutes] = draft.split(':').map(Number); onChange(hours * 60 + minutes);
  }} />;
}
