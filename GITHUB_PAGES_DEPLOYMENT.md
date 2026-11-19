# Publish Expanded Indicators 3.1 on GitHub Pages

## Update the existing repository

1. Keep a commit or backup of the current published version.
2. Extract the ZIP and open its `Climate_Housing_Exposure_Index_Dashboard` folder.
3. Copy that folder's **contents** to the repository's publishing folder. Place `index.html` directly in that folder; do not publish only the ZIP or an extra enclosing directory.
4. Keep `.nojekyll`. Include `advanced_explorer.html` for the optional earlier interface. The second guided HTML is an equivalent compatibility copy.
5. Commit the files to the branch used by GitHub Pages.
6. In **Settings → Pages**, retain the intended publishing source. For branch-based publishing, choose the branch and folder containing `index.html`, such as `main` and `/(root)`.
7. Check the deployment status and open the address shown by GitHub. Refresh the browser cache if the previous interface remains visible.
8. Confirm the new five-step workflow and expanded catalogue. Try a numeric combination, a category input, and a change of matching rule. Inspect a tract, export a CSV, and preview a screening brief.

The delivered HTML is already built. GitHub Pages needs no Python build. Changes to `web/`, builders, or analytical code require a local rebuild and publication of the regenerated HTML. This archive does not deploy itself or configure a custom domain.

## Default map and optional online streets

The default embedded-boundary map requires no key and sends no external tile requests. Both guided and advanced builds have removed the former CARTO tile source. On a hosted HTTP(S) page, select the optional OpenStreetMap street background explicitly when desired. It uses the standard tile endpoint and displays linked OpenStreetMap attribution. Keep that attribution and the browser's normal referrer behavior; the service's [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) applies.

The local self-contained HTML disables online streets. Embedded boundaries, analytical geometry, values, charts, screening calculations, CSV export, and reports remain available without the street service. A locally opened file therefore needs neither API credentials nor an internet connection for its static workflow.

## Minimal publication and reproducibility

`index.html` and `.nojekyll` are sufficient for the guided application. `advanced_explorer.html` is needed only for the optional earlier-interface link. The remaining package files preserve source code, prepared data, methods, validation material, and user guidance.

`climate_housing_exposure_index_dashboard.html` is equivalent to `index.html` and can be distributed separately for local use. Rebuild from the project root with the commands in `README.md`; rebuild the advanced HTML separately with `build_advanced_dashboard.py`. Refresh package checksums after changing files.

GitHub Pages cannot run `server.py`. The optional viewport housing-point API requires a Python hosting environment. Static operation and full source tract-record screening do not require that API; the individual single-family point preview remains sampled.

Review the published site in the browsers and screen sizes intended for your audience. Model and DOM checks do not replace checking map rendering, responsive layout, and report pagination on that deployment.

Publishing reference: [Configure a GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
