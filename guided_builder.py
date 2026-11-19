#!/usr/bin/env python3
"""Compose the guided static site around the preserved Bokeh analytical engine.

Run ``python build_dashboard.py``. All assets are embedded in the two HTML
outputs. Source analytical tables are unchanged. Geometry membership is an
intersection screen (not a spatially allocated ZIP/precinct aggregate).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
from bokeh.embed import components
from bokeh.models import ColumnDataSource, InlineStyleSheet, Model
from bokeh.resources import INLINE

ROOT = Path(__file__).resolve().parent


def _members(features: gpd.GeoDataFrame, boundaries: gpd.GeoDataFrame) -> list[list[int]]:
    """Use the same intersects relationship as the previous reporting workflow."""
    return [sorted(map(int, features.sindex.query(g, predicate='intersects'))) for g in boundaries.geometry]


def _safe_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).replace('</', '<\\/')


def render_guided_dashboard(v: dict[str, Any]) -> None:
    """Create responsive native HTML steps plus a linked map in a single document."""
    # Stable names provide a documented JS bridge; no dependence on generated IDs.
    for key, obj in v.items():
        if isinstance(obj, Model) and obj.name is None:
            obj.name = 'engine_' + key
    plot = v['map_plot']
    plot.name = 'guided_map'
    plot.width = None
    plot.height = 550
    plot.sizing_mode = 'stretch_width'
    plot.toolbar_location = 'above'
    plot.title.text = ''
    plot.min_border = 0
    plot.margin = 0

    # These sources are populated by the guide, keeping the selected boundary
    # independent of any individual tract the user inspects on the map.
    scope_mask = ColumnDataSource({'xs': [], 'ys': []}, name='guided_scope_mask')
    mask_renderer = plot.multi_polygons(xs='xs', ys='ys', source=scope_mask,
        fill_color='#F4F7F9', fill_alpha=.77, line_alpha=0,
        level='overlay', name='guided_scope_mask_renderer')
    scope_boundary = ColumnDataSource({'xs': [], 'ys': []}, name='guided_scope_boundary')
    boundary_renderer = plot.multi_polygons(xs='xs', ys='ys', source=scope_boundary,
        fill_alpha=0, line_color='#0D5965', line_width=3.0,
        level='overlay', name='guided_scope_boundary_renderer')
    inspected = ColumnDataSource({'xs': [], 'ys': []}, name='guided_inspected_tract')
    plot.multi_polygons(xs='xs', ys='ys', source=inspected, fill_alpha=0,
        line_color='#B76B10', line_width=3, level='overlay', name='guided_inspected_renderer')

    # An independent outline marks matches to the user-selected overlap rule.
    # It does not replace the existing source CHEI or fixed hotspot attributes.
    screen_matches = ColumnDataSource({'xs': [], 'ys': []}, name='guided_screen_matches')
    plot.multi_polygons(xs='xs', ys='ys', source=screen_matches, fill_alpha=0,
        line_color='#C57B13', line_width=2.2, line_alpha=.95,
        level='overlay', name='guided_screen_matches_renderer')

    # References used by the native UI but not necessarily by a renderer must
    # belong to the same document. A tiny, invisible metadata model holds them.
    bridge = ColumnDataSource({'ready': [1]}, name='guided_bridge')
    needed = {"update_callback", "init_trigger", "zipcode_source", "precinct_source",
        "county_source", "all_zip_renderer", "all_precinct_renderer", "basemap_renderer"}
    # The analytical update callback already references all data and controls.
    # Never retain the old Row/Column parents or their navigation callback.
    bridge.tags = [{k: v[k] for k in needed}]
    # Include the bridge as a non-visible reference from a renderer source tag.
    scope_boundary.tags = [bridge]

    print('Preparing locator membership for the guided workflow…', flush=True)
    tracts, zips, precincts = v['tracts'], v['zipcodes'], v['precincts']
    parcels, grid = v['parcels'], v['housing_grid']
    # Compact index lists for every supported boundary, avoiding client-side
    # polygon-overlap approximations for tract/parcel/grid summaries.
    scope = {'county': {'all': {'tract': list(range(len(tracts))),
        'parcel': list(range(len(parcels))), 'grid': list(range(len(grid)))}}}
    for kind, b, code_field in [('tract', tracts, 'GEOID'), ('zip', zips, 'ZIP'), ('precinct', precincts, 'PCT_NO')]:
        memberships = {
            'tract': [[i] for i in range(len(b))] if kind == 'tract' else _members(tracts, b),
            'parcel': _members(parcels, b),
            'grid': _members(grid, b),
        }
        scope[kind] = {}
        for i, r in b.iterrows():
            # Input indices are reset by the GeoJSON reader.
            j = int(i)
            code = str(int(r[code_field])) if kind == 'precinct' else str(r[code_field])
            scope[kind][code] = {g: rows[j] for g, rows in memberships.items()}
    (ROOT / 'data' / 'guided_scope_membership.json').write_text(_safe_json(scope), encoding='utf-8')

    def locations(b, field, label):
        result=[]
        for i, r in b.iterrows():
            code=str(int(r[field])) if field=='PCT_NO' else str(r[field])
            subtitle=str(r.get('POSTAL', '')) if field=='ZIP' else str(r.get('NAME', '')) if field=='GEOID' else ''
            result.append({'code':code,'index':int(i),'label':f'{label} {code}',
                'subtitle':subtitle,'bounds':[float(x) for x in r.geometry.bounds]})
        return result

    meta = {
        'release':'Expanded indicators 3.1',
        'names':{k:obj.name for k,obj in v.items() if isinstance(obj,Model)},
        'sourceArchive':'Climate_Housing_Exposure_Index_Dashboard_Flexible_Indicators_GitHub_Pages.zip',
        'expanded':{'metadata':v['expanded_data']['metadata']},
        'layers':v['layer_meta'],
        'scope':scope,
        'places':{
            'tract':locations(tracts,'GEOID','Census tract'),
            'zip':locations(zips,'ZIP','ZIP'),
            'precinct':locations(precincts,'PCT_NO','Commissioner Precinct'),
            'county':[{'code':'all','index':0,'label':'Harris County','subtitle':'Countywide tract screening',
                'bounds':[float(x) for x in v['county'].total_bounds]}],
        },
        'counts':v['counts_report'],
        'membershipMethod':'Geometric intersection; whole intersecting features retained, including boundary touches. Equal-weight tract medians and ranges, not spatially allocated totals.',
    }

    # The engine legend remains a data-bearing model, but only the native,
    # scoped copy is displayed. Embedding one map preserves all linked sources.
    script, div = components(plot)
    template = (ROOT/'web'/'guided.html').read_text(encoding='utf-8')
    css = (ROOT/'web'/'guided.css').read_text(encoding='utf-8')
    js = (ROOT/'web'/'guided.js').read_text(encoding='utf-8')
    js = js.replace('/*FACTOR_CATALOG*/', (ROOT/'web'/'factor_catalog.js').read_text(encoding='utf-8'))
    js = js.replace('/*COMBINED_VIEW*/', (ROOT/'web'/'combined_view.js').read_text(encoding='utf-8'))
    overlap_js = (ROOT/'web'/'overlap.js').read_text(encoding='utf-8')
    methods = v['methods_html'].replace('Four Quick Decision questions provide low-barrier entry points.',
        'A five-step guided workflow provides location-specific entry points; the original Quick Decision tools remain available in the Advanced explorer.')
    methods = methods.replace('<h2>Dashboard architecture and reproducibility</h2>',
        '<h2>What is behind your results?</h2>')
    methods = methods.replace('A separate bivariate tool supports alternative percentile cutoffs.',
        'The guided checklist combines indicators from 17 families using numeric cutoffs, selected categories, and explicit matching rules. The earlier two-factor tool remains in the Advanced explorer.')
    methods = methods.replace('<div class=\'method-grid\'>', "<div class='notice'><b>Two independent dimensions.</b> Global warming thresholds (+1.5, +2.0, +2.5, +3.0°C relative to 1850–1899) describe climate conditions, not calendar years. The 2020 baseline and 2050 projection describe community/housing reference years. Selecting a warming threshold does not recalculate the supplied CHEI or fixed compound-hotspot data.</div><div class='method-grid'>",1)
    methods += """<div class='notice'><b>Selected-place summaries.</b> Tract values are exact source attributes. ZIP and precinct boundaries select intersecting tracts, parcels or grid cells, including features that only touch the boundary. Whole features are retained; there is no area weighting. Medians and ranges do not constitute official ZIP/precinct aggregates. Legend breaks remain countywide so colors are comparable across locations. A point or parcel view is summarized in its own units, not mislabeled as tracts. Kriging summaries and class selection refer to the corresponding tract precipitation values.</div>"""
    methods += """<section class='content-page overlap-methods'><div class='content-eyebrow'>COMBINE INDICATORS</div><h2>How the expanded overlap screen works</h2><p>Choose two or more distinct measures from 17 indicator families. These cover the 26 original analytical layer keys through their available periods, housing types, named categories, and geographic summaries. All combination calculations use census tracts; the original layer displays remain available in Explore one layer.</p><div class='method-grid'><section><h3>Numeric conditions</h3><p>Each numeric input has its own countywide percentile cutoff, using linear interpolation at (n − 1) × percentile / 100 from finite source values. Original unrounded values at or above the cutoff meet the condition. Ties are included, so the share can exceed the nominal upper tail. A larger population or more growth is not automatically adverse.</p></section><section><h3>Named categories</h3><p>For land use and fixed hotspots, choose one or more category names. A tract meets the condition when its category is one of those names. No percentile is applied to category codes. Land use is the dominant category among changing parcels assigned to the tract; ties use alphabetical order. This is not a complete county parcel inventory or an area-weighted land-use classification.</p></section><section><h3>How other geometries are represented</h3><p>Climate points use the mean of original points within a tract (197 tracts with values). Housing grids use the unweighted median of whole intersecting cells (1,109 tracts). Housing locations use complete supplied tract housing-record counts, not the sampled display points. Land-use modes have data in 787 tracts. The interpolated precipitation view uses its corresponding tract values; no raster pixels are extracted.</p></section><section><h3>A visible rule and missing data</h3><p>Select ALL, ANY, or AT LEAST a chosen number of conditions. Darker fill counts conditions met; gold outlines identify matches. Tracts missing any selected value are excluded from every rule and the percentage denominator. Individual-input counts use that input’s valid values, so their denominators may differ. No match and no complete data are distinct outcomes.</p></section><section><h3>Related measures and source definitions</h3><p>Identical source fields cannot be counted twice through different representations. Related but distinct measures remain available with an explanation. CHEI and fixed hotspots retain their original inputs and are not recalculated. A match count is neither a count of independent risks nor a new weighted index. Housing growth retains the supplied tract allocation; it is distinct from household growth.</p></section><section><h3>Background map and exports</h3><p>The default map uses embedded boundaries and analytical layers without an API key or tile request. OpenStreetMap street tiles are optional on hosted HTTP/HTTPS pages and require internet access. CSV exports retain raw values, periods, numeric cutoffs or category names, missing flags, and matching conditions. Screening briefs can span multiple pages when many indicators are chosen.</p></section></div><p>Global warming thresholds and community projection years remain separate. The supplied fixed hotspot always uses its original +2.5°C precipitation, 2020–2050 household growth, and 2020 SVI definition. A custom combination can use different inputs and need not reproduce that classification.</p></section>"""
    rendered = template.replace('<!--INLINE_CSS-->', '<style>'+css+'</style>')
    rendered = rendered.replace('<!--BOKEH_RESOURCES-->', INLINE.render())
    rendered = rendered.replace('<!--MAP_ROOT-->', div)
    rendered = rendered.replace('<!--METHODS-->', methods)
    rendered = rendered.replace('<!--TERMS-->', v['terms_html'])
    rendered = rendered.replace('<!--BOOT_DATA-->', '<script id="guided-metadata" type="application/json">'+_safe_json(meta)+'</script>')
    rendered = rendered.replace('<!--BOKEH_SCRIPT-->', script)
    rendered = rendered.replace('<!--GUIDED_SCRIPT-->', '<script>window.CHEI_API_ENABLED=false;\n'+overlap_js+'\n'+js+'</script>')
    for name in ['index.html','climate_housing_exposure_index_dashboard.html']:
        (ROOT/name).write_text(rendered, encoding='utf-8')
    print(f'Built guided dashboard ({len(rendered.encode())/1024/1024:.2f} MiB).',flush=True)
