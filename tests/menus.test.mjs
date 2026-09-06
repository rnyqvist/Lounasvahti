import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDietText, dietTags, commonDietTags, commonInlineDietTags, parseRestaurant, parseSodexo, parseJuvenes, parseHuili, parseLounaatInfo, parseTourulanRavintola, parseGeneric, splitTourulaDishes } from '../lib/menus.ts';
import { menuDate, dateInText } from '../lib/menu-date.ts';
import { savedRestaurantUrls, DEFAULT_URLS } from '../lib/restaurant-storage.ts';

test('Finnish words are not diet codes, including HTML entities', () => {
  assert.equal(cleanDietText('L&auml;mmin kasvislisäke M, G'), 'Lämmin kasvislisäke');
  assert.deepEqual(dietTags('Lämmin kasvislisäke M, G'), ['M', 'G']);
  assert.equal(cleanDietText('Pizzaa (L)'), 'Pizzaa');
  assert.deepEqual(dietTags('V'), ['V']); // provider-specific meaning is preserved
});

test('missing component diet evidence cannot label the whole meal', () => {
  assert.deepEqual(commonDietTags([{ name: 'Kastike', diets: 'G,L' }, { name: 'Pasta' }]), []);
  assert.deepEqual(commonDietTags([{ diets: 'G,L' }, { diets: 'G,M' }]), ['G']);
  assert.deepEqual(commonInlineDietTags('Basilikapasta L Saatavana G'), []);
  assert.deepEqual(commonInlineDietTags('Kastike G ja pasta'), []);
  assert.deepEqual(commonInlineDietTags('Pasta ja kastike G'), []);
  assert.deepEqual(commonInlineDietTags('Lämmin kasvislisäke M, G'), ['M', 'G']);
});

test('Helsinki dates handle midnight, DST, year rollover and explicit years', () => {
  assert.equal(menuDate(new Date('2026-09-06T21:00:00Z')), '2026-09-07');
  assert.equal(menuDate(new Date('2026-12-31T22:00:00Z')), '2027-01-01');
  assert.equal(menuDate(new Date('2026-10-25T01:30:00Z')), '2026-10-25');
  assert.equal(dateInText('Maanantai 7.9.2025', '2026-09-07'), '2025-09-07');
  assert.equal(dateInText('07/09', '2026-09-07'), '2026-09-07');
});

const lounaat = new URL('https://www.lounaat.info/lounas/scandic-jyvaskyla/jyvaskyla');
const block = (date, dishes) => `<h3 class="day">${date}</h3><ul><li class="menu-item"><p class="dish extra">${dishes}</p></li></ul><div class="item-footer">Lounas kello 10:45-13</div>`;

test('Scandic rejects last week and keeps adjacent days separate', () => {
  const html = block('Maanantaina 31.8.', 'Vanha keitto G') + block('Tiistaina 8.9.', 'Kalakeitto L');
  assert.deepEqual(parseLounaatInfo(lounaat, html, '2026-09-07').dishes, []);
  const current = parseLounaatInfo(lounaat, block('Maanantaina 7.9.', 'Kanakeitto G<br />Kasvispasta L') + html, '2026-09-07');
  assert.deepEqual(current.dishes.map(x => x.name), ['Kanakeitto', 'Kasvispasta']);
});

test('Scandic buffet price cannot come from a dessert surcharge', () => {
  const parsed = parseLounaatInfo(lounaat, block('Torstaina 3.9.', 'Pannukakku L 1,50€<br>Lounasbuffet 13,90€, keitto ja salaattibuffet 11,70€'), '2026-09-03');
  assert.equal(parsed.price, '13,90€');
  assert.equal(parsed.dishes.length, 1);
});

test('Scandic retains priced headings and original diet-link text', () => {
  const html = block('Torstaina 3.9.', 'KASVISLOUNAS 12,50€<br><b>Kasvispasta</b> <a class="diet">L</a>');
  const parsed = parseLounaatInfo(lounaat, html, '2026-09-03');
  assert.equal(parsed.dishes[0].name, 'KASVISLOUNAS: Kasvispasta');
  assert.deepEqual(parsed.dishes[0].tags, ['L']);
});

test('Huili requires a current date and honors weekday-only lunch hours', () => {
  const url = new URL('https://huilipiste.fi/ravintola/huili-tourula-jyvaskyla/');
  const html = '<h1>Huili</h1><p>Lounas Ma-Pe 10:30-15:00</p><time datetime="2026-09-06T18:00:00+03:00">sunnuntai 6.9.</time><span class="lunch-name h6">L&auml;mmin kasvislisäke M, G</span>';
  assert.equal(parseHuili(url, html, '2026-09-06').status, 'closed');
  assert.deepEqual(parseHuili(url, html, '2026-09-06').dishes, []);
  assert.deepEqual(parseHuili(url, html, '2026-09-07').dishes, []);
  assert.equal(parseHuili(url, html.replaceAll('2026-09-06', '2026-09-07'), '2026-09-07').dishes[0].name, 'Lämmin kasvislisäke');
});

