import { NextRequest, NextResponse } from 'next/server';

type SodexoCourse = { title_fi?: string; category?: string; meal_category?: string | null; dietcodes?: string; properties?: string; price?: string };
type JamixItem = { name?: string; diets?: string };
type JamixMealOption = { name?: string; menuItems?: JamixItem[] };
type JamixDay = { date?: number; mealoptions?: JamixMealOption[] };
type JamixMenuType = { menuTypeId?: number; menus?: Array<{ days?: JamixDay[] }> };

function decodeHtml(value: string) {
  const entities: Record<string, string> = {
    amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', euro: '€',
    auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', aring: 'å', Aring: 'Å',
  };
  return value.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/&([a-z]+);/gi, (match, entity) => entities[entity] ?? entities[entity.toLowerCase()] ?? match).replace(/\s+/g, ' ').trim();
}

function textFromHtml(value: string) { return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')); }

function validatePublicUrl(raw: unknown) {
  if (typeof raw !== 'string' || raw.length > 2048) throw new Error('Verkko-osoite ei kelpaa.');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Osoitteen täytyy alkaa http:// tai https://.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) throw new Error('Paikallisia verkko-osoitteita ei voi lisätä.');
  return url;
}

async function safeFetch(url: URL | string) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Lounasvahti/1.0 (+lunch menu reader)', Accept: 'text/html,application/json' } });
  if (!response.ok) throw new Error(`Ravintolan sivu vastasi virheellä ${response.status}.`);
  return response;
}

function finnishCategory(category = '', title = '') {
  const lower = category.toLowerCase();
  if (lower.includes('dessert')) return 'Jälkiruoka';
  if (lower.includes('soup')) return 'Keitto';
  if (lower.includes('vege') || lower.includes('green') || /kasvis|mifu|kikherne|falafel|papu|tofu/i.test(title)) return 'Kasvis';
  return 'Pääruoka';
}

function cleanDietText(value: string) {
  return decodeHtml(value)
    .replace(/\b(?:VEG|VL|G|L|M|V)\b/gi, '')
    .replace(/\s+,/g, ',')
    .replace(/,{2,}/g, ',')
    .replace(/,\s*(?=ja\b|$)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-–•\s]+/, '')
    .trim();
}

function dietTags(value: string) {
  return [...new Set((value.match(/\b(?:VEG|VL|G|L|M|V)\b/gi) || []).map((tag) => tag.toUpperCase() === 'V' ? 'VEG' : tag.toUpperCase()))];
}

function commonDietTags(items: JamixItem[]) {
  const tagged = items.map((item) => dietTags(item.diets || '')).filter((tags) => tags.length);
  if (!tagged.length) return [];
  return tagged[0].filter((tag) => tagged.every((tags) => tags.includes(tag)));
}

function commonInlineDietTags(value: string) {
  const groups = (value.match(/\b(?:VEG|VL|G|L|M|V)(?:(?:\s*,\s*|\s+)(?:VEG|VL|G|L|M|V))*\b/gi) || []).map(dietTags);
  if (!groups.length) return [];
  return groups[0].filter((tag) => groups.every((tags) => tags.includes(tag)));
}

function mealType(name = '', dish = '') {
  const value = `${name} ${dish}`;
  if (/jälkiruoka|dessert|mousse|rahka|kiisseli|pannukakku/i.test(value)) return 'Jälkiruoka';
  if (/keitto|soup/i.test(value)) return 'Keitto';
  if (/kasvis|vege|tofu|papu|mifu|porkkanapihvi/i.test(value)) return 'Kasvis';
  return 'Pääruoka';
}

