# Expanded Indicators 3.1: a first-time user's guide

## Start with a question

This Harris County dashboard helps you examine extreme precipitation, community change, housing, and social vulnerability in the same place. Explore one indicator in detail or combine several conditions to see where they coincide. No GIS software or programming experience is required.

Open `index.html` or the supplied self-contained HTML in a browser. The application, analytical data, and default boundary map work offline. On a hosted website, the optional street background requires internet access. Complete the five steps below; only the controls for the current step are open.

## 1. Location — where would you like to look?

Choose the whole county, a ZIP code, a Commissioner precinct, or a census tract. ZIP codes need five digits, such as `77007`. Precincts are numbered 1–4. Census tracts need the full 11-digit GEOID, such as `48201342001`. The form identifies unavailable codes before you continue.

ZIP and precinct screens retain whole census tracts that intersect the supplied boundary, including boundary touches. Some selected tracts extend outside the chosen place. The summaries are useful for screening, but are not official ZIP/precinct totals or weighted averages.

## 2. Precipitation — which climate condition should be included?

Choose one of three paths:

- **One warming condition:** +1.5°C, +2.0°C, +2.5°C, or +3.0°C.
- **Change between warming conditions:** the supplied percentage change at +2.5°C relative to +1.5°C.
- **Leave precipitation out:** continue with community and housing inputs.

A precipitation condition can coexist with other topics. Step 3 determines which indicators actually enter your combination; unavailable precipitation choices explain which Step 2 setting is needed. The separate **Precipitation change · +2.5°C vs +1.5°C** input is also available as a fixed comparison in Step 3. It keeps that comparison regardless of Step 2, including when Step 2 leaves the primary precipitation input out.

**What does +2.5°C mean?** It describes an increase in global mean temperature relative to 1850–1899. It is not a local air temperature or a calendar date. The precipitation layers describe modeled extreme three-day totals in associated 20-year windows. They do not predict the next storm or establish that +2.5°C occurs in 2050.

## 3. Indicators — explore one layer or combine several

### Combine indicators

Check at least two compatible inputs. The grouped catalogue has a search and an option to show all choices, so you can find an indicator without opening every topic. It contains **17 families**, representing all **26 original analytical layer keys** through period and housing-type choices.

| Indicator family | What enters a combination |
|---|---|
| Extreme precipitation | Supplied tract precipitation for the selected warming condition, or the selected supplied warming-change measure |
| Precipitation · model-point mean | Mean of model points inside each tract; a tract with no points remains missing |
| Precipitation · surface tract context | The corresponding supplied tract precipitation used to summarize the surface; no raster-pixel extraction |
| Precipitation change · +2.5°C vs +1.5°C | Supplied fixed percentage change, independent of Step 2 |
| Social vulnerability | Overall SVI, 2020 |
| Housing-unit growth | Supplied tract allocation of housing-unit change from changing parcels, 2020–2050 |
| Population | Choose 2020, 2050, or projected change |
| Households | Choose 2020, 2050, or projected change |
| Employment | Choose 2020, 2050, or projected change |
| Climate-Housing Exposure Index (CHEI) | Choose 2020, 2050, or the supplied change |
| Population density | Supplied baseline tract density; the source does not establish its denominator unit |
| Single-family housing records | Supplied 2020 tract count of single-family housing records |
| Multi-family housing records | Supplied 2020 tract count of multi-family housing records |
| Housing concentration · 1 km grid | Median full-cell housing count among 1 km cells intersecting a tract; choose housing type |
| Housing locations · tract summary | Full source tract record counts for the chosen housing type, rather than sampled map markers |
| Fixed compound hotspots | One or more named categories from the supplied fixed three-factor definition |
| Land use · changed parcels | One or more named dominant categories among assigned changing parcels; choose current or projected land use |

Every combination is evaluated on **census tracts**. Point, grid, and parcel inputs use the clearly described tract summaries above. A grid median is not a tract housing total. Housing records, housing units, and households are different measures. Land-use dominance is by changed-parcel count, not land area, and does not describe the complete parcel inventory.

You cannot count the same source field twice. For example, tract precipitation and the kriging counterpart at the same warming condition use the same tract field; keep one. Likewise, the single-family setting of housing-point records duplicates the single-family tract-record input. Different but related measures can coexist, but they are not independent evidence. CHEI and its components may also overlap conceptually.

### Explore one layer

Choose this mode for original point, tract, grid, parcel, or surface displays and their detailed explanations. The individual display retains its source geography. For example, the point map shows model points, while the combined version uses a mean within each tract.

The supplied CHEI is not recalculated for Step 2's warming selection. Fixed hotspot patterns retain their source definition: +2.5°C precipitation, 2020–2050 household growth, and 2020 SVI. Their explanations identify the actual inputs.

## 4. Periods & rules — define each condition

### Review each input separately

Choose a supported period for each selected family. Population, households, employment, and CHEI offer their supplied baseline, projection, or change. Land use offers current or projected categories. Housing-grid and housing-point families offer supported housing types. SVI and housing stock remain at their baseline; housing-unit growth remains a 2020–2050 change. Precipitation retains its warming condition.

