# Validation evidence for Expanded Indicators 3.1

## Current release checks

| Record | What it establishes |
| --- | --- |
| `data_validation.json` | Original source counts and hashes, fixed hotspot definitions, valid geographic membership, inline assets, updated workflow content, and identical guided HTML copies. |
| `expanded_data_validation.json` | Independent spatial and statistical checks of all 21 derived/support columns, their nulls, coverage, categories, and mapping to the original layers. |
| `overlap_validation.json` | Regression checks of the original numeric combinations against source data, with explicit rules, percentiles, ties, missing values, and unchanged input arrays. |
| `expanded_overlap_validation.json` | Independent numeric and category combinations across all 17 families, sparse coverage, exact-field duplicate rejection, related-input warnings, and selections beyond six inputs. |
| `combined_view_validation.json` | Mixed numeric/category rendering and exports, escaped text, raw CSV values, report content, and compact presentation of large selections. |
| `dom_workflow/validation.json` | Real native interface JavaScript executed in jsdom, with original and derived data and an explicitly mocked Bokeh-facing bridge. Exercises navigation, catalog controls, dependencies, category choices, periods/types, rules, map-tab state, CSV, report HTML, and background selection. |
| `model_validation.json` | Actual embedded Bokeh Document deserialization and integrity, all expanded columns and original numeric attributes, metadata, native model references, and the detached optional background renderer. |
| `basemap_validation.json` | Actual model inspection of both guided HTML names and the advanced explorer: no attached tile renderer by default, no CARTO tile source, and one hidden, detached optional OpenStreetMap source. |
| `syntax_validation.json` | Python parsing and JavaScript syntax, including the composed guided application. |
| `flexible_workflow/validation.json` | The graphical browser check is **not run** in this environment. It is not a passing test. |

The DOM harness verifies control behavior and computed state. It does not render the Bokeh canvas or measure CSS geometry. The real model checks complement that mock by checking the serialized graph and data, but do not execute BokehJS in a browser.

No current record establishes graphical canvas rendering, live street-tile availability, responsive layout geometry, or actual print pagination. Those checks require a browser with the necessary execution access. The prior release established the environment's browser-launch restriction; this release did not bypass or retry it. No GitHub repository or public deployment was changed.

## Reproduce the checks

From the extracted project root, install the ordinary runtime dependencies from `requirements.txt`, then run:

```bash
python scripts/validate_dashboard.py
python scripts/validate_expanded_indicators.py
python scripts/validate_overlap.py
python scripts/validate_expanded_overlap.py
python scripts/validate_model_bridge.py
python scripts/validate_basemap.py
node scripts/validate_combined_view.js
```

The DOM test uses Node.js and an optional, separate jsdom installation. Keeping these QA dependencies outside the project avoids shipping them with GitHub Pages:

```bash
npm install --prefix ../chei-dom-qa jsdom --no-audit --no-fund
CHEI_JSDOM_PATH="$(pwd)/../chei-dom-qa/node_modules/jsdom" node scripts/validate_workflow_dom.cjs
```

In an environment that permits launching Chromium, the optional browser script exercises the main numeric workflow, retained single-layer paths, and responsive views:

```bash
python -m pip install playwright
python -m playwright install chromium
python scripts/validate_flexible_workflow.py
```

Set `CHEI_CHROMIUM_PATH` to an existing Chromium executable if necessary. This optional script blocks external requests and records `not_run` if the browser cannot start. Its updated catalog selectors were syntax-checked, but the browser script was not executed for this release. Additional visual review should include a category combination, a large selection, the optional street background on a hosted page, and the print preview.

## Historical records

Screenshots, old browser scenarios, sample print briefs, and server checks under `previous_release/` describe the earlier Guided Workflow 2.0 package. `previous_flexible_3_0/` retains the prior release's browser-launch limitation. None establish graphical success for this revision. Earlier interface screenshots under `screenshots/` are also historical.

Validation checks software behavior and source preservation. It does not establish the scientific accuracy of the supplied projections, official ZIP or precinct aggregates, formal accessibility certification, or identical rendering in every browser.
