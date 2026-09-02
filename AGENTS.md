# Lounasvahti project notes

## Purpose

Finnish browser app that fetches and presents the current day's lunch menus
from user-selected restaurant pages.

## Current status

- First functional version completed on 2026-09-02.
- Source is mirrored to the private GitHub repository `rnyqvist/Lounasvahti`.
- Default restaurants: Sodexo Optimes Business Garden, Restaurant Anna,
  Huili Tourula, and Scandic Jyväskylä Station.
- Sodexo weekly JSON, Juvenes Jamix, Huili, and Lounaat.info menus have
  source-specific server-side parsers.
- The Lounaat.info parser supports both compact buffet blocks and separate
  priced heading/dish rows, with a weekday fallback for stale displayed dates.
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

Add explicit parsers for the next real restaurant providers the user wants to
support. Prefer provider-owned JSON/RSS feeds where available and re-check the
four live default URLs after parser changes.

## Safety notes

Keep SSRF protections in `validatePublicUrl` when extending fetching. Do not
move arbitrary URL fetching into the browser because most providers block it
with CORS and it exposes implementation details.
