export function validatePublicUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || raw.length > 2048) throw new Error('Verkko-osoite ei kelpaa.');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) {
    throw new Error('Käytä julkista http- tai https-osoitetta ilman kirjautumistietoja.');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // Reject IP literals entirely, including URL-normalized decimal/hex IPv4 and IPv6.
  // Provider pages and their feeds use DNS names.
  if (!host.includes('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host)) {
    throw new Error('Paikallisia verkko-osoitteita ei voi lisätä.');
  }
  url.hostname = host;
  url.hash = '';
  return url;
}

export async function safeFetch(input: URL | string): Promise<Response> {
  let url = validatePublicUrl(String(input));
  const signal = AbortSignal.timeout(12000);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetch(url, { redirect: 'manual', signal, cache: 'no-store', headers: {
      'User-Agent': 'Lounasvahti/1.0 (+lunch menu reader)', Accept: 'text/html,application/json,text/csv',
    } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Ravintolan sivun uudelleenohjaus ei kelpaa.');
      url = validatePublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Ravintolan sivu vastasi virheellä ${response.status}.`);
    }
    return response;
  }
  throw new Error('Ravintolan sivu ohjaa liian monta kertaa eteenpäin.');
}

export async function readText(response: Response, limit = 3_000_000): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0;
  let result = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Sivu on liian suuri analysoitavaksi.');
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally { reader.releaseLock(); }
}
