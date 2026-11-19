# Expanded Indicators 3.1: implementation and analytical boundaries

## Source and release lineage

This revision extends the Flexible Indicators workflow built from `Climate_Housing_Exposure_Index_Dashboard_Guided_Workflow_Final.zip`. It retains the supplied prepared analytical data and adds documented tract summaries for point, grid, and parcel representations. The raw file geodatabase is not in this archive. `SOURCE_DATA_CHECKSUMS.sha256` records original source-file digests; regenerated membership, derived fields, and HTML have separate release outputs.

The catalogue contains 17 indicator families covering all 26 original analytical layer keys through supported periods and housing types. This is not a claim of 26 independent variables or of 17 simultaneously independent conditions. See [EXPANDED_INDICATOR_METHODS.md](docs/EXPANDED_INDICATOR_METHODS.md) and `data/expanded_indicator_fields.json` for the exact layer-to-field mapping, aggregation support, and coverage.

## Architecture and offline behavior

`build_dashboard.py` constructs Bokeh data sources, renderers, metadata, and callbacks. `expanded_indicators.py` prepares additional tract summaries. `guided_builder.py` embeds the guided interface, analytical data, geographic membership, and inline Bokeh resources in equivalent `index.html` and `climate_housing_exposure_index_dashboard.html` entry points. `web/` contains the native interface and the pure JavaScript combination engine.

The five steps are Location, Precipitation, Indicators, Periods & rules, and Results. A grouped searchable catalogue exposes compatible inputs. Factor-specific periods, housing types, and category choices are retained in workflow state. Only the active step is editable. Inspecting a tract or changing an input map does not replace the selected location or the overall combination.

`basemap.py` supplies a neutral embedded-map default and an optional OpenStreetMap tile renderer. The optional renderer is **detached from the map's renderer list at startup**, not merely hidden. It is attached only after an explicit street-background choice on an HTTP(S) page and removed when the embedded background is restored. Local-file contexts disable online streets. The active map models contain no CARTO tile source. Linked OpenStreetMap attribution accompanies the online option; see [BASEMAP_NOTES.md](docs/BASEMAP_NOTES.md).

`advanced_explorer.html` retains the earlier interface with the same default background policy. The Python viewport housing-point service is optional and cannot run on GitHub Pages. Static source geometry and data needed by the guided workflow are embedded; its single-family point preview remains sampled.

## Common tract geography and representations

Direct tract families use the supplied precipitation, SVI, housing-unit change, population, households, employment, CHEI, population-density, and housing-record fields. Supplied CHEI and its change are not recomputed from the selected precipitation condition. The additional representations have different support:

| Representation | Combination field and interpretation |
|---|---|
| Model-point precipitation | Arithmetic mean of finite values strictly within each prepared tract, separately for each warming threshold. No points means missing; no nearest-point or tract-value substitution. |
| Kriging surface | Corresponding supplied tract precipitation field. This is the documented tract counterpart of the display surface, not extracted raster pixels or a new interpolation. |
| Housing grid | Median finite count among whole 1 km cells intersecting each tract, including boundary touches. Cells may be shared, are not clipped or weighted, and do not yield tract housing totals. |
| Housing-point locations | Full supplied tract housing-record counts for the selected type, or the sum of single-family and multi-family counts. Sampled display markers are not used as the inventory. |
| Changed-parcel land use | Most common named category among changing parcels assigned by representative point, by parcel count. Exact ties are resolved alphabetically and flagged in support data. No assigned changed parcel means missing. |
| Fixed hotspots | Preserved named category from the fixed source definition. Selected category names form a condition; codes have no ordinal high/low meaning. |

New assignments use the packaged prepared geometries in EPSG:3857. A point exactly on a tract boundary remains unassigned under strict `within`; ambiguities are resolved deterministically and recorded. The original housing-unit-change tract allocation is retained rather than overwritten by a reallocation using simplified web geometries. Changed-parcel land use therefore must not be described as the county's full land inventory. Housing records must not be described as independently verified dwelling-unit totals. The population-density source does not establish its denominator, so the application retains “source density unit.”

## Numeric and categorical conditions

