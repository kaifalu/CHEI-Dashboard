# Expanded indicator combination screening

The guided checklist compares selected conditions on a common census-tract geography. It identifies where those conditions occur together. Numeric indicators use an explicitly displayed cutoff, while categorical indicators use the categories selected by the user. The screen does not create or recalculate the Climate-Housing Exposure Index (CHEI).

## Available indicator families

The checklist covers all 17 source indicator families used by the single-layer explorer. Some original layers contain points, grid cells, parcel categories, or a raster surface. These need a documented tract representation before they can be compared with tract attributes. Choosing such a family does not turn its original points, cells, or pixels into exact tract measurements.

| Checklist family | Source fields used by the screen | Meaning and reference period |
| --- | --- | --- |
| Extreme precipitation | `pr_15`, `pr_20`, `pr_25`, `pr_30`; or `sens_pct` for the climate-change comparison | Supplied tract extreme three-day precipitation, in millimeters, at the selected global warming threshold. The percentage comparison is +2.5°C relative to +1.5°C. |
| Climate model points | `point_pr_15`, `point_pr_20`, `point_pr_25`, `point_pr_30` | Arithmetic mean of supplied point values strictly inside each prepared tract. A tract with no model point remains missing. No nearest-point substitution or new interpolation is used. |
| Kriging surface context | Corresponding `pr_15`, `pr_20`, `pr_25`, or `pr_30` | Uses the existing tract precipitation attributes as a common-geography representation. These are not statistics newly extracted from raster pixels. |
| Precipitation change | `sens_pct` | Supplied percentage change at +2.5°C relative to +1.5°C. This has a different reference from 2020–2050 demographic change. |
| Social vulnerability | `SVI` | Supplied overall 2020 SVI percentile on a 0–1 scale. No future SVI is supplied. |
| Housing-unit growth | `parcel_hu_change` | Supplied projected housing-unit change from 2020 to 2050, allocated from changing parcels to tracts using parcel representative points. This does not describe all housing or parcels. The original prepared values are preserved. |
| Population | `hp_2020`, `hp_2050`, `pop_chg` | Baseline population, projected population, or projected change, in people. |
| Households | `hh_2020`, `hh_2050`, `hh_chg` | Baseline households, projected households, or projected change. Households and housing units are different measures. |
| Employment | `j_2020`, `j_2050`, `job_chg` | Baseline jobs, projected jobs, or projected change. |
| CHEI | `CHEI_2020`, `CHEI_2050`, `adapt_gap` | Supplied baseline, projected index, or index change. These values are not recalculated when a user changes the precipitation setting. |
| Population density | `pop_den` | Supplied baseline density attribute. The prepared files do not establish its area denominator, so the interface retains the source density unit. |
| Single-family housing records | `n_single_f` | Full supplied tract record count for the housing-stock baseline. A source record is not automatically an independently verified dwelling-unit count. |
| Multi-family housing records | `n_multi_fa` | Full supplied tract multi-family record count for the housing-stock baseline. A property record is not a count of all dwelling units within that property. |
| Housing grid concentration | `grid_sf_median`, `grid_mf_median`, `grid_total_median` | Median of full-count source housing records in the 1 km cells intersecting each tract. Whole cells can contribute to neighboring tracts; values are not clipped, area-weighted, or summed into tract totals. |
| Housing locations | `n_single_f`, `n_multi_fa`, `housing_total_records` | Uses complete tract source counts for single-family, multi-family, or combined records. The sampled point display is not used to estimate totals. |
| Fixed compound hotspots | `hotspot_combo` | A category condition using the original fixed precipitation/household-growth/SVI definition. The user chooses one or more category labels; the default is “All three high.” |
| Changed-parcel land use | `parcel_current_lu_mode`, `parcel_future_lu_mode` | Most common current or projected land-use category among the supplied changing parcels assigned to each prepared tract. Dominance is by parcel count, not land area or housing units. Ties are broken alphabetically and flagged in support data. This describes the changing-parcel subset, not all land in a tract. |

