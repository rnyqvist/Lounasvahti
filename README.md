# Lounasvahti

A Finnish-language web app that brings together today's lunch menus from local
restaurants. The default restaurants are Optimes Business Garden, Restaurant Anna,
Huili Tourula, Scandic Jyväskylä Station, and Tourulan Ravintola.

## Features

- Jyväskylä lunch weather from 10 AM to 1 PM, with weather icons, temperature,
  wind speed, and hourly precipitation. The daily forecast is stored in a database
  until midnight (Europe/Helsinki). Forecast data comes from MET Norway (CC BY 4.0),
  with MET/Yr weather icons (MIT). No API key or browser location access is required.
- Today's menus are fetched whenever the page is opened or refreshed.
- Source-specific parsers support Sodexo JSON, Juvenes Jamix, Huili, Lounaat.info,
  and Tourulan Ravintola's Google Sheets menus.
- A generic HTML parser handles other lunch pages.
- Users can add and remove restaurants by URL.
- The restaurant list persists in the browser's local storage.
- Server-side fetching avoids browser CORS restrictions and blocks requests to
  local network addresses.

## Development

```powershell
npm.cmd install
npx.cmd wrangler d1 migrations apply DB --local --config wrangler.local.json
npm.cmd run dev
```

Validate the production build:

```powershell
npm.cmd run build
```

Regression tests and TypeScript validation:

```powershell
npm.cmd test
npm.cmd run typecheck
```

Menus now use exact Helsinki dates. Unverified extraction is labelled explicitly,
and old weekday menus are not substituted for today's menu. Source dietary text
is preserved; missing component labels do not imply that the whole meal shares a
diet. The page shows individual fetch times and refreshes when the Helsinki day changes.

## Future development

The generic HTML parser works on a best-effort basis. Add source-specific parsers
for additional restaurant chains alongside the Sodexo parser to improve the
accuracy of dishes, dietary labels, prices, and opening hours.
