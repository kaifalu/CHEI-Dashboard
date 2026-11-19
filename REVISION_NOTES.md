# Expanded Indicators 3.1 — revision notes

## Why this revision

The previous street-tile provider displayed an “API KEY REQUIRED” message, and the main combination checklist exposed only a small subset of the supplied layers. This revision replaces the default background with embedded map geometry and expands the guided combination catalogue.

## What changed

- Both guided and advanced maps start with embedded boundaries and no external tile requests. Hosted HTTP(S) pages offer an explicit OpenStreetMap street option with attribution; local-file use stays offline.
- The grouped, searchable checklist now offers **17 indicator families**, covering the **26 original analytical layer keys** through supported periods and housing types.
- Added choices include CHEI, population density, single-family and multi-family tract records, model-point precipitation, the tract counterpart of the climate surface, precipitation change, housing-grid concentration, housing-point records, fixed hotspot patterns, and changed-parcel land use.
- Numeric inputs use their countywide high-value cutoffs. Hotspot and land-use inputs use one or more selected category names. All, Any, and At least N can combine both types.
- Exact duplicate source fields are rejected. Related but different inputs remain selectable with dependence and interpretation notes.
- Per-input periods, housing types, category choices, source support, missingness, and matching conditions carry through results and exports.
- The print action is **Print screening brief**. Larger combinations can require more than one page.

The five-step sequence remains **Location → Precipitation → Indicators → Periods & rules → Results**, with one editable panel at a time. The earlier full-controls interface remains available as `advanced_explorer.html`.

## Analytical boundaries

New tract summaries are documented in [EXPANDED_INDICATOR_METHODS.md](docs/EXPANDED_INDICATOR_METHODS.md). Model-point means leave unobserved tracts missing. Grid medians use whole intersecting cells. Combined housing-point screening uses full supplied tract record counts, not sampled markers. Land-use categories describe the changing-parcel subset, not the complete land inventory. Kriging combinations use existing tract precipitation, with no raster-pixel extraction.

Original analytical fields, supplied CHEI, and fixed hotspot definitions are retained. No projections or synchronized climate/calendar-year scenarios are generated. Every selected input must be valid for a tract to enter the evaluated denominator. ZIP/precinct screens retain whole intersecting tracts.

## Documentation and verification

The README, guided user guide, technical notes, deployment instructions, and method notes describe this release. Read current `qa/` reports for executed checks and their scope. Data, engine, Bokeh-model, and DOM/state validation are distinct from graphical browser verification; earlier screenshots and pass counts do not certify this interface's visual layout, street-tile delivery, or print pagination.