Climate values, SVI, housing stock, and demographic or housing projections keep their own reference periods. Warming thresholds refer to threshold-centered 20-year climate windows, not calendar years. Combining these fields is a spatial screening exercise; it does not assert that a warming threshold occurs in 2050 or project future social vulnerability.

For the detailed point, grid, and land-use derivations, source support counts, category inventory, and geometry limitations, see [EXPANDED_INDICATOR_METHODS.md](EXPANDED_INDICATOR_METHODS.md) and [expanded_indicator_fields.json](../data/expanded_indicator_fields.json).

## Numeric cutoffs and category selections

For a numeric condition, a percentile is calculated separately from that field's finite values across all Harris County tracts. The calculation uses linear interpolation at `(n − 1) × percentile / 100`. An 80th-percentile selection therefore produces different numeric cutoffs for precipitation, vulnerability, housing growth, and population. Countywide cutoffs stay fixed when the selected ZIP or precinct changes, allowing consistent location comparisons. The engine also supports explicitly supplied numeric cutoffs.

A tract meets a numeric condition when its original, unrounded value is **at or above** the cutoff. Equal values are included. Ties can therefore make more than the nominal top 20% meet an 80th-percentile condition. Zero is a valid numeric source value, and negative changes retain their sign. A numerically higher value is not automatically a worse outcome for every indicator; the chosen condition is a transparent screen, not a universal risk ranking.

A tract meets a categorical condition when its label belongs to the user's selected category list. Category labels do not have numeric ranks and never receive percentile cutoffs, numeric averages, or medians. For example, a land-use condition can be “Residential or Multiple,” while a hotspot condition can be “Hazard + SVI or All three high.” The land-use default is the most common available tract-mode label, currently “Residential,” and remains a visible, editable selection. Selecting every available land-use category retains all tracts with nonmissing land-use coverage for that condition.

The available land-use category inventory comes from the source parcels. A source category can be valid even if it is not the dominant category of any tract. Selecting such a category produces zero matches; it does not invent coverage or substitute another category. At least one category must be selected. Unknown labels are rejected with an explanation.

The matching rule applies to both numeric and category conditions:

- **All selected conditions:** retain tracts meeting every selected condition.
- **Any selected condition:** retain tracts meeting at least one selected condition.
- **At least N conditions:** retain tracts meeting at least the chosen number.

The map count describes the number of selected conditions met. It is not a weighted exposure score or a count of independent risks. Results change with the indicator checklist, warming setting, reference periods, housing type, selected categories, numeric cutoffs, and matching rule.

## Repeated source information

The same source field cannot be counted twice through different layer names. For example, tract precipitation and kriging context at the same warming threshold both use the corresponding `pr_` field. Similarly, the single-family housing-location representation and the single-family tract count both use `n_single_f`. The dashboard explains the duplicate and asks the user to choose one representation. The original representations remain available individually.

Different but related fields can be selected together, with an interpretation note. Climate model points and tract precipitation describe related precipitation information. Combined housing counts include single-family and multi-family records. CHEI is a supplied composite, and fixed hotspots already combine precipitation, household growth, and SVI. Their simultaneous selection supports comparison but does not provide independent confirmation of the same concept. No weights are fitted and no new composite CHEI is calculated.

## Missing values, geographic scope, and zero matches

For numeric indicators, missing, blank, boolean, nonnumeric, and nonfinite values are not converted to zero. For categories, nulls and blank labels remain missing. A literal source category named “Unknown” is a valid categorical label and is distinct from missing coverage.

A tract missing any selected factor is excluded from **every** matching rule, including “any,” and from the matched-share denominator. It remains visible as missing data. This complete-case rule keeps the denominator consistent across alternative rules. An empty complete-case denominator returns an unavailable share, not 0%.

