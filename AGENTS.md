# Lounasvahti project notes

## Purpose

Finnish browser app that fetches and presents the current day's lunch menus
from user-selected restaurant pages.

## Current status

- First functional version completed on 2026-09-02.
- Default restaurant: Sodexo Optimes Business Garden, Jyväskylä.
- Sodexo weekly JSON feeds are detected and parsed server-side.
- Other pages use a conservative generic HTML menu heuristic.
- Restaurant URLs persist per device in localStorage.
- Responsive Finnish UI, error/loading/empty states, refresh, add, and remove are implemented.
- Production build passes with Vinext.

## Architecture

- `app/page.tsx`: client UI and device-local restaurant collection.
- `app/api/menu/route.ts`: URL validation, remote fetch, Sodexo parser, generic fallback parser.
- `app/globals.css`: responsive visual system and interaction states.
- `.openai/hosting.json`: OpenAI Sites deployment configuration.

## Next useful step

Add explicit parsers and fixtures for the next real restaurant providers the
user wants to support. Prefer provider-owned JSON/RSS feeds where available.

## Safety notes

Keep SSRF protections in `validatePublicUrl` when extending fetching. Do not
move arbitrary URL fetching into the browser because most providers block it
with CORS and it exposes implementation details.
