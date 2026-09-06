export const DEFAULT_URLS = [
  'https://www.sodexo.fi/ravintolat/ravintola-optimes-business-garden',
  'https://juvenes.fi/anna/',
  'https://huilipiste.fi/ravintola/huili-tourula-jyvaskyla/',
  'https://www.lounaat.info/lounas/scandic-jyvaskyla/jyvaskyla',
  'https://www.tourulanravintola.fi/buffet-lounas/',
];

export function normalizeRestaurantUrl(value: string) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Virheellinen osoite');
  url.hash = '';
  return url.toString();
}

export function savedRestaurantUrls(value: string | null): string[] {
  if (value === null) return DEFAULT_URLS;
  try {
    const saved: unknown = JSON.parse(value);
    if (!Array.isArray(saved)) return DEFAULT_URLS;
    return [...new Set(saved.flatMap((item) => {
      try { return typeof item === 'string' ? [normalizeRestaurantUrl(item)] : []; }
      catch { return []; }
    }))];
  } catch { return DEFAULT_URLS; }
}
