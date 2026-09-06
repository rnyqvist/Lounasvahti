import { NextRequest, NextResponse } from 'next/server';
import { parseRestaurant } from '../../../lib/menus.ts';
import { safeFetch, readText, validatePublicUrl } from '../../../lib/safe-fetch.ts';
import { menuDate } from '../../../lib/menu-date.ts';

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const url = validatePublicUrl(body && typeof body === 'object' && 'url' in body ? body.url : undefined);
    const date = menuDate();
    const response = await safeFetch(url);
    if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
      throw new Error('Osoite ei johda luettavaan verkkosivuun.');
    }
    const html = await readText(response);
    const sourceUrl = validatePublicUrl(response.url || url.toString());
    const restaurant = await parseRestaurant(sourceUrl, html, date);
    return NextResponse.json({ restaurant, requestedDate: date, fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError' ? 'Ravintolan sivu ei vastannut ajoissa.' : error instanceof Error ? error.message : 'Ruokalistan haku epäonnistui.';
    return NextResponse.json({ error: message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
