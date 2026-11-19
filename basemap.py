"""Key-free background maps for the static dashboard.

The default view uses the embedded analytical geometries and county boundary.
The optional OpenStreetMap renderer is deliberately not attached to the plot
until a user explicitly enables streets from an HTTP(S)-hosted dashboard.
This avoids tile requests entirely during local/offline use and initial load.
"""
from __future__ import annotations

from bokeh.models import TileRenderer, WMTSTileSource

OSM_TILE_URL = "https://tile.openstreetmap.org/{Z}/{X}/{Y}.png"
OSM_ATTRIBUTION = (
    '&copy; <a href="https://www.openstreetmap.org/copyright" '
    'target="_blank" rel="noopener">OpenStreetMap contributors</a>'
)


def build_base_map(plot) -> TileRenderer:
    """Return an opt-in renderer without adding it to ``plot.renderers``.

    Keep this model reachable through a callback or bridge tag when embedding.
    The user interface must attach it only after an explicit online choice,
    and detach it again when the embedded background is selected. The ordinary
    browser cache and referrer behavior should be retained. No offline tile
    download, prefetch, API token, tile proxy, or stored tile archive is used.
    """
    plot.background_fill_color = "#EAF0F3"
    source = WMTSTileSource(
        url=OSM_TILE_URL,
        attribution=OSM_ATTRIBUTION,
        max_zoom=19,
        name="optional_osm_tile_source",
    )
    return TileRenderer(
        tile_source=source,
        alpha=0.68,
        visible=False,
        level="underlay",
        name="optional_osm_basemap",
    )
