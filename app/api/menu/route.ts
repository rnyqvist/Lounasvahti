import { NextRequest, NextResponse } from 'next/server';

type SodexoCourse = { title_fi?: string; category?: string; meal_category?: string | null; dietcodes?: string; properties?: string; price?: string };

function decodeHtml(value: string) {
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/&([a-z]+);/gi, (match, entity) => entities[entity.toLowerCase()] ?? match).replace(/\s+/g, ' ').trim();
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
    const restaurant = await parseSodexo(url, html) || parseGeneric(url, html);
    return NextResponse.json({ restaurant, fetchedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError' ? 'Ravintolan sivu ei vastannut ajoissa.' : error instanceof Error ? error.message : 'Ruokalistan haku epäonnistui.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
