import { safeFetch, readText } from './safe-fetch.ts';
import { menuDate, dateInText, isWeekend } from './menu-date.ts';

export type Dish = { name: string; type: string; tags: string[]; details?: string };
export type Restaurant = { name: string; address: string; provider: string; hours: string; price: string; dishes: Dish[]; sourceUrl: string; menuDate?: string; status: 'available' | 'unavailable' | 'closed' | 'unverified'; notice?: string };
const hostMatches = (url: URL, domain: string) => url.hostname === domain || url.hostname.endsWith(`.${domain}`);
const dietPattern = /(?<![\p{L}\p{N}_])(?:VEG|VL|G|L|M|V)(?![\p{L}\p{N}_])/giu;

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

function finnishCategory(category = '', title = '') {
  const lower = category.toLowerCase();
  if (lower.includes('dessert')) return 'Jälkiruoka';
  if (lower.includes('soup')) return 'Keitto';
  if (lower.includes('vege') || lower.includes('green') || /kasvis|mifu|kikherne|falafel|papu|tofu/i.test(title)) return 'Kasvis';
  return 'Pääruoka';
}

export function cleanDietText(value: string) {
  return decodeHtml(value)
    .replace(dietPattern, '')
    .replace(/\(\s*[,/\s]*\)/g, '')
    .replace(/\s+,/g, ',')
    .replace(/,{2,}/g, ',')
    .replace(/,\s*(?=ja\b|$)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-–•\s]+/, '')
    .trim();
}

export function dietTags(value: string) {
  return [...new Set((decodeHtml(value).match(dietPattern) || []).map((tag) => tag.toUpperCase()))];
}

export function commonDietTags(items: JamixItem[]) {
  const tagged = items.map((item) => dietTags(item.diets || ''));
  if (!tagged.length) return [];
  return tagged[0].filter((tag) => tagged.every((tags) => tags.includes(tag)));
}

export function commonInlineDietTags(value: string) {
  const decoded = decodeHtml(value);
  if (/saatavana|pyydettäessä|vaihtoehto|mahdollisuus/i.test(decoded)) return [];
  if (/\bja\b|,/.test(cleanDietText(decoded))) return [];
  const groups = (decoded.match(/(?<![\p{L}\p{N}_])(?:VEG|VL|G|L|M|V)(?![\p{L}\p{N}_])(?:(?:\s*,\s*|\s+)(?:VEG|VL|G|L|M|V)(?![\p{L}\p{N}_]))*/giu) || []).map(dietTags);
  if (!groups.length) return [];
  // An unlabelled side after the final diet group makes whole-meal tags uncertain.
  const tail = decoded.replace(/.*(?<![\p{L}\p{N}_])(?:VEG|VL|G|L|M|V)(?![\p{L}\p{N}_])/iu, '');
  if (/[\p{L}]/u.test(tail)) return [];
  return groups[0].filter((tag) => groups.every((tags) => tags.includes(tag)));
}

function mealType(name = '', dish = '') {
  const value = `${name} ${dish}`;
  if (/jälkiruoka|dessert|mousse|rahka|kiisseli|pannukakku/i.test(value)) return 'Jälkiruoka';
  if (/keitto|soup/i.test(value)) return 'Keitto';
  if (/kasvis|vege|tofu|papu|mifu|porkkanapihvi/i.test(value)) return 'Kasvis';
  return 'Pääruoka';
}

