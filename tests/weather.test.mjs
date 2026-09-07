import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { lunchDate, parseLunchWeather, weatherDescription } from '../lib/lunch-weather.ts';
import { createWeatherSource } from '../lib/weather-source.ts';
import { dailyWeather } from '../lib/weather-archive.ts';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

test('durable daily snapshot survives new requests until midnight, then never leaks into tomorrow', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_fantastic_amphibian.sql', import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { bind(...values) { return {
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async run() { return sqlite.prepare(sql).run(...values); },
  }; } }; } };
  let calls = 0;
  const source = async () => { calls++; return { payload: fixture(), fetchedAt: '2026-09-07T06:00:00Z' }; };
  const morning = await dailyWeather(db, source, new Date('2026-09-07T06:00:00Z'));
  const evening = await dailyWeather(db, source, new Date('2026-09-07T20:59:59Z'));
  assert.deepEqual(evening, morning);
  assert.equal(calls, 1);
  await assert.rejects(dailyWeather(db, source, new Date('2026-09-07T21:00:00Z')));
  sqlite.close();
});

function fixture(date = '2026-09-07', offset = 3) {
  return { properties: {
    meta: { updated_at: `${date}T03:00:00Z`, units: { air_temperature: 'celsius', precipitation_amount: 'mm', wind_speed: 'm/s' } },
    timeseries: [9,10,11,12,13].map(hour => ({ time: `${date}T${String(hour-offset).padStart(2,'0')}:00:00Z`, data: {
      instant: { details: { air_temperature: hour, wind_speed: 2.3 } },
      next_1_hours: { summary: { symbol_code: hour===11 ? 'lightrain' : 'partlycloudy_day' }, details: { precipitation_amount: hour===13 ? 99 : 0.2 } },
    } })),
  } };
}

test('Helsinki lunch date changes only at midnight, including DST and year rollover', () => {
  assert.equal(lunchDate(new Date('2026-09-07T09:59:59Z')), '2026-09-07');
  assert.equal(lunchDate(new Date('2026-09-07T20:59:59Z')), '2026-09-07');
  assert.equal(lunchDate(new Date('2026-09-07T21:00:00Z')), '2026-09-08');
  assert.equal(lunchDate(new Date('2026-12-31T21:59:59Z')), '2026-12-31');
  assert.equal(lunchDate(new Date('2026-12-31T22:00:00Z')), '2027-01-01');
  assert.equal(lunchDate(new Date('2026-10-25T10:59:59Z')), '2026-10-25');
  assert.equal(lunchDate(new Date('2026-10-25T21:59:59Z')), '2026-10-25');
  assert.equal(lunchDate(new Date('2026-10-25T22:00:00Z')), '2026-10-26');
});

test('exact three lunch intervals exclude precipitation after 13:00', () => {
  const result = parseLunchWeather(fixture(), new Date('2026-09-07T06:00:00Z'));
  assert.deepEqual(result.hours.map(h=>h.hour), [10,11,12]);
  assert.deepEqual(result.hours.map(h=>h.temperature), [10,11,12]);
  assert.match(result.summary, /0,6 mm/);
  assert.equal(result.partial, false);
  for (const hour of result.hours) assert.ok(existsSync(new URL(`../public/weather/${hour.symbol}.svg`, import.meta.url)));
});

test('winter forecast uses Finnish time and does not select neighboring dates', () => {
  const payload=fixture('2026-12-15',2);
  payload.properties.timeseries.unshift(...fixture('2026-12-14',2).properties.timeseries);
  assert.deepEqual(parseLunchWeather(payload,new Date('2026-12-15T06:00:00Z')).hours.map(h=>h.temperature),[10,11,12]);
});

test('missing/null data stays unknown; six-hour totals are never used', () => {
  const payload=fixture();
  payload.properties.timeseries[1].data.instant.details.air_temperature=null;
  delete payload.properties.timeseries[1].data.next_1_hours;
  payload.properties.timeseries[1].data.next_6_hours={details:{precipitation_amount:18}};
  const result=parseLunchWeather(payload,new Date('2026-09-07T06:00:00Z'));
  assert.equal(result.hours[0].temperature,null);
  assert.equal(result.hours[0].precipitation,null);
  assert.equal(result.partial,true);
  assert.match(result.summary,/tuntematon/);
  assert.doesNotMatch(result.summary,/ei sadetta/);
});

test('bad units, old forecasts and absent target hours fail visibly', () => {
  const payload=fixture();
  payload.properties.meta.units.wind_speed='km/h';
  assert.throws(()=>parseLunchWeather(payload,new Date('2026-09-07T06:00:00Z')));
  assert.throws(()=>parseLunchWeather(fixture(),new Date('2026-09-09T06:00:00Z')));
  const absent=fixture(); absent.properties.timeseries=[];
  assert.throws(()=>parseLunchWeather(absent,new Date('2026-09-07T10:00:00Z')));
});

test('Finnish descriptions cover rain, snow, sleet, fog and thunder', () => {
  assert.equal(weatherDescription('clearsky_day'),'Selkeää');
  assert.equal(weatherDescription('fog'),'Sumua');
  assert.equal(weatherDescription('snowshowers_day'),'Lumikuuroja');
  assert.equal(weatherDescription('sleet'),'Räntäsadetta');
  assert.equal(weatherDescription('heavyrainandthunder'),'Ukkosta');
  assert.equal(weatherDescription(null),'Ennuste puuttuu');
});

test('source shares requests, honors expiry, and conditionally revalidates', async () => {
  let now=Date.parse('2026-09-07T06:00:00Z'), calls=0;
  const get=createWeatherSource(async (url, options)=>{
    calls++;
    assert.match(url,/lat=62.2426&lon=25.7473/);
    assert.match(options.headers['User-Agent'],/Lounasvahti/);
    if(calls===2){assert.equal(options.headers['If-Modified-Since'],'Mon, 07 Sep 2026 03:00:00 GMT');return new Response(null,{status:304,headers:{Expires:'Mon, 07 Sep 2026 08:00:00 GMT'}});}
    return Response.json(fixture(),{headers:{Expires:'Mon, 07 Sep 2026 07:00:00 GMT','Last-Modified':'Mon, 07 Sep 2026 03:00:00 GMT'}});
  },()=>now);
  const results=await Promise.all([get(),get()]);
  assert.equal(calls,1);
  assert.deepEqual(results[0].payload,results[1].payload);
  now+=30*60_000;await get();assert.equal(calls,1);
  now+=31*60_000;await get();assert.equal(calls,2);
  await get();assert.equal(calls,2);
});

test('upstream failure backs off and never returns stale data as fresh', async () => {
  let now=Date.parse('2026-09-07T06:00:00Z'), calls=0;
  const get=createWeatherSource(async ()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'120'}});},()=>now);
  await assert.rejects(get());await assert.rejects(get());assert.equal(calls,1);
  now+=121_000;await assert.rejects(get());assert.equal(calls,2);
});
