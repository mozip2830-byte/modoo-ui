import { Timestamp } from 'firebase/firestore';

export function formatTimestamp(value?: Timestamp | null): string {
  if (!value) return '';
  const date = value instanceof Timestamp ? value.toDate() : new Date(value as unknown as string);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
