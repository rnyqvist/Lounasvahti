'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

const DEFAULT_URLS = [
  'https://www.sodexo.fi/ravintolat/ravintola-optimes-business-garden',
  'https://juvenes.fi/anna/',
  'https://huilipiste.fi/ravintola/huili-tourula-jyvaskyla/',
  'https://www.lounaat.info/lounas/scandic-jyvaskyla/jyvaskyla',
];
type Dish = { name: string; type: string; tags: string[] };
type Restaurant = { name: string; address: string; provider: string; hours: string; price: string; dishes: Dish[]; sourceUrl: string };
type MenuState = { url: string; data?: Restaurant; loading: boolean; error?: string; fetchedAt?: string };

const dateFormatter = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', weekday: 'long', day: 'numeric', month: 'long' });

function loadSavedUrls() {
  if (typeof window === 'undefined') return DEFAULT_URLS;
  try {
    const saved = JSON.parse(localStorage.getItem('lounasvahti-ravintolat') || '[]');
    const savedUrls = Array.isArray(saved) ? saved.filter((value): value is string => typeof value === 'string') : [];
    if (!localStorage.getItem('lounasvahti-oletukset-v2')) {
      const merged = [...new Set([...DEFAULT_URLS, ...savedUrls])];
      localStorage.setItem('lounasvahti-ravintolat', JSON.stringify(merged));
      localStorage.setItem('lounasvahti-oletukset-v2', '1');
      return merged;
    }
    return savedUrls.length ? savedUrls : DEFAULT_URLS;
  } catch { return DEFAULT_URLS; }
}