Coverage differs materially across the added representations. In this prepared release, climate point averages cover 197 of 1,115 tracts, housing grid summaries cover 1,109 tracts, and changed-parcel land-use modes cover 787 tracts. Tracts without model points, intersecting source cells, or assigned changing parcels are not filled using zeros or neighboring data. Choosing several such factors can reduce the number of eligible tracts further. The selected-place missing and eligible counts are therefore part of the result, not incidental diagnostics.

ZIP and precinct selection retains whole intersecting tracts, including boundary touches. Counts, matched shares, ranges, medians, and category counts describe that screening set. They are not spatially allocated ZIP/precinct totals and use no population or area weighting. Countywide numeric thresholds are calculated before the scope restriction.

A zero-match result is valid. Users can deliberately test a different checklist, category selection, percentile, or matching rule. The dashboard does not silently relax choices to produce matches.

## Relationship to fixed compound hotspots

The original fixed classification uses rounded precipitation at +2.5°C of at least 203.603 mm, household growth of at least 746, and SVI of at least 0.88386. Its growth variable is **households**, not housing-unit growth. The category labels report which of these three fixed conditions are met.

Selecting the fixed hotspot family uses those existing labels as one categorical condition. It does not rerun the original definition under another warming threshold. Separately, numeric overlap screening uses the selected fields, current countywide percentile cutoffs, and unrounded comparisons. It should not be assumed to reproduce the fixed hotspot classification. Both the original fixed categories and supplied CHEI values are preserved.

## Engine interface

`web/overlap.js` is a pure JavaScript module, exposed as `CHEIOverlap` in the browser and as a CommonJS export. It reads column arrays and metadata without mutating them. Each factor uses an ID, optionally a period (`2020`, `2050`, `change`), warming threshold (`15`, `20`, `25`, `30`), housing type (`combined`, `single`, `multi`), selected category values, or a numeric cutoff. Derived field metadata is passed explicitly.

```js
const result = CHEIOverlap.screen(tractColumns, {
  metadata: expanded.metadata.fields,
  factors: [
    {id: 'precipitation', gmt: '25'},
    {id: 'svi'},
    {id: 'chei', period: '2050'},
    {id: 'housing_density', housing: 'combined'},
    {id: 'land_use', period: '2050', allowedValues: ['Residential']}
  ],
  percentile: 80,
  rule: 'atleast',
  minCount: 3,
  indices: selectedTractIndices
});
```

`screen` returns factor descriptors with `kind`, a human-readable `conditionLabel`, raw numeric cutoffs or selected category labels, per-tract values and flags, matched and missing indices, count distributions, combinations, and selected-place summaries. Category values remain strings in the output. Numeric factor statistics retain ranges and medians; category summaries contain counts by label and null numeric statistics. Invalid configurations return `ok: false` with an explanatory error.

The former six-factor engine limit is removed. The engine supports up to 64 distinct conditions, and the current interface exposes the 17 source families. Combination patterns use strings instead of relying on a 32-bit bitmask, so larger selections cannot collapse into the same bitmask. Exact duplicate source fields remain prohibited even when their family labels differ.

## Verification

Run these independent checks from the package root:

```sh
python scripts/validate_overlap.py
python scripts/validate_expanded_overlap.py
```

The legacy numerical check covers 160 source-data configurations and 53 synthetic assertions, including warming thresholds, population periods, numeric cutoffs, geographic subsets, ties, negative values, missing-data exclusion, and source-array preservation. Its report is [overlap_validation.json](../qa/overlap_validation.json).

The expanded check covers 73 independently calculated source-data configurations and 123 synthetic assertions across all 17 source families. It verifies mixed numeric/category comparisons, both categorical families, period and housing-type mappings, sparse coverage, county/ZIP/precinct/tract/empty scopes, all matching rules, category summaries, valid categories with zero matches, malformed selections, exact-alias rejection, and more than 30 simultaneous conditions. Its report is [expanded_overlap_validation.json](../qa/expanded_overlap_validation.json).

Source-data aggregation has a separate independent check in `scripts/validate_expanded_indicators.py`, with results in [expanded_data_validation.json](../qa/expanded_data_validation.json). These computation checks do not by themselves establish visual browser behavior.
