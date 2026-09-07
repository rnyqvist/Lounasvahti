import { menuDate } from './menu-date.ts';

export const WEATHER_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=62.2426&lon=25.7473';
export type WeatherHour = { hour: number; temperature: number | null; wind: number | null; precipitation: number | null; symbol: string | null };
export type LunchWeather = { date: string; updatedAt: string; fetchedAt: string; hours: WeatherHour[]; summary: string; partial: boolean };
type ForecastPoint = { time?: string; data?: { instant?: { details?: Record<string, unknown> }; next_1_hours?: { summary?: { symbol_code?: string }; details?: Record<string, unknown> } } };
export type Forecast = { properties?: { meta?: { updated_at?: string; units?: Record<string, string> }; timeseries?: ForecastPoint[] } };

const hourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', hourCycle: 'h23' });
export function lunchDate(now = new Date()): string {
  return menuDate(now);
}

export function weatherDescription(symbol: string | null): string {
  if (!symbol) return 'Ennuste puuttuu';
  const code = symbol.replace(/_(day|night|polartwilight)$/, '');
  if (code.includes('thunder')) return 'Ukkosta';
  if (code.includes('sleet')) return 'Räntäsadetta';
  if (code.includes('snow')) return code.includes('showers') ? 'Lumikuuroja' : 'Lumisadetta';
  if (code.includes('rain')) return code.includes('showers') ? 'Sadekuuroja' : code.startsWith('heavy') ? 'Runsasta sadetta' : code.startsWith('light') ? 'Heikkoa sadetta' : 'Vesisadetta';
  return ({ clearsky: 'Selkeää', fair: 'Melko selkeää', partlycloudy: 'Puolipilvistä', cloudy: 'Pilvistä', fog: 'Sumua' } as Record<string, string>)[code] || 'Vaihtelevaa säätä';
}

function numeric(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}
const fiNumber = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1 });

export function parseLunchWeather(payload: Forecast, now = new Date(), fetchedAt = now.toISOString(), date = lunchDate(now)): LunchWeather {
  const meta = payload?.properties?.meta;
  const points = payload?.properties?.timeseries;
  if (!Array.isArray(points) || !meta?.updated_at || !Number.isFinite(Date.parse(meta.updated_at)) ||
      meta.units?.air_temperature !== 'celsius' || meta.units?.wind_speed !== 'm/s' || meta.units?.precipitation_amount !== 'mm') {
    throw new Error('Sääpalvelun vastausta ei voitu lukea.');
  }
  if (now.getTime() - Date.parse(meta.updated_at) > 24 * 3600_000 || Date.parse(meta.updated_at) > now.getTime() + 3600_000) {
    throw new Error('Ajantasaista sääennustetta ei ole saatavilla.');
  }
  const byHour = new Map<number, ForecastPoint>();
  for (const point of points) {
    const time = new Date(point?.time || '');
    if (!Number.isFinite(time.getTime()) || time.getUTCMinutes() !== 0 || menuDate(time) !== date) continue;
    byHour.set(Number(hourFormatter.format(time)), point);
  }
  // Three next_1_hours intervals cover exactly 10:00–13:00, never 13:00–14:00.
  const hours = [10, 11, 12].map((hour): WeatherHour => {
    const point = byHour.get(hour)?.data;
    const instant = point?.instant?.details;
    const period = point?.next_1_hours;
    const symbol = period?.summary?.symbol_code;
    return {
      hour,
      temperature: numeric(instant?.air_temperature, -90, 65),
      wind: numeric(instant?.wind_speed, 0, 150),
      precipitation: numeric(period?.details?.precipitation_amount, 0, 1000),
      symbol: typeof symbol === 'string' && /^[a-z_]+$/.test(symbol) ? symbol : null,
    };
  });
  if (hours.every((hour) => hour.temperature === null && hour.symbol === null)) throw new Error('Lounasajan tuntiennustetta ei ole saatavilla.');
  const partial = hours.some((hour) => hour.temperature === null || hour.wind === null || hour.precipitation === null || hour.symbol === null);
  const temperatures = hours.flatMap((hour) => hour.temperature === null ? [] : [Math.round(hour.temperature)]);
  const low = Math.min(...temperatures), high = Math.max(...temperatures);
  const range = temperatures.length ? `Lämpötila ${low === high ? low : `${low}–${high}`} °C.` : '';
  const rain = hours.every((hour) => hour.precipitation !== null) ? hours.reduce((sum, hour) => sum + hour.precipitation!, 0) : null;
  const description = hours.map((hour) => weatherDescription(hour.symbol));
  const conditions = new Set(description).size === 1 ? `${description[0]}.` : 'Sää vaihtelee lounasaikana.';
  const rainText = rain === null ? 'Sademäärä on osittain tuntematon.' : rain === 0 ? 'Ennusteen mukaan ei sadetta klo 10–13.' : `Sadetta yhteensä noin ${fiNumber.format(rain)} mm klo 10–13.`;
  return { date, updatedAt: meta.updated_at, fetchedAt, hours, partial, summary: `${conditions} ${range} ${rainText}`.trim() };
}
