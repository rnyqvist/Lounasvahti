export function menuDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => parts.find((item) => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isWeekend(date: string) {
  return [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
}

// A year, when supplied, must match too. Do not turn weekday-only text into a date.
export function dateInText(text: string, today: string): string | undefined {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const match = text.match(/(?:^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?(?:\.|(?=\s|$))/);
  if (!match) return undefined;
  return `${match[3] || today.slice(0, 4)}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}
