import { NextResponse } from 'next/server';
import { createWeatherSource } from '../../../lib/weather-source.ts';
import { dailyWeather } from '../../../lib/weather-archive.ts';
import { env } from 'cloudflare:workers';

const getForecast = createWeatherSource();
export async function GET() {
  try {
    const forecast = await dailyWeather((env as unknown as { DB: D1Database }).DB, getForecast);
    return NextResponse.json(forecast, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Sääennustetta ei saatu päivitettyä. Yritä hetken kuluttua uudelleen.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
