#!/usr/bin/env python3
"""Prepare explicitly documented tract screens for non-tract display layers.

The original prepared files and their attributes are never overwritten. New
summaries use the prepared web geometries, retain missing coverage, and keep
categorical land-use labels categorical. Run this file to regenerate the small
``data/expanded_indicator_fields.json`` sidecar used for reproducibility.
"""
from __future__ import annotations

from collections import Counter
import json
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def _as_web_frame(frame: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if frame.crs is None:
        raise ValueError("Source geometries must declare their coordinate system.")
    return frame.to_crs(3857).reset_index(drop=True).copy()


def _finite(value: Any) -> bool:
    try:
        return not isinstance(value, (bool, np.bool_)) and value is not None and pd.notna(value) and np.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def _assign_points(points: gpd.GeoSeries, tracts: gpd.GeoDataFrame) -> tuple[list[int | None], dict[str, int]]:
    """Assign each point once, only when strictly within a prepared tract.

    Source tract ordering is preserved. If invalid/overlapping source polygons
    contain a point more than once, choose the smallest GEOID deterministically
    and record the ambiguity rather than counting the point twice.
    """
    pairs = tracts.sindex.query(points, predicate="within")
    candidates: dict[int, list[int]] = {}
    for point_index, tract_index in zip(*pairs):
        candidates.setdefault(int(point_index), []).append(int(tract_index))
    geoid = tracts["GEOID"].astype(str).tolist()
    result: list[int | None] = [None] * len(points)
    for point_index, choices in candidates.items():
        result[point_index] = min(choices, key=lambda j: (geoid[j], j))
    return result, {
        "source_points": len(points),
        "assigned_points": len(candidates),
        "unassigned_points": len(points) - len(candidates),
        "ambiguous_points": sum(len(v) > 1 for v in candidates.values()),
    }


def _mode(values: list[str]) -> tuple[str | None, bool]:
    if not values:
        return None, False
    counts = Counter(values)
    largest = max(counts.values())
    tied = sorted(k for k, n in counts.items() if n == largest)
    return tied[0], len(tied) > 1


def build_expanded_indicators(
    tracts: gpd.GeoDataFrame,
    parcels: gpd.GeoDataFrame,
    housing_grid: gpd.GeoDataFrame,
    climate: pd.DataFrame,
) -> dict[str, Any]:
    """Return aligned columns and metadata, without mutating supplied inputs.

    Returned rows match ``tracts`` row order. ``None`` is a missing observation,
    not a zero. Zeros for changed-parcel counts/sums mean no assigned records in
    this limited source. They never assert the absence of housing or land use.
    """
    t, p, g = map(_as_web_frame, (tracts, parcels, housing_grid))
    c = climate.copy().reset_index(drop=True)
    n = len(t)
    columns: dict[str, list[Any]] = {}
    fields: dict[str, dict[str, Any]] = {}
    coverage: dict[str, Any] = {}
    support_columns: list[str] = []

    # Climate points are a sparse, different representation of precipitation.
    # A tract with no within-boundary points is not assigned a nearby point or
    # the separately supplied tract precipitation value.
    point_geometry = gpd.GeoSeries(gpd.points_from_xy(c["x"], c["y"]), crs=3857)
    point_assignment, point_coverage = _assign_points(point_geometry, t)
    coverage["climate_points"] = point_coverage
    for code, warming in [("15", 1.5), ("20", 2.0), ("25", 2.5), ("30", 3.0)]:
        grouped: list[list[float]] = [[] for _ in range(n)]
        selected = np.flatnonzero(np.isclose(pd.to_numeric(c["gmt"], errors="coerce"), warming))
        for k in selected:
            tract_index = point_assignment[int(k)]
            value = c.at[int(k), "precip_mm"]
            if tract_index is not None and _finite(value):
                grouped[tract_index].append(float(value))
        field = "point_pr_" + code
        columns[field] = [float(np.mean(a)) if a else None for a in grouped]
        columns[field + "_n"] = [len(a) for a in grouped]
        support_columns.append(field + "_n")
        fields[field] = {
            "id": "pr_points", "kind": "numeric", "label": f"Model-point precipitation · +{warming:.1f}°C",
            "short": "Model-point precipitation", "unit": "mm", "decimals": 3,
            "period": f"20-year climate window at GMT +{warming:.1f}°C; not a calendar year",
            "source": "Supplied climate_points.csv; arithmetic mean of finite model-point values strictly within each prepared census tract",
            "note": "Sparse point coverage: tracts containing no model point retain missing data. This differs from the separately supplied tract precipitation layer; no nearest-point substitution or interpolation is performed.",
            "sourceLayers": ["pr_points"], "gmt": code,
        }
        coverage[field] = {"source_points_at_warming": int(len(selected)), "tracts_with_values": sum(bool(a) for a in grouped), "tracts_without_values": sum(not a for a in grouped)}

    # Housing grid statistics retain the whole-cell source support. Cells can
    # intersect multiple tracts and are not spatially apportioned or summed.
    cell_memberships = [sorted(map(int, g.sindex.query(geom, predicate="intersects"))) for geom in t.geometry]
    columns["grid_intersect_count"] = [len(a) for a in cell_memberships]
    support_columns.append("grid_intersect_count")
    for source_field, field, label in [
        ("sf_count", "grid_sf_median", "Single-family grid concentration"),
        ("mf_count", "grid_mf_median", "Multi-family grid concentration"),
        ("total_count", "grid_total_median", "Combined housing grid concentration"),
    ]:
        values = pd.to_numeric(g[source_field], errors="coerce").to_numpy(float)
        groups = [[float(values[j]) for j in ids if np.isfinite(values[j])] for ids in cell_memberships]
        columns[field] = [float(np.median(a)) if a else None for a in groups]
        columns[field + "_n"] = [len(a) for a in groups]
        support_columns.append(field + "_n")
        fields[field] = {
            "id": "housing_density", "kind": "numeric", "label": label + " · 2020",
            "short": label, "unit": "records per 1 km cell (median)", "decimals": 1,
            "period": "2020 housing-stock baseline", "periodKey": "2020",
            "source": "Supplied full-count housing_grid.geojson; median of finite whole-cell counts for cells intersecting each prepared tract",
            "note": "Cells are not clipped or area-weighted and may be shared by neighboring tracts. This is a concentration screen, not a tract housing total or a newly estimated density. A tract without an intersecting source cell retains missing data.",
            "sourceLayers": ["housing_density"],
        }
        coverage[field] = {"tracts_with_values": sum(bool(a) for a in groups), "tracts_without_values": sum(not a for a in groups)}

    # Housing point locations already have full source counts at tract level.
    # The static 30,000 SF-point preview is never counted as the full inventory.
    single = pd.to_numeric(t["n_single_f"], errors="coerce").to_numpy(float)
    multi = pd.to_numeric(t["n_multi_fa"], errors="coerce").to_numpy(float)
    columns["housing_total_records"] = [float(a + b) if np.isfinite(a) and np.isfinite(b) else None for a, b in zip(single, multi)]
    fields["housing_total_records"] = {
        "id": "housing_points", "kind": "numeric", "label": "Housing-stock records · combined tract count",
        "short": "Housing-stock records", "unit": "source housing records", "decimals": 0,
        "period": "2020 housing-stock baseline", "periodKey": "2020",
        "source": "Sum of supplied tract attributes n_single_f and n_multi_fa",
        "note": "For combination screening the point-location family uses the supplied tract record counts, not counts from the sampled static point display. Records are not independently verified dwelling-unit totals.",
        "sourceLayers": ["housing_points", "sf_tract", "mf_tract"],
    }

    # Use representative points for the changing-parcel subset, mirroring the
    # original allocation convention but explicitly retaining prepared geometry.
    parcel_assignment, parcel_coverage = _assign_points(p.geometry.representative_point(), t)
    coverage["changed_parcels"] = parcel_coverage
    parcel_memberships: list[list[int]] = [[] for _ in range(n)]
    for k, tract_index in enumerate(parcel_assignment):
        if tract_index is not None:
            parcel_memberships[tract_index].append(k)
    columns["parcel_count"] = [len(a) for a in parcel_memberships]
    support_columns.append("parcel_count")
    for source_field, field, year in [
        ("Label_Current_Land_Use", "parcel_current_lu_mode", "2020"),
        ("Label_Land_Use_2050", "parcel_future_lu_mode", "2050"),
    ]:
        labels = p[source_field].fillna("Unknown").astype(str).map(lambda x: x.strip() or "Unknown").tolist()
        modes = [_mode([labels[k] for k in ids]) for ids in parcel_memberships]
        columns[field] = [mode for mode, _ in modes]
        columns[field + "_tied"] = [tied for _, tied in modes]
        support_columns.append(field + "_tied")
        dominant_categories = sorted(set(v for v in columns[field] if v is not None))
        categories = sorted(set(labels))
        default_counts = Counter(v for v in columns[field] if v is not None)
        default_values = [min(default_counts, key=lambda k: (-default_counts[k], k))] if default_counts else []
        fields[field] = {
            "id": "land_use", "kind": "category", "label": f"Most common changed-parcel land use · {year}",
            "short": "Changed-parcel land use", "unit": "land-use category", "decimals": 0,
            "period": year + (" current land use" if year == "2020" else " projected land use"), "periodKey": year,
            "source": f"Mode of supplied {source_field} among changing parcels assigned by representative point to each prepared tract",
            "note": "A categorical condition, not a high/low ranking. Dominance is by parcel count, not land area or housing units; ties are broken alphabetically and flagged in support data. No assigned changed parcel means missing coverage, not Unknown land use. This does not describe all land in the tract.",
            "categories": categories, "dominantCategories": dominant_categories, "defaultValues": default_values,
            "sourceLayers": ["parcel_current_lu" if year == "2020" else "parcel_future_lu"],
        }
        coverage[field] = {"tracts_with_values": sum(v is not None for v in columns[field]), "tracts_without_values": sum(v is None for v in columns[field]), "tied_mode_tracts": sum(columns[field + "_tied"]), "categories": categories}

    # This audit is explicit because the old net-change attribute was computed
    # from raw geometries, whereas the distribution package carries web shapes.
    prepared_change = np.zeros(n)
    hu_change = pd.to_numeric(p["hu_change"], errors="coerce").to_numpy(float)
    for tract_index, ids in enumerate(parcel_memberships):
        prepared_change[tract_index] = np.nansum(hu_change[ids])
    preserved_change = pd.to_numeric(t["parcel_hu_change"], errors="coerce").to_numpy(float)
    difference = np.abs(prepared_change - preserved_change)
    coverage["preserved_housing_change"] = {
        "original_field_overwritten": False,
        "tracts_with_prepared_vs_original_allocation_difference": int(np.sum(difference > 1e-6)),
        "max_absolute_unit_difference": float(np.nanmax(difference)) if len(difference) else 0.0,
        "prepared_geometry_change_sum": float(np.sum(prepared_change)),
        "preserved_source_change_sum": float(np.nansum(preserved_change)),
    }

    layer_mapping = {
        "chei_2020": "CHEI_2020", "chei_2050": "CHEI_2050", "adapt_gap": "adapt_gap",
        "hotspot": "hotspot_combo (fixed category, reconstructed by the original builder)",
        "pr_tract": "pr_15 / pr_20 / pr_25 / pr_30", "pr_change": "sens_pct",
        "pr_points": "point_pr_15 / point_pr_20 / point_pr_25 / point_pr_30",
        "pr_kriging": "Corresponding supplied pr_15 / pr_20 / pr_25 / pr_30 tract screen; no raster-pixel extraction",
        "pop_2020": "hp_2020", "pop_2050": "hp_2050", "pop_growth": "pop_chg",
        "hh_2020": "hh_2020", "hh_2050": "hh_2050", "hh_growth": "hh_chg",
        "jobs_2020": "j_2020", "jobs_2050": "j_2050", "jobs_growth": "job_chg",
        "svi": "SVI", "pop_density": "pop_den", "sf_tract": "n_single_f", "mf_tract": "n_multi_fa",
        "housing_density": "grid_sf_median / grid_mf_median / grid_total_median",
        "housing_points": "n_single_f / n_multi_fa / housing_total_records (full supplied tract counts)",
        "parcel_hu_change": "parcel_hu_change (preserved original allocation)",
        "parcel_current_lu": "parcel_current_lu_mode", "parcel_future_lu": "parcel_future_lu_mode",
    }
    layer_families = {
        "chei_2020": "chei", "chei_2050": "chei", "adapt_gap": "chei", "hotspot": "hotspot",
        "pr_tract": "precipitation", "pr_change": "pr_change", "pr_points": "pr_points", "pr_kriging": "pr_kriging",
        "pop_2020": "population", "pop_2050": "population", "pop_growth": "population",
        "hh_2020": "households", "hh_2050": "households", "hh_growth": "households",
        "jobs_2020": "employment", "jobs_2050": "employment", "jobs_growth": "employment",
        "svi": "svi", "pop_density": "pop_density", "sf_tract": "sf_tract", "mf_tract": "mf_tract",
        "housing_density": "housing_density", "housing_points": "housing_points", "parcel_hu_change": "housing",
        "parcel_current_lu": "land_use", "parcel_future_lu": "land_use",
    }
    metadata = {
        "version": "Expanded indicators 3.1", "tract_count": n, "geoid_order": t["GEOID"].astype(str).tolist(),
        "fields": fields, "support_columns": support_columns, "coverage": coverage,
        "layer_mapping": layer_mapping, "covered_layer_count": len(layer_mapping),
        "layer_families": layer_families, "indicator_family_count": len(set(layer_families.values())),
        "methods": {
            "geometry": "Prepared web geometries in EPSG:3857; original analytical files are unchanged.",
            "points": "Strict within assignment; at a multiple match choose the smallest GEOID deterministically and report the ambiguity. Unassigned points remain unassigned.",
            "grid": "Median finite source-cell count over whole intersecting grid cells; no area weighting or cell-to-tract total allocation.",
            "land_use": "Dominant supplied land-use category by changed-parcel count; alphabetical tie-breaking. Categories have no numeric ordering and require an explicit category condition.",
            "missing": "No climate point, no grid cell, or no assigned changed parcel for land use produces null, not zero.",
            "kriging": "The interpolated surface is a display representation. Combination screening uses the corresponding supplied tract precipitation values, not sampled raster pixels.",
            "housing_points": "Use the supplied full tract record counts for combination screening, not counts of sampled point markers.",
        },
    }
    return {"columns": columns, "metadata": metadata}


def load_and_build(data_dir: Path = DATA) -> dict[str, Any]:
    return build_expanded_indicators(
        gpd.read_file(data_dir / "tracts_web.geojson"),
        gpd.read_file(data_dir / "parcels_web.geojson"),
        gpd.read_file(data_dir / "housing_grid.geojson"),
        pd.read_csv(data_dir / "climate_points.csv"),
    )


def main() -> None:
    result = load_and_build()
    output = DATA / "expanded_indicator_fields.json"
    output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "tracts": result["metadata"]["tract_count"], "derived_columns": len(result["columns"]), "covered_layer_count": result["metadata"]["covered_layer_count"], "coverage": result["metadata"]["coverage"]}, indent=2))


if __name__ == "__main__":
    main()
