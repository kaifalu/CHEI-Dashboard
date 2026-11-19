#!/usr/bin/env python3
"""Check the embedded documents' background models without a network browser.

This is structural validation: it confirms no tile renderer is attached on
initial load and that the sole optional source is the correctly attributed OSM
endpoint. It does not claim live tile availability or rendered appearance.
"""
from __future__ import annotations

import argparse
import ast
from html.parser import HTMLParser
import json
from pathlib import Path
import re

from bokeh.document import Document
from bokeh.models import Plot, TileRenderer, WMTSTileSource

ROOT = Path(__file__).resolve().parents[1]


class EmbeddedJSON(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current = None
        self.items = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'script' and attributes.get('type') == 'application/json':
            self.current = ''

    def handle_data(self, data):
        if self.current is not None:
            self.current += data

    def handle_endtag(self, tag):
        if tag == 'script' and self.current is not None:
            self.items.append(self.current)
            self.current = None


def document_from_html(html):
    parsed = EmbeddedJSON()
    parsed.feed(html)
    for body in parsed.items:
        candidate = json.loads(body)
        if isinstance(candidate, dict):
            documents = [d for d in candidate.values() if isinstance(d, dict) and 'roots' in d]
            if documents:
                assert len(documents) == 1
                return Document.from_json(documents[0])
    match = re.search(r'const docs_json = (.*?);\s*const render_items', html, re.S)
    assert match, 'Could not locate the Bokeh document JSON'
    documents = json.loads(ast.literal_eval(match.group(1)))
    assert len(documents) == 1
    return Document.from_json(next(iter(documents.values())))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html', nargs='+', default=['index.html', 'climate_housing_exposure_index_dashboard.html', 'advanced_explorer.html'])
    parser.add_argument('--output', type=Path, default=ROOT / 'qa' / 'basemap_validation.json')
    args = parser.parse_args()
    results = []
    for name in args.html:
        path = ROOT / name
        html = path.read_text(encoding='utf-8')
        doc = document_from_html(html)
        plots = [model for model in doc.models if isinstance(model, Plot)]
        tiles = [model for model in doc.models if isinstance(model, TileRenderer)]
        sources = [model for model in doc.models if isinstance(model, WMTSTileSource)]
        assert plots, f'{name}: no plot found'
        assert len(tiles) == 1, f'{name}: expected exactly one detached optional renderer'
        assert len(sources) == 1, f'{name}: expected exactly one optional tile source'
        attached = [tile for plot in plots for tile in plot.renderers if isinstance(tile, TileRenderer)]
        assert not attached, f'{name}: default map would instantiate an online tile renderer'
        assert all(tile.visible is False for tile in tiles), f'{name}: optional renderer must start hidden'
        assert sources[0].url == 'https://tile.openstreetmap.org/{Z}/{X}/{Y}.png'
        assert 'openstreetmap.org/copyright' in sources[0].attribution
        assert 'OpenStreetMap contributors' in sources[0].attribution
        assert sources[0].max_zoom == 19
        assert not any('carto' in str(source.url).lower() for source in sources)
        assert doc.get_model_by_name('county_boundary') is not None, f'{name}: embedded county outline missing'
        results.append({'html': name, 'detached_optional_renderers': len(tiles),
                        'tile_renderers_attached_by_default': len(attached),
                        'optional_source': sources[0].url, 'attribution': sources[0].attribution,
                        'embedded_county_boundary': True, 'carto_tile_sources': 0})
    result = {'status': 'passed', 'files': results,
              'scope': 'Actual serialized Bokeh model graph; no network tile requests or graphical browser test performed.'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'status': 'passed', 'html_files': len(results), 'output': str(args.output)}))


if __name__ == '__main__':
    main()