async function parseSodexo(pageUrl: URL, html: string) {
  const id = html.match(/\/ruokalistat\/output\/(?:weekly_json|daily_json)\/(\d+)/i)?.[1];
  if (!id) return null;
  const weeklyUrl = new URL(`/ruokalistat/output/weekly_json/${id}`, pageUrl.origin);
  const weekly = await (await safeFetch(weeklyUrl)).json() as { meta?: { ref_title?: string }; mealdates?: Array<{ date?: string; courses?: Record<string, SodexoCourse> }> };
  const helsinkiDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Helsinki', weekday: 'long' }).format(new Date());
  const dayNames: Record<string, string> = { Monday: 'maanantai', Tuesday: 'tiistai', Wednesday: 'keskiviikko', Thursday: 'torstai', Friday: 'perjantai', Saturday: 'lauantai', Sunday: 'sunnuntai' };
  const today = weekly.mealdates?.find((day) => day.date?.toLowerCase() === dayNames[helsinkiDay]);
  const courses = Object.values(today?.courses || {});
  const h1 = textFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || weekly.meta?.ref_title || 'Sodexo-ravintola');
  const addressBlock = textFromHtml(html.match(/<address[^>]*>([\s\S]*?)<\/address>/i)?.[1] || '');
  const pageText = textFromHtml(html);
  const street = textFromHtml(html.match(/field--name-field-street-address[^>]*>([^<]+)/i)?.[1] || '');
  const postal = textFromHtml(html.match(/field--name-field-postal-code[^>]*>([^<]+)/i)?.[1] || '');
  const mapQuery = html.match(/google\.com\/maps\/search\/\?api=1&amp;query=([^\s"'>]+)/i)?.[1];
  const mappedAddress = mapQuery ? decodeURIComponent(mapQuery.replace(/&amp;.*$/, '').replace(/\+/g, ' ')).replace(',', postal ? `, ${postal}` : ',') : '';
  const lunchMatch = pageText.match(/Lounas\s+(\d{1,2}[.:]\d{2})\s*[-–]\s*(\d{1,2}[.:]\d{2})/i);
  const buffetPrice = pageText.match(/Lounasbuffet\s*\|?\s*Hinta\s*([0-9]+[,.][0-9]{2}\s*€)/i)?.[1];
  const dishes = courses.map((course) => ({ name: decodeHtml(course.title_fi || ''), type: finnishCategory(course.category || course.meal_category || '', course.title_fi), tags: (course.dietcodes || course.properties || '').split(',').map((tag) => tag.trim()).filter((tag) => ['G', 'L', 'M', 'VL', 'VEG'].includes(tag)) })).filter((dish) => dish.name);
  return { name: h1.replace(/^Ravintola\s+/i, ''), address: addressBlock || mappedAddress || (street ? `${street}${postal ? `, ${postal}` : ''}` : pageUrl.hostname), provider: 'SODEXO', hours: lunchMatch ? `${lunchMatch[1]}–${lunchMatch[2]}` : 'Tarkista ravintolasta', price: courses.find((course) => course.price)?.price || buffetPrice || '', dishes, sourceUrl: pageUrl.toString() };
}

async function parseJuvenes(pageUrl: URL, html: string) {
  if (!pageUrl.hostname.endsWith('juvenes.fi')) return null;
  const account = html.match(/fi\.jamix\.cloud\/apps\/menu\/\?anro=(\d+)/i)?.[1];
  const kitchen = html.match(/\bmenudid=["'](\d+)["']/i)?.[1];
  if (!account || !kitchen) return null;
  const configuredTypes = (html.match(/\bmenuids=["']([\d, ]+)["']/i)?.[1] || '').split(',').map(Number).filter(Boolean);
  const endpoint = `https://fi.jamix.cloud/apps/menuservice/rest/haku/menu/${account}/${kitchen}?lang=fi`;
  const payload = await (await safeFetch(endpoint)).json() as Array<{ kitchenName?: string; menuTypes?: JamixMenuType[] }>;
  const todayNumber = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, ''));
  const menuTypes = payload[0]?.menuTypes || [];
  const selectedTypes = menuTypes.filter((type) => !configuredTypes.length || configuredTypes.includes(type.menuTypeId || -1));
  const dishes = selectedTypes.flatMap((type) => (type.menus || []).flatMap((menu) => {
    const today = (menu.days || []).find((day) => day.date === todayNumber);
    return (today?.mealoptions || []).filter((option) => !/^info/i.test(option.name || '')).map((option) => {
      const items = option.menuItems || [];
      const name = items.map((item) => item.name?.trim()).filter(Boolean).join(', ');
      const tags = commonDietTags(items);
      return { name, type: mealType(option.name, name), tags };
    }).filter((dish) => dish.name);
  }));
  const pageText = textFromHtml(html);
  const address = pageText.match(/Kympinkatu\s+3\s+C,?\s+40320\s+Jyväskylä/i)?.[0] || 'Kympinkatu 3 C, 40320 Jyväskylä';
  const hours = pageText.match(/Lounas\s*buffet\s*(\d{1,2}[.:]\d{2})\s*[-–]\s*(\d{1,2}[.:]\d{2})/i);
  const price = pageText.match(/Lounasbuffet\s*([0-9]+[,.][0-9]{2}\s*€)/i)?.[1] || '';
  const name = textFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') || payload[0]?.kitchenName || 'Restaurant Anna';
  return { name, address, provider: 'JUVENES', hours: hours ? `${hours[1]}–${hours[2]}` : '10.30–13.00', price, dishes, sourceUrl: pageUrl.toString() };
}

function parseHuili(pageUrl: URL, html: string) {
  if (!pageUrl.hostname.endsWith('huilipiste.fi')) return null;
  const itemMatches = [...html.matchAll(/<span[^>]*class=["'][^"']*lunch-name[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)];
  const dishes = itemMatches.map((match) => {
    const raw = textFromHtml(match[1]);
    const name = cleanDietText(raw);
    return { name, type: mealType('', name), tags: commonInlineDietTags(raw) };
  }).filter((dish) => dish.name);
  const pageText = textFromHtml(html);
  const h1 = textFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || 'Huili Tourula Jyväskylä');
  const address = pageText.match(/Tourulantie\s+2,?\s+40100,?\s+Jyväskylä/i)?.[0] || 'Tourulantie 2, 40100 Jyväskylä';
  const hours = pageText.match(/Lounas\s+Ma\s*-?\s*Pe\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/i);
  const price = textFromHtml(html.match(/class=["'][^"']*lunch-price[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
  return { name: h1, address, provider: 'HUILI', hours: hours ? `${hours[1]}–${hours[2]}` : '10:30–15:00', price, dishes, sourceUrl: pageUrl.toString() };
}

function parseLounaatInfo(pageUrl: URL, html: string) {
  if (!pageUrl.hostname.endsWith('lounaat.info')) return null;
  const helsinki = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }));
  const weekdayNames = ['Sunnuntaina', 'Maanantaina', 'Tiistaina', 'Keskiviikkona', 'Torstaina', 'Perjantaina', 'Lauantaina'];
  const weekday = weekdayNames[helsinki.getDay()];
  const label = `${weekday} ${helsinki.getDate()}.${helsinki.getMonth() + 1}.`;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactBlock = html.match(new RegExp(`<h3>${escaped}<\\/h3>([\\s\\S]*?)<div class=["']item-footer["']>`, 'i'))?.[1];
  const weekdayBlock = html.match(new RegExp(`<h3>${weekday}\\s+\\d{1,2}\\.\\d{1,2}\\.<\\/h3>([\\s\\S]*?)<div class=["']item-footer["']>`, 'i'))?.[1];
  const block = exactBlock || weekdayBlock || '';
  const rows = [...block.matchAll(/<li[^>]*class=["'][^"']*menu-item[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)].flatMap((listItem) => {
    const originalPieces = [...listItem[1].matchAll(/<p[^>]*class=["'](?:dish|info)["'][^>]*>([\s\S]*?)<\/p>/gi)].flatMap((match) => match[1].split(/<br\s*\/?>/i));
    return originalPieces.map((original) => {
      const withoutDietLinks = original.replace(/<a[^>]*class=["'][^"']*diet[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '');
      return { name: cleanDietText(textFromHtml(withoutDietLinks)), original: textFromHtml(original) };
    });
  });
  let pendingHeading = '';
  const dishes = rows.flatMap((row) => {
    if (!row.name || /lounaan hintaan kuuluu|pysäköinti|salaattipöytä.*kahvi|lounasbuffet|keitto ja salaattibuffet/i.test(row.name)) return [];
    const letters = row.name.replace(/[^A-Za-zÅÄÖåäö]/g, '');
    const isPricedHeading = /\d+[,.]\d{2}\s*€:?$/i.test(row.name) && letters.length > 3 && letters === letters.toUpperCase();
    if (isPricedHeading) {
      pendingHeading = row.name.replace(/\s*\d+[,.]\d{2}\s*€:?$/i, '').trim();
      return [];
    }
    const heading = pendingHeading;
    pendingHeading = '';
    const name = heading ? `${heading}: ${row.name}` : row.name;
    return [{ name, type: mealType(heading, row.name), tags: commonInlineDietTags(row.original) }];
  });
  const pageText = textFromHtml(html);
  const name = textFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || 'Scandic Jyväskylä Station').replace(/^Lounas\s+/i, '').replace(/,\s*Jyväskylä$/i, '');
  const description = decodeHtml(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '');
  const addressPattern = /[A-ZÅÄÖ][\p{L}-]*?(?:katu|tie|kuja|polku|väylä|rinne)\s+\d+[A-Za-z]?(?:\s*[-–]\s*\d+)?(?:,?\s+\d{5})?,?\s+Jyväskylä/iu;
  const address = description.match(addressPattern)?.[0] || pageText.match(addressPattern)?.[0] || pageUrl.hostname;
  const hours = pageText.match(/ma\s*-\s*pe:\s*(\d{1,2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}(?::\d{2})?)/i);
  const price = block.match(/(?:Lounasbuffet\s*)?([0-9]+[,.][0-9]{2}\s*€)/i)?.[1] || '';
  const opensAt = hours?.[1] && !hours[1].includes(':') ? `${hours[1]}:00` : hours?.[1];
  const closesAt = hours?.[2] && !hours[2].includes(':') ? `${hours[2]}:00` : hours?.[2];
  return { name, address, provider: 'LOUNAAT.INFO', hours: hours ? `${opensAt}–${closesAt}` : 'Tarkista ravintolasta', price, dishes, sourceUrl: pageUrl.toString() };
}

function parseGeneric(pageUrl: URL, html: string) {
  const name = textFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || pageUrl.hostname);
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const lines = body.replace(/<(br|\/p|\/li|\/div|\/h[1-6]|\/tr)>/gi, '\n').replace(/<[^>]+>/g, ' ').split('\n').map(decodeHtml).filter(Boolean);
  const lunchIndex = lines.findIndex((line) => /\b(lounas|lunch|ruokalista)\b/i.test(line));
  const selection = lines.slice(Math.max(0, lunchIndex), lunchIndex < 0 ? 40 : lunchIndex + 45);
  const excluded = /^(lounas|lunch|ruokalista|menu|etusivu|ravintola|yhteystiedot|aukioloajat|allergeenit|tänään)$/i;
  const candidates = selection.filter((line) => line.length >= 8 && line.length <= 160 && !excluded.test(line) && !/eväste|cookie|tietosuoja|copyright|©|facebook|instagram/i.test(line));
  const likelyFood = candidates.filter((line) => /€|\b(G|L|M|VL|VEG)\b|keitto|kastike|salaatti|broileri|kala|liha|kasvis|pasta|riisi|peruna|jälkiruoka/i.test(line));
  const dishes = [...new Set((likelyFood.length ? likelyFood : candidates).slice(0, 6))].map((line) => ({ name: line.replace(/\s+\d+[,.]\d{2}\s*€.*$/, '').trim(), type: 'Päivän annos', tags: (line.match(/\b(G|L|M|VL|VEG)\b/g) || []) })).filter((dish) => dish.name.length > 5);
  const hours = textFromHtml(html).match(/(?:lounas|lunch)[^\d]{0,20}(\d{1,2}[.:]\d{2})\s*[-–]\s*(\d{1,2}[.:]\d{2})/i);
  const price = selection.join(' ').match(/(\d+[,.]\d{2}\s*€)/)?.[1] || '';
  return { name, address: pageUrl.hostname, provider: pageUrl.hostname.replace(/^www\./, '').toUpperCase(), hours: hours ? `${hours[1]}–${hours[2]}` : 'Tarkista ravintolasta', price, dishes, sourceUrl: pageUrl.toString() };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = validatePublicUrl(body.url);
    const response = await safeFetch(url);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) throw new Error('Osoite ei johda luettavaan verkkosivuun.');
    const html = await response.text();
    if (html.length > 3_000_000) throw new Error('Sivu on liian suuri analysoitavaksi.');
    const restaurant = await parseSodexo(url, html) || await parseJuvenes(url, html) || parseHuili(url, html) || parseLounaatInfo(url, html) || parseGeneric(url, html);
    return NextResponse.json({ restaurant, fetchedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError' ? 'Ravintolan sivu ei vastannut ajoissa.' : error instanceof Error ? error.message : 'Ruokalistan haku epäonnistui.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