export async function parseSodexo(pageUrl: URL, html: string, date = menuDate()) {
  if (!hostMatches(pageUrl, 'sodexo.fi')) return null;
  const id = html.match(/\/ruokalistat\/output\/(?:weekly_json|daily_json)\/(\d+)/i)?.[1];
  if (!id) throw new Error('Sodexon ruokalistan lähdettä ei tunnistettu.');
  // The weekly feed only names weekdays. Use the explicitly dated daily feed.
  const dailyUrl = new URL(`/ruokalistat/output/daily_json/${id}/${date}`, pageUrl.origin);
  const daily = JSON.parse(await readText(await safeFetch(dailyUrl))) as { meta?: { ref_title?: string }; courses?: Record<string, SodexoCourse> };
  if (!daily || !daily.courses || typeof daily.courses !== 'object') throw new Error('Sodexon ruokalistan muoto on muuttunut.');
  const courses = Object.values(daily.courses);
  const h1 = textFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || daily.meta?.ref_title || 'Sodexo-ravintola');
  const addressBlock = textFromHtml(html.match(/<address[^>]*>([\s\S]*?)<\/address>/i)?.[1] || '');
  const pageText = textFromHtml(html);
  const street = textFromHtml(html.match(/field--name-field-street-address[^>]*>([^<]+)/i)?.[1] || '');
  const postal = textFromHtml(html.match(/field--name-field-postal-code[^>]*>([^<]+)/i)?.[1] || '');
  const mapQuery = html.match(/google\.com\/maps\/search\/\?api=1&amp;query=([^\s"'>]+)/i)?.[1];
  const mappedAddress = mapQuery ? decodeURIComponent(mapQuery.replace(/&amp;.*$/, '').replace(/\+/g, ' ')).replace(',', postal ? `, ${postal}` : ',') : '';
  const lunchMatch = pageText.match(/Lounas\s+(\d{1,2}[.:]\d{2})\s*[-–]\s*(\d{1,2}[.:]\d{2})/i);
  const buffetPrice = pageText.match(/Lounasbuffet\s*\|?\s*Hinta\s*([0-9]+[,.][0-9]{2}\s*€)/i)?.[1];
  const dishes = courses.map((course) => ({ name: decodeHtml(course.title_fi || ''), type: finnishCategory(course.category || course.meal_category || '', course.title_fi), tags: (course.dietcodes || course.properties || '').split(',').map((tag) => tag.trim()).filter((tag) => ['G', 'L', 'M', 'VL', 'VEG'].includes(tag)) })).filter((dish) => dish.name);
  return { name: h1.replace(/^Ravintola\s+/i, ''), address: addressBlock || mappedAddress || (street ? `${street}${postal ? `, ${postal}` : ''}` : pageUrl.hostname), provider: 'SODEXO', hours: lunchMatch ? `${lunchMatch[1]}–${lunchMatch[2]}` : 'Tarkista ravintolasta', price: buffetPrice || courses.find((course) => course.price)?.price || '', dishes, menuDate: date, sourceUrl: pageUrl.toString() };
}

export async function parseJuvenes(pageUrl: URL, html: string, date = menuDate()) {
  if (!hostMatches(pageUrl, 'juvenes.fi')) return null;
  const account = html.match(/fi\.jamix\.cloud\/apps\/menu\/\?anro=(\d+)/i)?.[1];
  const kitchen = html.match(/\bmenudid=["'](\d+)["']/i)?.[1];
  if (!account || !kitchen) throw new Error('Juvenes-ruokalistan lähdettä ei tunnistettu.');
  const configuredTypes = (html.match(/\bmenuids=["']([\d, ]+)["']/i)?.[1] || '').split(',').map(Number).filter(Boolean);
  const endpoint = `https://fi.jamix.cloud/apps/menuservice/rest/haku/menu/${account}/${kitchen}?lang=fi`;
  const payload = JSON.parse(await readText(await safeFetch(endpoint))) as Array<{ kitchenName?: string; menuTypes?: JamixMenuType[] }>;
  if (!Array.isArray(payload) || !Array.isArray(payload[0]?.menuTypes)) throw new Error('Juvenes-ruokalistan muoto on muuttunut.');
  const todayNumber = Number(date.replace(/-/g, ''));
  const menuTypes = payload[0]?.menuTypes || [];
  const selectedTypes = menuTypes.filter((type) => !configuredTypes.length || configuredTypes.includes(type.menuTypeId || -1));
  if (configuredTypes.length && !selectedTypes.length) throw new Error('Juvenes-ruokalistan valittuja listoja ei löytynyt.');
  const hasDate = selectedTypes.some((type) => type.menus?.some((menu) => menu.days?.some((day) => day.date === todayNumber)));
  const dishes = selectedTypes.flatMap((type) => (type.menus || []).flatMap((menu) => {
    const today = (menu.days || []).find((day) => day.date === todayNumber);
    return (today?.mealoptions || []).filter((option) => !/^info/i.test(option.name || '')).map((option) => {
      const items = option.menuItems || [];
      const name = items.map((item) => item.name?.trim()).filter(Boolean).join(', ');
      const tags = commonDietTags(items);
      const details = items.map((item) => `${item.name || ''}${item.diets ? ` (${item.diets})` : ' (ruokavaliotietoa ei ilmoitettu)'}`).join('; ');
      return { name, type: mealType(option.name, name), tags, details };
    }).filter((dish) => dish.name);
  }));
  const pageText = textFromHtml(html);
  const address = pageText.match(/Kympinkatu\s+3\s+C,?\s+40320\s+Jyväskylä/i)?.[0] || 'Kympinkatu 3 C, 40320 Jyväskylä';
  const hours = pageText.match(/Lounas\s*buffet\s*(\d{1,2}[.:]\d{2})\s*[-–]\s*(\d{1,2}[.:]\d{2})/i);
  const price = pageText.match(/Lounasbuffet\s*([0-9]+[,.][0-9]{2}\s*€)/i)?.[1] || '';
  const name = textFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') || payload[0]?.kitchenName || 'Restaurant Anna';
  return { name, address, provider: 'JUVENES', hours: hours ? `${hours[1]}–${hours[2]}` : 'Tarkista ravintolasta', price, dishes, menuDate: hasDate ? date : undefined, sourceUrl: pageUrl.toString() };
}

export function parseHuili(pageUrl: URL, html: string, date = menuDate()) {
  if (!hostMatches(pageUrl, 'huilipiste.fi')) return null;
  const sourceDate = html.match(/<time\b[^>]*datetime=["'](\d{4}-\d{2}-\d{2})/i)?.[1];
  const pageText = textFromHtml(html);
  const closed = isWeekend(date) && /Lounas\s+Ma\s*[-–]\s*Pe\s+\d/i.test(pageText);
  const itemMatches = [...html.matchAll(/<span[^>]*class=["'][^"']*lunch-name[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)];
  const dishes = sourceDate !== date || closed ? [] : itemMatches.map((match) => {
    const raw = textFromHtml(match[1]);
    const name = cleanDietText(raw);
    return { name, type: mealType('', name), tags: commonInlineDietTags(raw), details: raw };
  }).filter((dish) => dish.name);
  const h1 = textFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || 'Huili Tourula Jyväskylä');
  const address = pageText.match(/Tourulantie\s+2,?\s+40100,?\s+Jyväskylä/i)?.[0] || 'Tourulantie 2, 40100 Jyväskylä';
  const hours = pageText.match(/Lounas\s+Ma\s*-?\s*Pe\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/i);
  const price = textFromHtml(html.match(/class=["'][^"']*lunch-price[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
  return { name: h1, address, provider: 'HUILI', hours: hours ? `${hours[1]}–${hours[2]}` : 'Tarkista ravintolasta', price, dishes, menuDate: sourceDate, status: closed ? 'closed' as const : sourceDate !== date ? 'unverified' as const : undefined, sourceUrl: pageUrl.toString() };
}

export function parseLounaatInfo(pageUrl: URL, html: string, date = menuDate()) {
  if (!hostMatches(pageUrl, 'lounaat.info')) return null;
  const headers = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
  const current = headers.findIndex((heading) => dateInText(textFromHtml(heading[1]), date) === date);
  const heading = headers[current];
  const section = heading ? html.slice(heading.index! + heading[0].length, headers[current + 1]?.index) : '';
  const block = section.split(/<div\b[^>]*class=["'][^"']*\bitem-footer\b[^"']*["']/i)[0];
  const rows = [...block.matchAll(/<li[^>]*class=["'][^"']*menu-item[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)].flatMap((listItem) => {
    const originalPieces = [...listItem[1].matchAll(/<p[^>]*class=["'][^"']*\b(?:dish|info)\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi)].flatMap((match) => match[1].split(/<br\s*\/?>/i));
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
    return [{ name, type: mealType(heading, row.name), tags: commonInlineDietTags(row.original), details: row.original }];
  });
  const pageText = textFromHtml(html);
  const name = textFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || 'Scandic Jyväskylä Station').replace(/^Lounas\s+/i, '').replace(/,\s*Jyväskylä$/i, '');
  const description = decodeHtml(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '');
  const addressPattern = /[A-ZÅÄÖ][\p{L}-]*?(?:katu|tie|kuja|polku|väylä|rinne)\s+\d+[A-Za-z]?(?:\s*[-–]\s*\d+)?(?:,?\s+\d{5})?,?\s+Jyväskylä/iu;
  const address = description.match(addressPattern)?.[0] || pageText.match(addressPattern)?.[0] || pageUrl.hostname;
  const hours = pageText.match(/ma\s*-\s*pe:\s*(\d{1,2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}(?::\d{2})?)/i);
  const price = textFromHtml(block).match(/Lounasbuffet\s*([0-9]+[,.][0-9]{2}\s*€)/i)?.[1] || '';
  const opensAt = hours?.[1] && !hours[1].includes(':') ? `${hours[1]}:00` : hours?.[1];
  const closesAt = hours?.[2] && !hours[2].includes(':') ? `${hours[2]}:00` : hours?.[2];
  return { name, address, provider: 'LOUNAAT.INFO', hours: hours ? `${opensAt}–${closesAt}` : 'Tarkista ravintolasta', price, dishes, menuDate: heading ? date : undefined, sourceUrl: pageUrl.toString() };
}

function parseCsv(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && value[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function splitTourulaDishes(value: string) {
  return value
    .split(/\r?\n|\s*•\s*/)
    .map((dish) => dish.trim().replace(/[,.]+$/, ''))
    .filter(Boolean);
}

export async function parseTourulanRavintola(pageUrl: URL, html: string, date = menuDate()) {
  if (!hostMatches(pageUrl, 'tourulanravintola.fi')) return null;
  const sheetUrl = decodeHtml(html.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^"'<\s]+/i)?.[0] || '');
  if (!sheetUrl) throw new Error('Tourulan ruokalistan taulukkoa ei tunnistettu.');

  const publishedId = sheetUrl.match(/\/spreadsheets\/d\/e\/([^/]+)/i)?.[1];
  if (!publishedId) throw new Error('Tourulan ruokalistan taulukkoa ei tunnistettu.');
  const gid = new URL(sheetUrl).searchParams.get('gid') || '0';
  const csvUrl = `https://docs.google.com/spreadsheets/d/e/${publishedId}/pub?gid=${encodeURIComponent(gid)}&single=true&output=csv`;
  const csv = await readText(await safeFetch(csvUrl));
  const rows = parseCsv(csv);

  const dateRow = rows.find((row) => row.some((cell) => dateInText(cell, date) === date));
  const dateColumn = dateRow?.findIndex((cell) => dateInText(cell, date) === date) ?? -1;
  const firstMenuRow = dateRow ? rows.indexOf(dateRow) + 1 : -1;
  const following = rows.slice(firstMenuRow);
  const nextDateRow = following.findIndex((row) => row.some((cell) => dateInText(cell, date)));
  const menuRows = nextDateRow < 0 ? following : following.slice(0, nextDateRow);

  const dishes = dateColumn < 0 || firstMenuRow < 0 ? [] : menuRows
    .flatMap((row) => splitTourulaDishes(row[dateColumn] || ''))
    .filter((dish) => !/^(?:herkkupäivä\s*!*|maanantai|tiistai|keskiviikko|torstai|perjantai|lauantai|sunnuntai)$/i.test(dish))
    .map((raw) => ({ name: decodeHtml(raw), type: mealType('', raw), tags: [] as string[] }))
    .filter((dish) => dish.name);

  const pageText = textFromHtml(html);
  const hours = pageText.match(/Lounas\s*Buffet[^\d]{0,30}\d+[,.]\d{2}\s*€?\s*ark\.\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/i);
  const price = (pageText.match(/Lounas\s*buffet\s*([0-9]+[,.][0-9]{2}\s*€)/i)?.[1] || '').replace(/\s*€$/, ' €');
  const address = (pageText.match(/Vapaaherrantie\s+2\s+40100,?\s+Jyväskylä/i)?.[0] || 'Vapaaherrantie 2, 40100 Jyväskylä').replace(/\s+40100,?/, ', 40100');

  return {
    name: 'Tourulan Ravintola',
    address,
    provider: 'TOURULAN RAVINTOLA',
    hours: hours ? `${hours[1]}–${hours[2]}` : 'Tarkista ravintolasta',
    price,
    dishes,
    menuDate: dateRow ? date : undefined,
    notice: dishes.length ? 'Annokset ja ruokavaliomerkinnät on säilytetty taulukon soluittain.' : undefined,
    sourceUrl: pageUrl.toString(),
  };
}

export function parseGeneric(pageUrl: URL, html: string, date = menuDate()) {
  const name = textFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || pageUrl.hostname);
  const body = html.replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const lines = body.replace(/<br\b[^>]*>|<\/(?:p|li|div|h[1-6]|tr)\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').split('\n').map(decodeHtml).filter(Boolean);
  const start = lines.findIndex((line) => line.length < 100 && dateInText(line, date) === date);
  const remaining = start < 0 ? [] : lines.slice(start + 1);
  const end = remaining.findIndex((line) => dateInText(line, date) || /^(?:maanantai|tiistai|keskiviikko|torstai|perjantai|lauantai|sunnuntai|yhteystiedot|aukioloajat|allergeenit|à la carte)/i.test(line));
  const selection = end < 0 ? remaining : remaining.slice(0, end);
  const excluded = /^(lounas|lunch|ruokalista|menu|etusivu|ravintola|yhteystiedot|aukioloajat|allergeenit|tänään)$/i;
  const candidates = selection.filter((line) => line.length >= 8 && !excluded.test(line) && !/eväste|cookie|tietosuoja|copyright|©|facebook|instagram/i.test(line));
  const likelyFood = candidates.filter((line) => /keitto|kastike|salaatti|broileri|kala|liha|kasvis|pasta|riisi|peruna|jälkiruoka/i.test(line));
  const dishes = [...new Set(likelyFood)].map((line) => ({ name: line, type: 'Annokset', tags: [] as string[] }));
  const hours = textFromHtml(html).match(/(?:lounas|lunch)[^\d]{0,20}(\d{1,2}[.:]\d{2})\s*[-–]\s*(\d{1,2}[.:]\d{2})/i);
  const price = selection.join(' ').match(/(\d+[,.]\d{2}\s*€)/)?.[1] || '';
  return { name, address: pageUrl.hostname, provider: pageUrl.hostname.replace(/^www\./, '').toUpperCase(), hours: hours ? `${hours[1]}–${hours[2]}` : 'Tarkista ravintolasta', price, dishes, menuDate: start >= 0 ? date : undefined, status: 'unverified' as const, notice: start >= 0 ? 'Päiväys löytyi, mutta annosten tunnistus on epävarma. Tarkista alkuperäinen lista.' : 'Päivän päiväystä ei löytynyt. Avaa ravintolan alkuperäinen lista.', sourceUrl: pageUrl.toString() };
}

export async function parseRestaurant(url: URL, html: string, date = menuDate()): Promise<Restaurant> {
  const parsed: Omit<Restaurant, 'status'> & { status?: Restaurant['status'] } = await parseSodexo(url, html, date) || await parseJuvenes(url, html, date) || parseHuili(url, html, date) || parseLounaatInfo(url, html, date) || await parseTourulanRavintola(url, html, date) || parseGeneric(url, html, date);
  const status = parsed.status || (parsed.dishes.length ? 'available' : 'unavailable');
  return { ...parsed, status };
}
