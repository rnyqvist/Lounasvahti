# Lounasvahti project notes

## Purpose

Finnish browser app that fetches and presents the current day's lunch menus
from user-selected restaurant pages.

## Current status

- First functional version completed on 2026-09-02.
- Source is mirrored to the private GitHub repository `rnyqvist/Lounasvahti`.
- Default restaurants: Sodexo Optimes Business Garden, Restaurant Anna,
  Huili Tourula, Scandic Jyväskylä Station, and Tourulan Ravintola.
- Sodexo dated daily JSON, Juvenes Jamix, Huili, Lounaat.info, and Tourulan
  Ravintola Google Sheets menus have
  source-specific server-side parsers.
- The Lounaat.info parser supports both compact buffet blocks and separate
  priced heading/dish rows. Exact dates are required; never restore the stale-weekday fallback.
- Other pages require a dated section and display an explicit uncertain-extraction notice.
- Restaurant URLs persist per device in localStorage.
- Responsive Finnish UI, error/loading/empty states, refresh, add, and remove are implemented.
- Production build passes with Vinext.

## Architecture

- `app/page.tsx`: client UI and device-local restaurant collection.
- `app/lunch-weather.tsx`, `lib/lunch-weather.ts`, `lib/weather-source.ts` and
  `app/api/weather/route.ts`: Jyväskylä lunch weather (62.2426, 25.7473), replacing
  Päivän bittipala at the user's request on September 7. MET Norway Locationforecast
  provides temperature, wind and precipitation for exactly 10–11, 11–12, 12–13.
  Keep today's forecast until Helsinki midnight using D1 daily snapshots. Missing/past hours
  stay missing; never substitute a six-hour precipitation amount for a one-hour amount.
  Server cache honors Expires/Last-Modified, deduplicates requests and backs off on
  errors. Visible clients refresh every ~15 minutes and on return if due.
- `public/weather/`: official MET/Yr weather SVGs, bundled unchanged under MIT;
  keep LICENSE.txt. Forecast attribution is MET Norway, CC BY 4.0, with a notice
  that Lounasvahti produces the summary. No API key or location permission required.
- `app/api/menu/route.ts`: request validation and API response with the requested Helsinki date.
- `lib/menus.ts`: provider parsers and menu status; date arguments make regression tests deterministic.
- `lib/menu-date.ts`: Helsinki date and source-date parsing, shared with the client.
- `lib/safe-fetch.ts`: redirect validation, timeouts and streamed response-size limits.
- `lib/restaurant-storage.ts`: URL normalization and saved preferences (including an empty list).
- `tests/*.test.mjs`: Node regression tests for all five providers, dates, diets, storage and fetching.
- `app/globals.css`: responsive visual system and interaction states.
- `.openai/hosting.json`: OpenAI Sites deployment configuration.

## Next useful step

Add explicit parsers for the next real restaurant providers the user wants to
support. Prefer provider-owned JSON/RSS feeds where available and re-check the
five live default URLs after parser changes. Run `npm.cmd test`,
`npm.cmd run typecheck`, and `npm.cmd run build`.

## September 6 accuracy fixes

- Preserve Finnish letters when recognizing dietary tokens. Never infer a whole-meal
  dietary label from only the components with known labels. Original provider text
  is available in expandable details; V is not automatically translated to vegan.
- Tourula preserves spreadsheet cells and explicit line breaks; capitalization is
  not a dish separator. Stop before another date row, and do not skip the first dish.
- Huili respects its published weekday lunch schedule and requires a matching date.
- Show per-restaurant fetch time and menu date, distinguish unavailable/closed/uncertain,
  and label retained data after a refresh failure. Clear old results on Helsinki day rollover.
- Refresh stays available on mobile; requests are cancelled on replacement/removal.
  Native dialog handles Escape and focus containment. Empty saved selections persist.
- The September 6 live check returned empty menus for four providers and a weekday-only
  closed state for Huili. This is Sunday source availability, not a failed parser.
- Accuracy fixes were published publicly as Sites version 6 on September 6.
  Check current Sites version/access before reporting later changes as live.

## Safety notes

Keep SSRF protections in `validatePublicUrl` when extending fetching. Do not
move arbitrary URL fetching into the browser because most providers block it
with CORS and it exposes implementation details.

The fetch guard rejects IP literals (including IPv6/obfuscated IPv4), local-style
hostnames, credentials and nonstandard ports, and validates every redirect. It does
not pin DNS resolution: it is not a complete DNS-rebinding defense. Keep production
network egress isolated; do not expose this endpoint from a trusted intranet runtime.