There is no single year that updates all datasets at once. Combining a projected population with a warming condition is a screening choice, not a claim that the two occur simultaneously.

### Numeric conditions: define “high”

Numeric inputs default to **at or above their own countywide 80th percentile**. Each cutoff uses that input's units and valid countywide values. It remains unchanged when you select a different ZIP or precinct. Values equal to the unrounded cutoff count as high; ties may make the high group larger than the nominal upper share.

You may change the percentile to test sensitivity. A high population count describes concentration; high projected change describes growth. Neither automatically means that a place is unsafe or that growth is harmful.

### Category conditions: choose names

For fixed hotspot patterns and changed-parcel land use, select **one or more named categories**. A tract meets that input's condition when its category is among your selections. Category codes are not ranked by percentile. A valid category such as a hotspot pattern with no high source factors is different from missing data.

### Choose how conditions combine

- **All:** every selected numeric or category condition must be met.
- **Any:** at least one selected condition must be met.
- **At least N:** the chosen number of conditions must be met, such as three out of four.

A tract needs valid data for **every selected input** to enter the evaluated denominator, even under Any. Missing values are not treated as zero, low values, or failed categories. Adding model-point precipitation or changed-parcel land use can reduce coverage considerably; review the displayed coverage before interpreting the matches.

## 5. Results — read the evidence in order

Confirm the location, selected inputs, their reference periods, and the matching rule first.

**Map and input views.** The combined map shows the number of conditions met and identifies tracts satisfying your rule. Individual input views retain the combination and geographic focus. The count is a screening result, not a new CHEI or flood probability.

**Summary and chart.** Review evaluated tracts, incomplete records, and matches. The match share uses complete tracts in the selected location as its denominator. An individual input may have more valid records than the complete-case combination.

**Tract inspection.** Inspect a tract's source values, category names, and conditions met. This does not replace the selected ZIP or precinct. Use the explicit location-changing action only if you want to focus the workflow on that tract.

**Table and CSV.** A table filter helps inspect matches, while the CSV preserves the selected scope and its screening records. Keep source fields, exact values, reference periods, numerical cutoffs or selected categories, rule, and coverage information with the export.

**Explanation.** Read the source and aggregation notes. Zero matching tracts means no complete tract satisfies this particular rule. No complete tracts means the combination cannot be evaluated there. Neither result demonstrates an absence of climate exposure.

## Two examples to try

**Precipitation, vulnerability, housing growth, and population:** choose ZIP `77007`, +2.5°C, and the four corresponding inputs. Select 2050 population, the 80th percentile, and All. Review coverage and matches. If the result is empty, At least three asks a broader question; it does not invalidate the stricter result.

**Land-use context with community change:** leave precipitation out, then combine changed-parcel land use, household growth, and housing-unit growth. Select the projected land-use period and a named category offered by the data. Choose numeric cutoffs and a rule, then inspect the changed-parcel coverage. The result describes tracts with that dominant category among changing parcels, not the land use of every parcel.

These are control demonstrations, not recommended thresholds for investment or policy decisions. Other applications include adaptation discussions, infrastructure and housing-capacity review, classroom exercises, and sensitivity analysis. Use local drainage, infrastructure, housing, and community evidence to investigate findings further.

## Map background, printing, and revising choices

**Embedded boundaries** is the default background. It needs no API key or internet connection. Hosted HTTP(S) pages can offer **OpenStreetMap streets** as an explicit online choice with attribution. The local HTML keeps online streets disabled. Street-service availability does not control analytical results.

Use **Print screening brief**, then **Print / Save as PDF**. Allow the report tab if the browser blocks pop-ups. Preview the result: larger combinations can span several pages, and browser settings affect pagination. The report's boundary graphic provides orientation, not another thematic risk surface.

Use Back, Edit selections, or a completed step to revise the question. Review the summary after changing an earlier choice. Starting a new exploration clears the current path.

## Troubleshooting

- **Next is unavailable:** complete the current inputs. A combination needs at least two compatible factors and category inputs need a named selection. Remove any repeated source field identified by the message.
- **An input is unavailable:** read its prerequisite. Model-point and surface-context inputs require a single warming threshold in Step 2. The separate fixed precipitation-change input retains its own +2.5°C versus +1.5°C comparison.
- **A period is missing:** that period was not supplied for the chosen input. The dashboard does not invent future SVI or arbitrary warming-change pairs.
- **Many tracts are incomplete:** inspect coverage. No model points or assigned changing parcels creates missing data for those derived inputs; it does not imply zero exposure or zero housing.
- **Housing markers differ from combination counts:** the static single-family point display is sampled. The combination uses full supplied tract records; grid concentration uses full source cell counts.
- **An old interface or watermark remains after publication:** confirm that the rebuilt HTML was published and refresh the browser cache. The revised default map uses no external tiles.

The earlier full-controls interface is available through the Advanced explorer link when `advanced_explorer.html` is present. Historical screenshots describe their recorded release.

Contact: Kaifa Lu · CECREH · Kaifa.Lu@ttu.edu.
