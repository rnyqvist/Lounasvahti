import { lunchDate, parseLunchWeather, type Forecast, type LunchWeather } from './lunch-weather.ts';

export async function dailyWeather(db: D1Database, source: () => Promise<{ payload: Forecast; fetchedAt: string }>, now = new Date()): Promise<LunchWeather> {
  const date = lunchDate(now);
  const saved = await db.prepare('SELECT forecast FROM lunch_forecasts WHERE date = ?').bind(date).first<{ forecast: string }>();
  const previous = saved ? JSON.parse(saved.forecast) as LunchWeather : undefined;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', hourCycle: 'h23' }).format(now));
  // Freeze the complete lunch forecast once lunch starts; keep it through midnight.
  if (previous && hour >= 10) return previous;
  try {
    const fresh = await source();
    const today = parseLunchWeather(fresh.payload, now, fresh.fetchedAt);
    const tomorrow = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const snapshots = [today];
    try { snapshots.push(parseLunchWeather(fresh.payload, now, fresh.fetchedAt, tomorrow)); } catch { /* Tomorrow may lack hourly coverage. */ }
    for (const snapshot of snapshots.filter(item => !item.partial)) {
      await db.prepare('INSERT INTO lunch_forecasts (date, forecast, updated_at) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET forecast = excluded.forecast, updated_at = excluded.updated_at WHERE excluded.updated_at > lunch_forecasts.updated_at')
        .bind(snapshot.date, JSON.stringify(snapshot), snapshot.updatedAt).run();
    }
    await db.prepare('DELETE FROM lunch_forecasts WHERE date < ?').bind(date).run();
    return today.partial && previous ? previous : today;
  } catch (error) {
    if (previous) return previous;
    throw error;
  }
}
