#!/usr/bin/env python3
"""Deserialize the shipped Bokeh document and validate the native UI bridge.

This validates the actual embedded model graph, not the separate DOM test mock.
It does not execute BokehJS, render a canvas, or assess graphical layout.
"""
from __future__ import annotations

import ast
import hashlib
from html.parser import HTMLParser
import json
import math
from pathlib import Path
import re

from bokeh.core.validation import check_integrity
from bokeh.document import Document
from bokeh.models import ColumnDataSource, CustomJS, GlyphRenderer, Plot, TileRenderer, WMTSTileSource

ROOT = Path(__file__).resolve().parents[1]


class JSONScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current = None
        self.items = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('type') == 'application/json':
            self.current = {'attrs': attrs, 'text': ''}

    def handle_data(self, value):
        if self.current is not None:
            self.current['text'] += value

    def handle_endtag(self, tag):
        if tag == 'script' and self.current is not None:
            self.items.append(self.current)
            self.current = None


def main():
    index_bytes = (ROOT / 'index.html').read_bytes()
    assert index_bytes == (ROOT / 'climate_housing_exposure_index_dashboard.html').read_bytes(), 'Guided HTML copies differ'
    html = index_bytes.decode('utf-8')
    parser = JSONScripts()
    parser.feed(html)
    metadata = next(json.loads(x['text']) for x in parser.items if x['attrs'].get('id') == 'guided-metadata')
    documents = {}
    for script in parser.items:
        if script['attrs'].get('id') == 'guided-metadata':
            continue
        candidate = json.loads(script['text'])
        if isinstance(candidate, dict):
            documents.update({k: v for k, v in candidate.items() if isinstance(v, dict) and 'roots' in v})
    embedding = 'application/json script'
    if not documents:
        # bokeh.embed.components emits a JavaScript string containing JSON.
        # Parse the literal as data; do not execute the embedded application.
        match = re.search(r'const docs_json = (.*?);\s*const render_items', html, re.S)
        assert match, 'Embedded Bokeh document JSON was not found'
        documents = json.loads(ast.literal_eval(match.group(1)))
        embedding = 'bokeh.embed.components inline docs_json string'
    assert len(documents) == 1, 'Expected one embedded analytical document'
    document = Document.from_json(next(iter(documents.values())))
    issues = check_integrity(document.models)
    assert not issues.error, issues.error
    assert not issues.warning, issues.warning

    required = [
        'tract_source', 'tract_renderer', 'parcel_source', 'grid_source',
        'climate_source', 'climate_display_source', 'county_source',
        'zipcode_source', 'precinct_source', 'map_plot', 'layer_select',
        'gmt_select', 'housing_select', 'opacity_slider', 'overlap_toggle',
        'overlap_a', 'overlap_b', 'threshold_slider', 'legend_div',
        'legend_filter_status', 'all_zip_renderer', 'all_precinct_renderer',
        'update_callback', 'basemap_renderer',
    ]
    models = {}
    for key in required:
        name = metadata['names'][key]
        item = document.get_model_by_name(name)
        assert item is not None, f'Missing native bridge model: {key}/{name}'
        models[key] = item

    native = {}
    for name in [
        'guided_scope_mask', 'guided_scope_boundary', 'guided_inspected_tract',
        'guided_screen_matches', 'guided_screen_matches_renderer',
        'guided_scope_boundary_renderer', 'guided_scope_mask_renderer',
        'guided_bridge',
    ]:
        item = document.get_model_by_name(name)
        assert item is not None, f'Missing guided model: {name}'
        native[name] = item

    assert isinstance(models['tract_source'], ColumnDataSource)
    assert isinstance(models['tract_renderer'], GlyphRenderer)
    assert models['tract_renderer'].data_source is models['tract_source']
    assert isinstance(native['guided_screen_matches'], ColumnDataSource)
    assert native['guided_screen_matches_renderer'].data_source is native['guided_screen_matches']
    assert native['guided_scope_boundary_renderer'].data_source is native['guided_scope_boundary']
    assert native['guided_scope_mask_renderer'].data_source is native['guided_scope_mask']
    assert native['guided_screen_matches_renderer'] in models['map_plot'].renderers
    assert native['guided_scope_boundary_renderer'] in models['map_plot'].renderers
    assert set(native['guided_screen_matches'].data) == {'xs', 'ys'}
    assert models['tract_renderer'].nonselection_glyph is not None

    # The default document cannot instantiate a provider tile view: the sole
    # optional renderer is reachable as model data, but detached from all plots.
    basemap = models['basemap_renderer']
    assert isinstance(basemap, TileRenderer)
    assert basemap.name == 'optional_osm_basemap'
    assert basemap.visible is False
    assert basemap.level == 'underlay'
    plots = [model for model in document.models if isinstance(model, Plot)]
    attached_tiles = [renderer for plot in plots for renderer in plot.renderers if isinstance(renderer, TileRenderer)]
    assert not attached_tiles, 'A default plot would instantiate an online tile renderer'
    tile_renderers = [model for model in document.models if isinstance(model, TileRenderer)]
    tile_sources = [model for model in document.models if isinstance(model, WMTSTileSource)]
    assert tile_renderers == [basemap], 'Unexpected extra background renderer'
    assert tile_sources == [basemap.tile_source], 'Unexpected extra online tile source'
    assert basemap.tile_source.name == 'optional_osm_tile_source'
    assert basemap.tile_source.url == 'https://tile.openstreetmap.org/{Z}/{X}/{Y}.png'
    assert basemap.tile_source.max_zoom == 19
    assert 'OpenStreetMap contributors' in basemap.tile_source.attribution
    assert 'openstreetmap.org/copyright' in basemap.tile_source.attribution
    bridge = native['guided_bridge']
    assert isinstance(bridge, ColumnDataSource)
    assert bridge in native['guided_scope_boundary'].tags
    assert bridge.tags and bridge.tags[0]['basemap_renderer'] is basemap
    county_outline = document.get_model_by_name('county_boundary')
    assert isinstance(county_outline, GlyphRenderer)
    assert county_outline in models['map_plot'].renderers
    assert county_outline.visible is True
    assert county_outline.data_source is models['county_source']
    assert len(models['county_source'].data['xs']) > 0

    source = models['tract_source'].data
    expected_fields = [
        'GEOID', 'xs', 'ys', 'fill_color', 'display_value', 'display_label',
        'pr_15', 'pr_20', 'pr_25', 'pr_30', 'sens_pct', 'SVI',
        'parcel_hu_change', 'hp_2020', 'hp_2050', 'pop_chg',
        'hh_2020', 'hh_2050', 'hh_chg', 'j_2020', 'j_2050', 'job_chg',
        'CHEI_2020', 'CHEI_2050', 'adapt_gap', 'hotspot_combo',
        'pop_den', 'n_single_f', 'n_multi_fa',
    ]
    for field in expected_fields:
        assert field in source, f'Native source is missing {field}'
        assert len(source[field]) == 1115, f'Unexpected field length: {field}'

    # Check values inside the actual serialized document, not just the builder's
    # intermediate arrays. These independent inputs also detect stale builds.
    expanded = json.loads((ROOT / 'data/expanded_indicator_fields.json').read_text())
    assert metadata['expanded']['metadata'] == expanded['metadata'], 'Embedded expanded metadata differs from its source file'
    assert metadata['expanded']['metadata']['indicator_family_count'] == 17
    assert metadata['expanded']['metadata']['covered_layer_count'] == 26
    assert expanded['metadata']['geoid_order'] == list(source['GEOID'])
    expanded_checks = 0
    for field, expected_values in expanded['columns'].items():
        assert field in source, f'Expanded column absent from native source: {field}'
        assert len(source[field]) == len(expected_values) == 1115
        for index, (actual, expected) in enumerate(zip(source[field], expected_values)):
            if expected is None:
                assert actual is None, f'Missing expanded value was filled: {field}/{index}'
            elif isinstance(expected, str):
                assert isinstance(actual, str) and actual == expected, f'Category text changed: {field}/{index}'
            else:
                assert math.isclose(actual, expected, rel_tol=1e-12, abs_tol=1e-12), f'Expanded numeric value differs: {field}/{index}'
            expanded_checks += 1
    for field in ('parcel_current_lu_mode', 'parcel_future_lu_mode'):
        description = metadata['expanded']['metadata']['fields'][field]
        assert description['kind'] == 'category'
        assert description['defaultValues']
        assert set(description['defaultValues']) <= set(description['categories'])
        assert {value for value in source[field] if value is not None} <= set(description['categories'])
    source_rows = [feature['properties'] for feature in json.loads((ROOT / 'data/tracts_web.geojson').read_text())['features']]
    raw_numeric_fields = [field for field in expected_fields if field in source_rows[0] and field != 'GEOID']
    original_checks = 0
    for field in raw_numeric_fields:
        for index, row in enumerate(source_rows):
            expected, actual = row[field], source[field][index]
            if expected is None:
                assert actual is None or (isinstance(actual, (int, float)) and not math.isfinite(actual))
            else:
                assert math.isclose(actual, expected, rel_tol=1e-12, abs_tol=1e-12), f'Original source attribute changed: {field}/{index}'
            original_checks += 1
    callback = models['update_callback']
    assert isinstance(callback, CustomJS)
    assert 'setLegendContext:setLegendContext' in callback.code
    assert 'window.CHEI=' in callback.code
    assert 'function setLegendContext(' in callback.code
    assert callback.args['tract_source'] is models['tract_source']
    assert callback.args['legend_div'] is models['legend_div']

    result = {
        'passed': True,
        'release': metadata['release'],
        'embedding': embedding,
        'bokeh_version': next(iter(documents.values()))['version'],
        'model_count': len(document.models),
        'root_count': len(document.roots),
        'validation_errors': [],
        'validation_warnings': [],
        'required_bridge_models': {key: {'name': item.name, 'class': type(item).__name__} for key, item in models.items()},
        'native_guided_models': {key: type(item).__name__ for key, item in native.items()},
        'tract_source_fields_checked': expected_fields,
        'expanded_source_fields_checked': sorted(expanded['columns']),
        'expanded_source_values_compared': expanded_checks,
        'expanded_metadata_matches_source_file': True,
        'indicator_families': 17,
        'source_layers_represented': 26,
        'categorical_values_and_missing_coverage_preserved': True,
        'original_numeric_source_fields_checked': raw_numeric_fields,
        'original_source_values_compared': original_checks,
        'original_source_values_preserved': True,
        'tract_count': 1115,
        'screen_outline_linked_to_map': True,
        'legend_context_export_present': True,
        'guided_html_copies_identical': True,
        'basemap': {
            'tile_renderers_attached_by_default': len(attached_tiles),
            'detached_optional_renderers': len(tile_renderers),
            'optional_renderer_name': basemap.name,
            'optional_source': basemap.tile_source.url,
            'optional_source_attributed': True,
            'reachable_through_native_bridge_tags': True,
            'embedded_county_boundary_visible': True,
            'no_api_key_configuration_required': True,
        },
        'index_sha256': hashlib.sha256(index_bytes).hexdigest(),
        'scope': 'Real Bokeh document deserialization, model integrity, original and expanded source values, metadata, optional basemap, and native bridge references; not browser execution, live tile availability, or graphical rendering.',
    }
    (ROOT / 'qa' / 'model_validation.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({'passed': True, 'model_count': len(document.models), 'validation_errors': 0, 'validation_warnings': 0, 'guided_html_copies_identical': True,
                      'expanded_values_compared': expanded_checks, 'original_values_compared': original_checks, 'tile_renderers_attached_by_default': len(attached_tiles)}))


if __name__ == '__main__':
    main()
