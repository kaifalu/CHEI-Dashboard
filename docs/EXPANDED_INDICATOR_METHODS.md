# Expanded indicator combinations: data methods

The combination workflow uses census tracts as its common comparison geography. Its 17 indicator families represent all 26 original map-layer keys. Some map layers are alternative representations of the same underlying variable. A point map, a continuous climate surface, or a parcel map therefore needs an explicitly documented tract representation before it can be combined with tract indicators.

The original supplied analytical values remain unchanged. The additional summaries described here are prepared by [`expanded_indicators.py`](../expanded_indicators.py), stored with metadata in [`data/expanded_indicator_fields.json`](../data/expanded_indicator_fields.json), and embedded in the dashboard during its build.

## Layer coverage

| Combination family | Original map-layer keys | Tract values used |
| --- | --- | --- |
| Climate-housing exposure index | `chei_2020`, `chei_2050`, `adapt_gap` | Supplied `CHEI_2020`, `CHEI_2050`, or `adapt_gap` |
| Compound hotspots | `hotspot` | Existing fixed `hotspot_combo` category |
| Extreme precipitation | `pr_tract` | Supplied `pr_15`, `pr_20`, `pr_25`, or `pr_30` |
| Precipitation change | `pr_change` | Supplied `sens_pct`, for +2.5°C relative to +1.5°C |
| Climate model points | `pr_points` | Mean of model-point precipitation values strictly within each tract, separately for each warming threshold |
| Climate surface | `pr_kriging` | Corresponding supplied tract precipitation field; no raster-pixel extraction |
| Population | `pop_2020`, `pop_2050`, `pop_growth` | Supplied `hp_2020`, `hp_2050`, or `pop_chg` |
| Households | `hh_2020`, `hh_2050`, `hh_growth` | Supplied `hh_2020`, `hh_2050`, or `hh_chg` |
| Employment | `jobs_2020`, `jobs_2050`, `jobs_growth` | Supplied `j_2020`, `j_2050`, or `job_chg` |
| Social vulnerability | `svi` | Supplied `SVI` |
| Population density | `pop_density` | Supplied `pop_den` |
| Single-family housing records | `sf_tract` | Supplied `n_single_f` |
| Multi-family housing records | `mf_tract` | Supplied `n_multi_fa` |
| Housing grid concentration | `housing_density` | Median whole-cell housing count among cells intersecting each tract; single-family, multi-family, or combined |
| Housing locations | `housing_points` | Full supplied tract record counts: `n_single_f`, `n_multi_fa`, or their sum |
| Housing-unit growth | `parcel_hu_change` | Original `parcel_hu_change`, preserved without recalculation |
| Changed-parcel land use | `parcel_current_lu`, `parcel_future_lu` | Most common assigned changed-parcel category in each tract, for 2020 or 2050 |

The machine-readable `metadata.layer_mapping` and `metadata.layer_families` entries preserve the same correspondence. Representation aliases should not be counted twice as independent evidence. The climate surface and tract precipitation can use the same field; the housing-location single-family or multi-family choice can also duplicate the corresponding housing-record family.

## New tract summaries

### Climate model points

`point_pr_15`, `point_pr_20`, `point_pr_25`, and `point_pr_30` contain arithmetic means of finite `precip_mm` values from `climate_points.csv`. Points are assigned only when strictly within a prepared tract boundary. A point exactly on a boundary is unassigned. If overlapping source tract geometries create multiple matches, the smallest GEOID is used deterministically and the ambiguity is reported.

A tract with no valid model point has a missing value. It receives neither a nearby point nor the separately supplied tract precipitation value. The `*_n` support fields record the number of finite points used. Each warming threshold has 246 source points and values in 197 of the 1,115 tracts; 918 tracts have no model-point mean. This sparse coverage is a property of the source representation and must remain visible when interpreting a combined result.

The supplied source description defines precipitation as the average three-day extreme-event precipitation sum within the associated 20-year climate window. Global warming thresholds are relative to 1850–1899 and have no assigned calendar year in this dashboard. See [`CHEI_Dashboard_Layer_Source_Descriptions.txt`](CHEI_Dashboard_Layer_Source_Descriptions.txt).

### Housing grid concentration

`grid_sf_median`, `grid_mf_median`, and `grid_total_median` are the medians of finite `sf_count`, `mf_count`, and `total_count` values among all source cells intersecting a tract. The grid contains 4,863 full-count 1 km cells. Touching cells are included. Cells are used whole, can be shared by neighboring tracts, and are not clipped, area-weighted, or summed into a tract total.

The resulting unit is source records per 1 km cell, expressed as a median. This is a concentration screen, not a newly estimated tract housing total. `grid_intersect_count` and each median field's `*_n` value describe support. There are valid grid medians for 1,109 tracts and missing values for six.

### Housing locations

`housing_total_records` is the sum of the existing tract attributes `n_single_f` and `n_multi_fa`; if either operand is missing, the sum is missing. The source counts are used directly for separate housing-type choices. The dashboard's sampled point markers are never counted as the complete inventory. Source housing records should not be interpreted as independently verified dwelling-unit totals.

### Changed-parcel land use

`parcel_current_lu_mode` and `parcel_future_lu_mode` retain text categories. Each supplied changed parcel is assigned by its representative point using the same strict within-boundary rule. The tract value is the most frequent category by assigned parcel count. It is not weighted by parcel area or housing units and does not describe all land in the tract.

Alphabetical order resolves an exact tie, with the corresponding `*_tied` field retaining the tie flag. There are 19 tied current modes and 12 tied future modes. A tract with no assigned changed parcel has a missing category, not an invented “Unknown” category. An “Unknown” label supplied on an actual parcel is retained. Missing or blank parcel labels are also normalized to “Unknown.”

Of 20,344 source changed parcels, 20,342 are assigned to prepared tracts and two remain unassigned. Both land-use summaries have values for 787 tracts and missing values for 328. Metadata includes the complete source-category inventory and the categories that actually occur as tract modes. The default explicit category condition is Residential, the most common tract mode in each period. Category membership, not a numeric percentile, determines whether a tract meets a land-use condition.

## Preservation, missing data, and validation

All additional geometry operations use the packaged prepared web geometries in EPSG:3857. A diagnostic reallocation of parcel housing change differs from the previously supplied tract allocation in four tracts, by at most three units. Both allocations sum to 333,617 units countywide. This small prepared-versus-original geometry difference is reported in metadata; the original `parcel_hu_change` is kept unchanged.

Missing values remain JSON `null`, and valid numeric zeros remain zero. The support field `parcel_count = 0` means no assigned record in the changed-parcel subset, not no housing or no land use. Period labels and geometry-support notes travel with every added field. Combining a warming threshold, a 2020 vulnerability indicator, and a 2020–2050 projection does not create a newly synchronized future scenario.

Run these commands from the package root in an environment with the declared GIS dependencies:

```bash
python expanded_indicators.py
python scripts/validate_expanded_indicators.py
```

The independent validation uses direct vectorized Shapely predicates and independently calculated Pandas statistics rather than the production spatial-index implementation. The packaged validation report, [`qa/expanded_data_validation.json`](../qa/expanded_data_validation.json), records 38 passing checks and 23,415 compared values across 21 derived/support columns and 1,115 tracts. Synthetic fixtures cover valid zeros, missing observations, boundary points, shared grid cells, missing count operands, categorical ties, and unchanged original fields. Input-file SHA-256 checks confirm that the preparation leaves the supplied analytical data unchanged.
