'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { Restaurant } from '../lib/menus.ts';
import { menuDate } from '../lib/menu-date.ts';
import { DEFAULT_URLS, normalizeRestaurantUrl, savedRestaurantUrls } from '../lib/restaurant-storage.ts';
import { DailyBit } from './daily-bit';

type MenuState = { url: string; data?: Restaurant; loading: boolean; error?: string; fetchedAt?: string };

const dateFormatter = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', weekday: 'long', day: 'numeric', month: 'long' });
const fetchedFormatter = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const statusText = { available: 'Päivän lounas', unavailable: 'Päivän menu puuttuu', closed: 'Ei lounasta tänään', unverified: 'Tarkista ruokalista' };

function loadSavedUrls() {
  if (typeof window === 'undefined') return DEFAULT_URLS;
  try {
    return savedRestaurantUrls(localStorage.getItem('lounasvahti-ravintolat'));
  } catch { return DEFAULT_URLS; }
}

export default function Home() {
  const [menus, setMenus] = useState<MenuState[]>([]);
  const [isModalOpen, setModalOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [storageError, setStorageError] = useState('');
  const today = dateFormatter.format(now);
  const date = menuDate(now);
  const currentDay = useRef(date);
  const menuUrls = useRef<string[]>([]);
  const requests = useRef(new Map<string, AbortController>());
  const dialog = useRef<HTMLDialogElement>(null);

  const fetchMenu = useCallback(async function loadMenu(url: string, retryDate = true) {
    requests.current.get(url)?.abort();
    const controller = new AbortController();
    requests.current.set(url, controller);
    setMenus((current) => current.map((item) => item.url === url ? { ...item, loading: true, error: undefined } : item));
    try {
      const response = await fetch('/api/menu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) });
      const result = await response.json() as { error?: string; requestedDate?: string; restaurant?: Restaurant; fetchedAt?: string };
      if (controller.signal.aborted || requests.current.get(url) !== controller) return;
      if (!response.ok) throw new Error(result.error || 'Ruokalistan haku epäonnistui.');
      if (!result.restaurant || !result.requestedDate || !result.fetchedAt) throw new Error('Ruokalistapalvelun vastaus ei kelpaa.');
      if (result.requestedDate !== menuDate()) {
        if (retryDate) { void loadMenu(url, false); return; }
        throw new Error('Päiväys ei vastaa tämän päivän päiväystä. Tarkista laitteen kellonaika ja yritä uudelleen.');
      }
      setMenus((current) => current.map((item) => item.url === url ? { url, data: result.restaurant, fetchedAt: result.fetchedAt, loading: false } : item));
    } catch (error) {
      if (controller.signal.aborted || requests.current.get(url) !== controller) return;
      setMenus((current) => current.map((item) => item.url === url ? { ...item, loading: false, error: error instanceof Error ? error.message : 'Tuntematon virhe' } : item));
    } finally { if (requests.current.get(url) === controller) requests.current.delete(url); }
  }, []);

  useEffect(() => {
    const initial = loadSavedUrls().map((url): MenuState => ({ url, loading: true }));
    menuUrls.current = initial.map((item) => item.url);
    setMenus(initial);
    initial.forEach((item) => void fetchMenu(item.url));
    const pending = requests.current;
    const checkDate = () => {
      const next = new Date();
      setNow(next);
      if (currentDay.current !== menuDate(next)) {
        currentDay.current = menuDate(next);
        setMenus((items) => items.map((item) => ({ url: item.url, loading: true })));
        menuUrls.current.forEach((url) => void fetchMenu(url));
      }
    };
    const timer = window.setInterval(checkDate, 30000);
    window.addEventListener('focus', checkDate);
    document.addEventListener('visibilitychange', checkDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', checkDate);
      document.removeEventListener('visibilitychange', checkDate);
      pending.forEach((controller) => controller.abort());
      pending.clear();
    };
  }, [fetchMenu]);

  useEffect(() => {
    if (isModalOpen && !dialog.current?.open) dialog.current?.showModal();
    if (!isModalOpen && dialog.current?.open) dialog.current.close();
  }, [isModalOpen]);

  const saveUrls = (items: MenuState[]) => {
    menuUrls.current = items.map((item) => item.url);
    try { localStorage.setItem('lounasvahti-ravintolat', JSON.stringify(menuUrls.current)); setStorageError(''); }
    catch { setStorageError('Selaimen tallennus ei ole käytettävissä. Muutokset säilyvät vain tämän sivun ajan.'); }
  };

  const addRestaurant = (event: FormEvent) => {
    event.preventDefault(); setFormError('');
    let normalized: string;
    try {
      normalized = normalizeRestaurantUrl(newUrl);
    } catch { setFormError('Anna kokonainen verkko-osoite, esimerkiksi https://ravintola.fi/lounas'); return; }
    if (menus.some((item) => item.url === normalized)) { setFormError('Tämä ravintola on jo listalla.'); return; }
    const next = [...menus, { url: normalized, loading: true }];
    setMenus(next); saveUrls(next); setNewUrl(''); setModalOpen(false); void fetchMenu(normalized);
  };

  const removeRestaurant = (url: string) => { requests.current.get(url)?.abort(); requests.current.delete(url); const next = menus.filter((item) => item.url !== url); setMenus(next); saveUrls(next); };
  const loading = menus.some((item) => item.loading);
  const failed = menus.filter((item) => item.error).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#alkuun" aria-label="Lounasvahti, etusivu"><span className="brand-mark" aria-hidden="true">L</span><span>Lounasvahti</span></a>
        <div className="header-actions">
          <button className="add-button" type="button" onClick={() => setModalOpen(true)}><span aria-hidden="true">＋</span> Lisää ravintola</button>
          <button className="menu-button refresh-button" type="button" disabled={loading || !menus.length} aria-label="Päivitä ruokalistat" title="Päivitä ruokalistat" onClick={() => menus.forEach((item) => void fetchMenu(item.url))}>↻</button>
        </div>
      </header>
      <section className="hero" id="alkuun">
        <div><p className="eyebrow">{today.toLocaleUpperCase('fi-FI')}</p><h1>Mitä tänään<br /><em>syötäisiin?</em></h1><p className="intro">Päivän lounaat läheltäsi — yhdessä paikassa.</p></div>
        <DailyBit date={date} />
      </section>
      <section className="content" aria-labelledby="restaurants-heading">
        <div className="section-heading">
          <div><p className="section-kicker">TÄNÄÄN LISTALLA</p><h2 id="restaurants-heading">Lounasravintolat <span>{menus.length}</span></h2></div>
          <p className="updated" role="status">{loading ? 'Haetaan ruokalistoja…' : failed ? `${failed} hakua epäonnistui` : menus.length ? 'Haku valmis' : 'Ei ravintoloita'}</p>
        </div>
        {storageError && <p role="alert" className="menu-notice">{storageError}</p>}
        {menus.length === 0 && <div className="empty-state"><span aria-hidden="true">✦</span><h3>Lisää ensimmäinen lounaspaikkasi</h3><p>Liitä ravintolan ruokalistasivun osoite, niin Lounasvahti etsii päivän annokset.</p><button type="button" onClick={() => setModalOpen(true)}>Lisää ravintola</button></div>}
        <div className="restaurant-list">
          {menus.map((item) => (
            <article className={`restaurant-card ${item.loading ? 'is-loading' : ''}`} key={item.url}>
              <div className="restaurant-side">
                <div className="provider-row"><span className="provider">{item.data?.provider || 'RUOKALISTA'}</span><button type="button" className="remove-button" onClick={() => removeRestaurant(item.url)} aria-label="Poista ravintola" title="Poista ravintola">×</button></div>
                <div><h3>{item.data?.name || (item.loading ? 'Ruokalistaa haetaan…' : 'Ruokalistaa ei löytynyt')}</h3><p className="address">{item.data?.address || new URL(item.url).hostname}</p></div>
                <div className="hours"><span className="clock" aria-hidden="true">◷</span><div><small>ILMOITETTU LOUNASAIKA</small><strong>{item.data?.status === 'closed' ? 'Ei lounasta tänään' : item.data?.hours || 'Tarkista ravintolasta'}</strong></div></div>
                <a className="source-link" href={item.data?.sourceUrl || item.url} target="_blank" rel="noreferrer">Avaa alkuperäinen lista <span aria-hidden="true">↗</span></a>
              </div>
              <div className="menu-panel">
                <div className="menu-topline"><span>{item.data ? statusText[item.data.status] : 'Ruokalista'}</span><span className="price">{!item.error && !item.loading && item.data?.status !== 'closed' ? item.data?.price || '' : ''}</span></div>
                {item.fetchedAt && <p className="menu-freshness">Haettu {fetchedFormatter.format(new Date(item.fetchedAt))}{item.data?.menuDate ? ` · Menu ${item.data.menuDate.split('-').reverse().join('.')}` : ' · Päiväystä ei vahvistettu'}</p>}
                {item.loading && <div className="loading-list" aria-live="polite"><div /><div /><div /><p>Luetaan päivän ruokalistaa…</p></div>}
                {item.error && <div className="error-state" role="alert"><span aria-hidden="true">!</span><h4>Ruokalistaa ei saatu luettua</h4><p>{item.error}</p><button type="button" onClick={() => void fetchMenu(item.url)}>Yritä uudelleen</button></div>}
                {!item.loading && item.data && (item.error || (item.data.menuDate && item.data.menuDate !== date)) && <p className="menu-notice" role="status">Näytetään aiemmin haettu tieto. Tarkista ajantasainen lista ravintolan sivulta.</p>}
                {!item.loading && item.data?.notice && <p className="menu-notice">{item.data.notice}</p>}
                {!item.loading && item.data && item.data.dishes.length > 0 && <div className="dish-list">{item.data.dishes.map((dish, index) => (
                  <div className="dish" key={`${dish.name}-${index}`}><span className="dish-number">{String(index + 1).padStart(2, '0')}</span><div className="dish-copy"><p className="dish-type">{dish.type}</p><h4>{dish.name}</h4><div className="tags">{dish.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>{dish.details && <details className="diet-details"><summary>Ruokavaliot lähteen mukaan</summary><p>{dish.details}</p></details>}</div></div>
                ))}</div>}
                {!item.loading && !item.error && item.data && item.data.dishes.length === 0 && <div className="error-state calm"><span aria-hidden="true">–</span><h4>{statusText[item.data.status]}</h4><p>{item.data.status === 'closed' ? 'Ravintolan ilmoittaman aikataulun mukaan tänään ei tarjoilla lounasta.' : item.data.status === 'unverified' ? 'Päivän annoksia ei voitu vahvistaa lähteestä.' : 'Lähteestä ei löytynyt päivän annoksia. Tämä ei yksin tarkoita, että ravintola on suljettu.'}</p></div>}
                <p className="legend">G = gluteeniton · L = laktoositon · M = maidoton · VL = vähälaktoosinen · V / VEG = tarkista lähteen selite</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <footer><p>Lounasvahti kerää listat ravintoloiden sivuilta ja ruokalistapalveluista.</p><p>Hyvää ruokahalua! <span aria-hidden="true">✦</span></p></footer>
      <dialog ref={dialog} className="modal-backdrop" aria-labelledby="modal-title" onClose={() => setModalOpen(false)} onCancel={() => setModalOpen(false)} onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
        <section className="modal">
          <button type="button" className="modal-close" onClick={() => setModalOpen(false)} aria-label="Sulje">×</button>
          <p className="section-kicker">UUSI LOUNASPAIKKA</p><h2 id="modal-title">Lisää ravintola</h2>
          <p className="modal-intro">Liitä ravintolan lounaslistan verkko-osoite. Lounasvahti yrittää tunnistaa annokset automaattisesti.</p>
          <form onSubmit={addRestaurant}><label htmlFor="restaurant-url">Ruokalistasivun osoite</label><input id="restaurant-url" type="url" value={newUrl} onChange={(event) => setNewUrl(event.target.value)} placeholder="https://ravintola.fi/lounas" autoFocus required />{formError && <p className="form-error" role="alert">{formError}</p>}<button className="submit-button" type="submit">Hae ruokalista <span aria-hidden="true">→</span></button></form>
          <p className="privacy-note">Osoite tallennetaan vain tämän selaimen muistiin.</p>
        </section>
      </dialog>
    </main>
  );
}