For each numeric input, collect valid countywide values and compute the chosen percentile with linear interpolation at ordered position `(n − 1) × p`. Here `p` is the percentile as a fraction. A finite source value meets the condition when it is **greater than or equal to the unrounded cutoff**. Display rounding does not affect classification. Ties can make the passing share exceed the nominal upper tail.

The percentile applies to numeric inputs only. Each numeric input has a separate cutoff in its own units. The same countywide reference applies in every selected location. For a categorical input, a valid category meets the condition if it belongs to the user's selected set of names. Category codes are never passed through the percentile calculation. Unknown source categories, valid zero numeric values, and missing values are distinct states.

For each tract, preserve each input's source value, period, cutoff or chosen categories, condition flag, and count of conditions met. Evaluate the rule only when every selected input is valid:

- **All:** the condition count equals the number of selected inputs.
- **Any:** the condition count is at least one.
- **At least N:** the condition count is at least the selected integer N.

Incomplete tracts are excluded under every rule, including Any. The match share is `matching complete tracts / complete tracts in the selected scope`. No complete denominator gives an unavailable share, not zero. Per-input summaries can use more valid records than the complete-case screen.

## Duplicate fields and dependent measures

The workflow rejects repeated exact source fields. Examples include tract precipitation and its kriging counterpart at the same warming threshold, or single-family housing-point screening and the single-family tract-record field. Keep one representation when they resolve to the same field. A dedicated precipitation-change input can likewise duplicate the primary precipitation selection when that selection already uses the supplied change field.

Different related fields may coexist, with dependence explained. Housing grids, source record counts, housing growth, and demographic variables can be related; CHEI may overlap with selected component measures. The condition count does not assign weights, establish independence, or estimate probability. Increasing the number of related inputs can make the result more sensitive to one underlying topic.

## Scope, periods, and fixed products

ZIP/precinct scope membership retains whole tracts and other source features intersecting the supplied boundary, including touches. It does not clip or allocate values by land area or population. Cross-boundary features can occur in several screens, so their results are not additive. Point-layer inspection uses the relevant source point geography; combined screening always uses the documented tract representation.

Global warming thresholds are relative to 1850–1899, with associated 20-year precipitation windows, and have no assigned calendar date. Community fields retain supported 2020, 2050, or change references. SVI and housing stock remain baseline-only. Combining these fields does not manufacture a synchronized future scenario. The median of tract changes need not equal the difference between two marginal year medians.

The fixed hotspot product retains its source definition: +2.5°C precipitation rounded to three decimals at or above 203.603 mm, household growth at or above 746, and SVI at or above 0.88386. Its eight categories remain unchanged when flexible cutoffs change. Selecting a fixed category in a combination tests membership in that existing product; it does not recalculate the hotspot. Household growth and housing-unit growth remain separate measures.

## Exports and validation scope

Combination CSVs retain the selected scope, fields, exact values, periods, numeric cutoffs or selected categories, rule, completeness, and matches. Filtering the on-screen table does not redefine the CSV's geographic scope. Reports may span several pages for larger combinations. The brief boundary graphic is for orientation; print pagination depends on the browser and chosen settings.

Use the current `qa/` reports to identify checks actually run. Useful commands include:

```bash
python scripts/validate_dashboard.py
python scripts/validate_expanded_indicators.py
python scripts/validate_overlap.py
python scripts/validate_expanded_overlap.py
python scripts/validate_model_bridge.py
python scripts/validate_basemap.py
```

Data validation checks source preservation and derived statistics. Pure-engine tests check numeric/category rules, ties, missingness, duplicate fields, and scope. Bokeh model validation checks embedded data, renderer references, and the detached default tile renderer. DOM/state tests check controls and workflow behavior with their documented bridge or mock. These checks do not establish that canvas rendering, responsive visual geometry, online tile delivery, or printed pagination were graphically verified. Historical screenshots and pass counts remain evidence only for their recorded release. Native controls and keyboard support do not constitute formal accessibility certification.

Rebuild instructions are in `README.md`. Original attribution and source descriptions remain in `ATTRIBUTION_AND_DATA_NOTES.md` and the layer reference. Relevant implementation and service references:

- [Bokeh embedding documentation](https://docs.bokeh.org/en/latest/docs/user_guide/output/embed.html)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
