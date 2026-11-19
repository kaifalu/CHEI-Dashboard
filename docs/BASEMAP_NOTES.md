# Background maps without an API key

The former background provider returned an “API key required” tile. This release removes that provider from the active generated dashboards and their builders.

## Default: embedded boundaries

The default map uses the dashboard's embedded county boundary and analytical geometries against a neutral background. It does not request online map tiles, needs no API key, and is available when opening the standalone HTML locally. Maps, indicators, selected boundaries, charts, screening tables, and exports continue to use the embedded data.

This background does not include street names or road imagery. The geographic data are unchanged.

## Optional: OpenStreetMap streets

An HTTP(S)-hosted dashboard can offer an explicit **OpenStreetMap streets** background choice. It requests only the currently viewed tiles from:

`https://tile.openstreetmap.org/{z}/{x}/{y}.png`

The renderer retains visible linked attribution to OpenStreetMap contributors. It is not attached to the map until selected, and is removed again when the embedded background is selected. Local `file:` and preview `about:` HTML keep the embedded background, because those contexts cannot supply the ordinary website referrer expected by this tile service.

The standard tile service is provided on a best-effort basis and can be unavailable. The embedded background remains usable independently. This package does not download or redistribute an offline tile archive, prefetch whole areas, bypass the browser cache, proxy tile requests, or add API credentials.

## Source and implementation

- OpenStreetMap Foundation tile policy: https://operations.osmfoundation.org/policies/tiles/
- Attribution guidance: https://www.openstreetmap.org/copyright
- `basemap.py` creates the detached optional renderer.
- The guided controls and the Advanced explorer attach it only after an explicit supported online selection.

The old screenshots and previous-release QA records are historical and can still show the former provider.