test('Sodexo uses exact-date daily JSON, never the weekday-only feed', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(String(url), 'https://www.sodexo.fi/ruokalistat/output/daily_json/1491010/2026-09-07');
    return Response.json({ courses: { 1: { title_fi: 'Kasvispasta', dietcodes: 'L', price: '13,90 €' } } });
  });
  const result = await parseSodexo(new URL('https://www.sodexo.fi/ravintolat/test'), '<a href="/ruokalistat/output/weekly_json/1491010">JSON</a>', '2026-09-07');
  assert.equal(result.menuDate, '2026-09-07');
  assert.equal(result.dishes[0].name, 'Kasvispasta');
});

test('Anna selects exact dates and configured menus, preserving component diets', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([{ kitchenName: 'Anna', menuTypes: [
    { menuTypeId: 1, menus: [{ days: [{ date: 20260907, mealoptions: [{ name: 'Lounas', menuItems: [{ name: 'Kastike', diets: 'G,L' }, { name: 'Pasta' }] }] }, { date: 20260908, mealoptions: [{ menuItems: [{ name: 'Tomorrow' }] }] }] }] },
    { menuTypeId: 2, menus: [{ days: [{ date: 20260907, mealoptions: [{ menuItems: [{ name: 'Other menu' }] }] }] }] },
  ] }]));
  const result = await parseJuvenes(new URL('https://juvenes.fi/anna/'), '<a href="https://fi.jamix.cloud/apps/menu/?anro=1"></a><div menudid="2" menuids="1"></div>', '2026-09-07');
  assert.equal(result.dishes.length, 1);
  assert.deepEqual(result.dishes[0].tags, []);
  assert.match(result.dishes[0].details, /Pasta \(ruokavaliotietoa ei ilmoitettu\)/);
});

test('Tourula preserves cells, quoted newlines, first dish and date boundaries', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(',,07/09,08/09\r\n,,"Broileria ja Uncle Ben riisiä G",Tomorrow\r\n,,"Pizzaa L\nKasviskeitto G",\r\n,,14/09,15/09\r\n,,Next week,\r\n'));
  const result = await parseTourulanRavintola(new URL('https://www.tourulanravintola.fi/buffet-lounas/'), '<iframe src="https://docs.google.com/spreadsheets/d/e/published/pubhtml?gid=0"></iframe>', '2026-09-07');
  assert.deepEqual(result.dishes.map(x => x.name), ['Broileria ja Uncle Ben riisiä G', 'Pizzaa L', 'Kasviskeitto G']);
  assert.deepEqual(result.dishes[0].tags, []);
  assert.equal(result.price, '');
  assert.deepEqual(splitTourulaDishes('Wingsejä Siipiweikkojen kastikkeella'), ['Wingsejä Siipiweikkojen kastikkeella']);
});

test('generic menus require a date, stop at next day and are not capped at six', () => {
  const url = new URL('https://example.com/lounas');
  assert.deepEqual(parseGeneric(url, '<h1>Lounas</h1><h2>Maanantai</h2><p>Kanakeitto G</p><h2>Tiistai</h2><p>Kalakeitto L</p>', '2026-09-07').dishes, []);
  const dishes = Array.from({ length: 8 }, (_, i) => `<p>Kasviskeitto ${i} G</p>`).join('');
  const result = parseGeneric(url, `<h1>Lounas</h1><h2>7.9.</h2>${dishes}<h2>Tiistai 8.9.</h2><p>Kalakeitto L</p>`, '2026-09-07');
  assert.equal(result.dishes.length, 8);
  assert.equal(result.status, 'unverified');
});

test('known providers fail visibly when their feed disappears', async () => {
  await assert.rejects(parseRestaurant(new URL('https://juvenes.fi/anna/'), '<h1>Lounas</h1>', '2026-09-07'), /lähdettä/);
  assert.equal(parseHuili(new URL('https://nothuilipiste.fi/'), '', '2026-09-07'), null);
});

test('empty restaurant preference stays empty, corrupt URLs cannot crash rendering', () => {
  assert.deepEqual(savedRestaurantUrls('[]'), []);
  assert.deepEqual(savedRestaurantUrls(null), DEFAULT_URLS);
  assert.deepEqual(savedRestaurantUrls('["garbage","javascript:alert(1)","https://example.com/#menu","https://example.com/"]'), ['https://example.com/']);
});
