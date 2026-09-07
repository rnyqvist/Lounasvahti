'use client';

import { useEffect, useState } from 'react';
import { lunchDate, weatherDescription, type LunchWeather as Forecast } from '../lib/lunch-weather.ts';

const updatedFormatter = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const amount = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1 });

export function LunchWeather({ now }: { now: Date }) {
  const targetDate = lunchDate(now);
  const [forecast, setForecast] = useState<Forecast>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const data = forecast?.date === targetDate ? forecast : undefined;

  useEffect(() => {
    let disposed = false;
    let pending: AbortController | undefined;
    let lastAttempt = 0;
    const load = async () => {
      if (pending || disposed) return;
      const controller = new AbortController();
      pending = controller;
      lastAttempt = Date.now();
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/weather', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), cache: 'no-store' });
        const value = await response.json() as Forecast & { error?: string };
        if (!response.ok) throw new Error(value.error);
        if (value.date !== targetDate || !Array.isArray(value.hours) || value.hours.length !== 3 || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('Ennusteen päiväys ei vastaa lounasaikaa.');
        if (!disposed) setForecast(value);
      } catch {
        if (!disposed) setError('Sääennustetta ei saatu päivitettyä.');
      } finally { pending = undefined; if (!disposed) setLoading(false); }
    };
    void load();
    const refreshIfDue = () => { if (document.visibilityState === 'visible' && Date.now() - lastAttempt >= 15 * 60_000) void load(); };
    const timer = window.setInterval(refreshIfDue, 60_000);
    window.addEventListener('focus', refreshIfDue);
    document.addEventListener('visibilitychange', refreshIfDue);
    return () => { disposed = true; pending?.abort(); window.clearInterval(timer); window.removeEventListener('focus', refreshIfDue); document.removeEventListener('visibilitychange', refreshIfDue); };
  }, [targetDate, retry]);

  return (
    <aside className="lunch-weather" aria-labelledby="weather-heading" aria-busy={loading}>
      <div className="weather-heading"><div><p className="weather-kicker">JYVÄSKYLÄ</p><h2 id="weather-heading">Lounassää</h2></div><span className="weather-date">Tänään <time dateTime={targetDate}>{targetDate.split('-').slice(1).reverse().map(Number).join('.')}.</time><strong>klo 10–13</strong></span></div>
      {!data && !error && <p className="weather-message" role="status">Haetaan lounasajan sääennustetta…</p>}
      {error && <div className="weather-message" role="status"><p>{error} {data ? 'Näytetään aiemmin haettu ennuste.' : 'Tuntiennuste ei ole juuri nyt saatavilla.'}</p><button type="button" disabled={loading} onClick={() => setRetry((n) => n + 1)}>Yritä uudelleen</button></div>}
      {data && <>
        <p className="weather-meta">Päivän lounasennuste näkyy keskiyöhön asti.</p>
        <div className="weather-hours">{data.hours.map((hour) => <div className="weather-hour" key={hour.hour}>
          <h3>{hour.hour}–{hour.hour + 1}</h3>
          {hour.symbol ? <img src={`/weather/${hour.symbol}.svg`} alt="" width="64" height="64" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} /> : <span className="weather-unknown" aria-hidden="true">—</span>}
          <p className="weather-condition">{weatherDescription(hour.symbol)}</p>
          <strong className="weather-temperature">{hour.temperature === null ? '—' : `${Math.round(hour.temperature)}°`}</strong>
          <dl><div><dt>Sade</dt><dd>{hour.precipitation === null ? '—' : `${amount.format(hour.precipitation)} mm`}</dd></div><div><dt>Tuuli</dt><dd>{hour.wind === null ? '—' : `${amount.format(hour.wind)} m/s`}</dd></div></dl>
        </div>)}</div>
        <p className="weather-summary">{data.summary}</p>
        {data.partial && <p className="weather-meta">Osa tuntitiedoista puuttuu; ohitettujen tuntien ennuste ei välttämättä ole enää saatavilla.</p>}
        <p className="weather-meta">Ennuste päivitetty {updatedFormatter.format(new Date(data.updatedAt))}. Lämpötila tunnin alussa, sade tunnin aikana.</p>
      </>}
      <p className="weather-source">Ennuste: <a href="https://api.met.no/weatherapi/locationforecast/2.0/documentation" target="_blank" rel="noreferrer">MET Norway</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Tiivistelmä Lounasvahti. <a href="/weather/LICENSE.txt" target="_blank" rel="noreferrer">Sääkuvakkeet</a></p>
    </aside>
  );
}