export default function Home() {
  const [menus, setMenus] = useState<MenuState[]>([]);
  const [isModalOpen, setModalOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [formError, setFormError] = useState('');
  const today = useMemo(() => { const value = dateFormatter.format(new Date()); return value.charAt(0).toUpperCase() + value.slice(1); }, []);

  const fetchMenu = useCallback(async (url: string) => {
    setMenus((current) => current.map((item) => item.url === url ? { ...item, loading: true, error: undefined } : item));
    try {
      const response = await fetch('/api/menu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Ruokalistan haku epäonnistui.');
      setMenus((current) => current.map((item) => item.url === url ? { url, data: result.restaurant, fetchedAt: result.fetchedAt, loading: false } : item));
    } catch (error) {
      setMenus((current) => current.map((item) => item.url === url ? { ...item, loading: false, error: error instanceof Error ? error.message : 'Tuntematon virhe' } : item));
    }
  }, []);

  useEffect(() => {
    const initial = loadSavedUrls().map((url): MenuState => ({ url, loading: true }));
    setMenus(initial);
    initial.forEach((item) => void fetchMenu(item.url));
  }, [fetchMenu]);

  const saveUrls = (items: MenuState[]) => localStorage.setItem('lounasvahti-ravintolat', JSON.stringify(items.map((item) => item.url)));

  const addRestaurant = (event: FormEvent) => {
    event.preventDefault(); setFormError('');
    let normalized: string;
    try {
      const parsed = new URL(newUrl.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      normalized = parsed.toString();
    } catch { setFormError('Anna kokonainen verkko-osoite, esimerkiksi https://ravintola.fi/lounas'); return; }
    if (menus.some((item) => item.url === normalized)) { setFormError('Tämä ravintola on jo listalla.'); return; }
    const next = [...menus, { url: normalized, loading: true }];
    setMenus(next); saveUrls(next); setNewUrl(''); setModalOpen(false); void fetchMenu(normalized);
  };

  const removeRestaurant = (url: string) => { const next = menus.filter((item) => item.url !== url); setMenus(next); saveUrls(next); };
  const latestFetch = menus.find((item) => item.fetchedAt)?.fetchedAt;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#alkuun" aria-label="Lounasvahti, etusivu"><span className="brand-mark" aria-hidden="true">L</span><span>Lounasvahti</span></a>
        <div className="header-actions">
          <button className="add-button" type="button" onClick={() => setModalOpen(true)}><span aria-hidden="true">＋</span> Lisää ravintola</button>
          <button className="menu-button refresh-button" type="button" aria-label="Päivitä ruokalistat" title="Päivitä ruokalistat" onClick={() => menus.forEach((item) => void fetchMenu(item.url))}>↻</button>
        </div>
      </header>
      <section className="hero" id="alkuun">
        <div><p className="eyebrow">{today.toLocaleUpperCase('fi-FI')}</p><h1>Mitä tänään<br /><em>syötäisiin?</em></h1><p className="intro">Päivän lounaat läheltäsi — yhdessä paikassa.</p></div>
        <div className="hero-orbit" aria-hidden="true"><span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /><span className="orbit-line" /><span className="plate">☀</span></div>
      </section>
      <section className="content" aria-labelledby="restaurants-heading">
        <div className="section-heading">
          <div><p className="section-kicker">TÄNÄÄN LISTALLA</p><h2 id="restaurants-heading">Lounasravintolat <span>{menus.length}</span></h2></div>
          <p className="updated"><span /> {latestFetch ? 'Päivitetty juuri nyt' : 'Haetaan ruokalistoja'}</p>
        </div>
        {menus.length === 0 && <div className="empty-state"><span aria-hidden="true">✦</span><h3>Lisää ensimmäinen lounaspaikkasi</h3><p>Liitä ravintolan ruokalistasivun osoite, niin Lounasvahti etsii päivän annokset.</p><button type="button" onClick={() => setModalOpen(true)}>Lisää ravintola</button></div>}
        <div className="restaurant-list">
          {menus.map((item) => (
            <article className={`restaurant-card ${item.loading ? 'is-loading' : ''}`} key={item.url}>
              <div className="restaurant-side">
                <div className="provider-row"><span className="provider">{item.data?.provider || 'RUOKALISTA'}</span><button type="button" className="remove-button" onClick={() => removeRestaurant(item.url)} aria-label="Poista ravintola" title="Poista ravintola">×</button></div>
                <div><h3>{item.loading ? 'Ruokalistaa haetaan…' : item.data?.name || 'Ruokalistaa ei löytynyt'}</h3><p className="address">{item.data?.address || new URL(item.url).hostname}</p></div>
                <div className="hours"><span className="clock" aria-hidden="true">◷</span><div><small>LOUNAS TÄNÄÄN</small><strong>{item.data?.hours || 'Tarkista ravintolasta'}</strong></div></div>
                <a className="source-link" href={item.url} target="_blank" rel="noreferrer">Avaa ravintolan sivu <span aria-hidden="true">↗</span></a>
              </div>
              <div className="menu-panel">
                <div className="menu-topline"><span>PÄIVÄN LOUNAS</span><span className="price">{item.data?.price || ''}</span></div>
                {item.loading && <div className="loading-list" aria-live="polite"><div /><div /><div /><p>Luetaan päivän ruokalistaa…</p></div>}
                {item.error && <div className="error-state" role="alert"><span aria-hidden="true">!</span><h4>Ruokalistaa ei saatu luettua</h4><p>{item.error}</p><button type="button" onClick={() => void fetchMenu(item.url)}>Yritä uudelleen</button></div>}
                {item.data && item.data.dishes.length > 0 && <div className="dish-list">{item.data.dishes.map((dish, index) => (
                  <div className="dish" key={`${dish.name}-${index}`}><span className="dish-number">{String(index + 1).padStart(2, '0')}</span><div className="dish-copy"><p className="dish-type">{dish.type}</p><h4>{dish.name}</h4><div className="tags">{dish.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div></div>
                ))}</div>}
                {item.data && item.data.dishes.length === 0 && <div className="error-state calm"><span aria-hidden="true">–</span><h4>Ei ruokalistaa tälle päivälle</h4><p>Ravintola ei ole julkaissut päivän annoksia tai ravintola on tänään suljettu.</p></div>}
                <p className="legend"><span>G</span> Gluteeniton <i /> <span>L</span> Laktoositon <i /> <span>M</span> Maidoton</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <footer><p>Lounasvahti kerää ruokalistat ravintoloiden omilta verkkosivuilta.</p><p>Hyvää ruokahalua! <span aria-hidden="true">✦</span></p></footer>
      {isModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <button type="button" className="modal-close" onClick={() => setModalOpen(false)} aria-label="Sulje">×</button>
          <p className="section-kicker">UUSI LOUNASPAIKKA</p><h2 id="modal-title">Lisää ravintola</h2>
          <p className="modal-intro">Liitä ravintolan lounaslistan verkko-osoite. Lounasvahti yrittää tunnistaa annokset automaattisesti.</p>
          <form onSubmit={addRestaurant}><label htmlFor="restaurant-url">Ruokalistasivun osoite</label><input id="restaurant-url" type="url" value={newUrl} onChange={(event) => setNewUrl(event.target.value)} placeholder="https://ravintola.fi/lounas" autoFocus required />{formError && <p className="form-error" role="alert">{formError}</p>}<button className="submit-button" type="submit">Hae ruokalista <span aria-hidden="true">→</span></button></form>
          <p className="privacy-note">Osoite tallennetaan vain tämän selaimen muistiin.</p>
        </section>
      </div>}
    </main>
  );
}
