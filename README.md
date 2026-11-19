# Climate-Housing Exposure Index — Expanded Indicators 3.1

https://kaifalu.github.io/CHEI-Dashboard/

A guided explorer for Harris County, Texas. Select a place, choose precipitation conditions, and explore one layer or combine indicators in a common census-tract screen. The expanded checklist offers **17 indicator families**, covering the **26 original analytical layer keys** through supported periods and housing types.

## Open the dashboard

Open `index.html` in a current desktop browser, or publish the extracted project folder's contents through GitHub Pages. `climate_housing_exposure_index_dashboard.html` is an equivalent, data-self-contained copy. The guided application includes its analytical data, map geometry, JavaScript, Bokeh resources, and charts. It needs no Python, GIS installation, account, API key, or backend for static use.

The default map uses **embedded boundaries** and works offline. It does not request external map tiles. On a hosted HTTP(S) page, users can explicitly enable an optional OpenStreetMap street background; this requires internet access and displays source attribution. Online streets are disabled when the HTML is opened as a local file. Neither guided nor advanced maps use the former CARTO tile service. See [basemap notes](docs/BASEMAP_NOTES.md).

`advanced_explorer.html` retains the earlier full-controls interface. Its optional link requires that file beside the guided HTML; the guided explorer remains usable without it.

## Follow five steps

1. **Location:** choose Harris County, a five-digit ZIP, Commissioner Precinct 1–4, or an 11-digit census-tract GEOID.
2. **Precipitation:** select a warming condition, the supplied +2.5°C versus +1.5°C change, or leave precipitation out.
3. **Indicators:** choose **Combine indicators**, search or expand the grouped checklist, and select at least two compatible inputs. Choose **Explore one layer** for a detailed individual view.
4. **Periods & rules:** review each input's own period and, where applicable, housing type. Select named categories for categorical inputs and a countywide high-value cutoff for numeric inputs. Choose All, Any, or At least N conditions.
5. **Results:** review the map, selected input values, chart, coverage, and explanations. Inspect tracts, download the screening CSV, or use **Print screening brief**.

Only one selection step is editable at a time. Back and completed-step buttons let users revise a question. Read [GUIDED_USER_GUIDE.md](GUIDED_USER_GUIDE.md) for a walkthrough, indicator descriptions, and examples.

## Expanded choices and interpretation

The checklist covers tract precipitation, model-point precipitation, the tract counterpart of the kriging display, warming-related precipitation change, SVI, housing-unit growth, population, households, employment, supplied CHEI, population density, single-family and multi-family tract records, housing-grid concentration, housing-point records, fixed hotspot patterns, and changed-parcel land use.

Each **numeric** input is compared with its own countywide percentile cutoff; the default is the 80th percentile. Values equal to the unrounded cutoff count as high. **Categorical** inputs use explicitly selected hotspot or land-use names, without ranking category codes. The combined map counts conditions met and identifies tracts satisfying the selected All/Any/At least N rule. A tract missing any selected input is excluded from the evaluated denominator, including for the Any rule.

Exact duplicate source fields cannot be counted twice. Related but different measures may be selected together, with their dependence explained. This count is an exploratory screen, not a new weighted CHEI or a probability. ZIP/precinct screens retain whole intersecting tracts and are not official area aggregates.

**Warming is not a year.** +1.5, +2.0, +2.5, and +3.0°C describe global mean temperature conditions relative to 1850–1899. Precipitation describes modeled extreme three-day totals in associated 20-year climate windows. Community and housing fields have separate 2020, 2050, or change references. Combining them does not assign a warming threshold to 2050. Supplied CHEI and fixed hotspot definitions are not recalculated from checklist settings.

## Package contents and rebuild

- `index.html` and the compatibility HTML: ready-to-publish guided application.
- `advanced_explorer.html`: earlier interface with the revised map background.
- `build_dashboard.py`, `guided_builder.py`, `basemap.py`, and `web/`: application source.
- `data/`: supplied processed data, boundary membership, and documented derived tract fields for expanded combinations.
- `GUIDED_USER_GUIDE.md`, `TECHNICAL_NOTES.md`, `GITHUB_PAGES_DEPLOYMENT.md`, and `REVISION_NOTES.md`: current guidance.
- `scripts/` and `qa/`: validation tools and release-specific records.
- `SOURCE_DATA_CHECKSUMS.sha256` and `checksums.sha256`: source-data and package integrity manifests.

The original raw file geodatabase is not included. The processed data support rebuilding the HTML. Run from the project root:

```bash
python -m pip install -r requirements.txt
python build_dashboard.py
python scripts/validate_dashboard.py
```

Editing `web/` requires rebuilding the HTML. `build_dashboard.py` does not replace `advanced_explorer.html`; use `build_advanced_dashboard.py` for that file. Refresh package checksums after changing generated files. See [TECHNICAL_NOTES.md](TECHNICAL_NOTES.md) for aggregation methods and validation scope.

## Optional service and responsible use

`python server.py` serves the application at `http://127.0.0.1:8050` and enables the optional viewport housing-point service. GitHub Pages cannot run this Python service. The standalone single-family point display is sampled; **combined housing-point screening uses supplied full tract record counts**, not sampled markers. These records are not independently verified dwelling-unit totals.

Use the dashboard for research, education, and exploratory planning. It does not provide event forecasts, property flood certificates, causal conclusions, or an allocation formula. Read Data & methods, Terms of use, and `ATTRIBUTION_AND_DATA_NOTES.md` with the selected layer's limitations.

## Verification scope

Consult `qa/README.md` and current release reports for the checks actually executed. Data checks, Bokeh model checks, and DOM/state tests address different parts of the application. A DOM test using a Bokeh bridge mock does not verify canvas rendering, responsive visual geometry, online tile delivery, or printed pagination. Earlier screenshots and pass counts describe their recorded release and should not be treated as visual certification of this revision.

Contact: Kaifa Lu · CECREH · Kaifa.Lu@ttu.edu.
