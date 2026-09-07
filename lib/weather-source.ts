import { WEATHER_URL, type Forecast } from './lunch-weather.ts';
import { readText } from './safe-fetch.ts';

// One fixed city, one request in flight per Worker instance. Honor the provider's
// expiry/Last-Modified headers; browser refreshes cannot hammer the upstream API.
export function createWeatherSource(fetcher: typeof fetch = fetch, clock: () => number = Date.now) {
  let cached: { payload: Forecast; expires: number; modified: string | null; fetchedAt: string } | undefined;
  let inFlight: Promise<{ payload: Forecast; fetchedAt: string }> | undefined;
  let retryAfter = 0;
  return async function getForecast() {
    if (cached && cached.expires > clock()) return cached;
    if (inFlight) return inFlight;
    if (clock() < retryAfter) throw new Error('Sääpalvelu ei vastaa. Yritä hetken kuluttua uudelleen.');
    inFlight = (async () => {
      const headers: Record<string, string> = { 'User-Agent': 'Lounasvahti/1.0 https://github.com/rnyqvist', Accept: 'application/json' };
      if (cached?.modified) headers['If-Modified-Since'] = cached.modified;
      const response = await fetcher(WEATHER_URL, { headers, signal: AbortSignal.timeout(10000) });
      const expires = Math.max(clock() + 60_000, Date.parse(response.headers.get('expires') || '') || clock() + 15 * 60_000);
      if (response.status === 304 && cached) {
        cached = { ...cached, expires, fetchedAt: new Date(clock()).toISOString() };
        return cached;
      }
      if (!response.ok) {
        const retry = response.headers.get('retry-after');
        retryAfter = Math.max(clock() + 60_000, retry && /^\d+$/.test(retry) ? clock() + Number(retry) * 1000 : Date.parse(retry || '') || 0);
        await response.body?.cancel();
        throw new Error('Sääpalvelu ei vastaa. Yritä hetken kuluttua uudelleen.');
      }
      const payload = JSON.parse(await readText(response)) as Forecast;
      if (!Array.isArray(payload?.properties?.timeseries)) throw new Error('Sääpalvelun vastausta ei voitu lukea.');
      cached = { payload, expires, modified: response.headers.get('last-modified'), fetchedAt: new Date(clock()).toISOString() };
      return cached;
    })();
    try { return await inFlight; }
    catch (error) { retryAfter = Math.max(retryAfter, clock() + 60_000); throw error; }
    finally { inFlight = undefined; }
  };
}
