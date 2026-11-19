#!/usr/bin/env python3
"""Independently verify the derived common-tract indicator summaries.

Production uses spatial-index queries. This check uses direct vectorized
Shapely predicates against every source feature, then independently calculates
the means, medians, modes and missing-data flags. No source file is rewritten.
"""
from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely import contains, intersects
from shapely.geometry import box

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from expanded_indicators import build_expanded_indicators, load_and_build


def main() -> None:
    data = ROOT / "data"
    checks: list[dict] = []

    def check(condition, label, **evidence):
        if not condition:
            raise AssertionError(label + ": " + json.dumps(evidence))
        checks.append({"check": label, **evidence})

    inputs = [data / n for n in ["tracts_web.geojson", "parcels_web.geojson", "housing_grid.geojson", "climate_points.csv"]]
    before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    actual = load_and_build(data)
    columns, metadata = actual["columns"], actual["metadata"]
    t = gpd.read_file(inputs[0]).to_crs(3857).reset_index(drop=True)
    p = gpd.read_file(inputs[1]).to_crs(3857).reset_index(drop=True)
    g = gpd.read_file(inputs[2]).to_crs(3857).reset_index(drop=True)
    c = pd.read_csv(inputs[3])
    climate_points = np.asarray(gpd.points_from_xy(c.x, c.y), dtype=object)
    parcel_points = np.asarray(p.geometry.representative_point(), dtype=object)
    grid_shapes = np.asarray(g.geometry, dtype=object)

    expected = {k: [] for k in columns}
    assigned_parcels = set()
    ambiguous_parcels = 0
    tied_land_use = {"parcel_current_lu_mode": 0, "parcel_future_lu_mode": 0}
    for i, geom in enumerate(t.geometry):
        # Direct geometric predicates are independent of the production index.
        climate_ids = np.flatnonzero(contains(geom, climate_points))
        grid_ids = np.flatnonzero(intersects(geom, grid_shapes))
        parcel_ids = np.flatnonzero(contains(geom, parcel_points))
        ambiguous_parcels += sum(int(k) in assigned_parcels for k in parcel_ids)
        assigned_parcels.update(map(int, parcel_ids))
        for code, warming in [("15", 1.5), ("20", 2.0), ("25", 2.5), ("30", 3.0)]:
            values = pd.to_numeric(c.iloc[climate_ids].loc[np.isclose(c.iloc[climate_ids].gmt, warming), "precip_mm"], errors="coerce")
            values = values[np.isfinite(values)]
            field = "point_pr_" + code
            expected[field].append(float(values.sum() / len(values)) if len(values) else None)
            expected[field + "_n"].append(int(len(values)))
        expected["grid_intersect_count"].append(int(len(grid_ids)))
        for source_field, field in [("sf_count", "grid_sf_median"), ("mf_count", "grid_mf_median"), ("total_count", "grid_total_median")]:
            values = pd.to_numeric(g.iloc[grid_ids][source_field], errors="coerce")
            values = values[np.isfinite(values)]
            expected[field].append(float(values.quantile(.5, interpolation="linear")) if len(values) else None)
            expected[field + "_n"].append(int(len(values)))
        a, b = t.at[i, "n_single_f"], t.at[i, "n_multi_fa"]
        expected["housing_total_records"].append(float(a + b) if np.isfinite(a) and np.isfinite(b) else None)
        expected["parcel_count"].append(int(len(parcel_ids)))
        for source_field, field in [("Label_Current_Land_Use", "parcel_current_lu_mode"), ("Label_Land_Use_2050", "parcel_future_lu_mode")]:
            values = p.iloc[parcel_ids][source_field].fillna("Unknown").astype(str).str.strip().replace("", "Unknown")
            counts = values.value_counts()
            if counts.empty:
                mode, tied = None, False
            else:
                leaders = sorted(counts.index[counts == counts.max()].tolist())
                mode, tied = leaders[0], len(leaders) > 1
            expected[field].append(mode)
            expected[field + "_tied"].append(tied)
            tied_land_use[field] += int(tied)
    check(ambiguous_parcels == 0, "Current source parcels have unambiguous within-tract allocation")

    for field, values in expected.items():
        if "lu_mode" in field or field.endswith("_tied"):
            check(values == columns[field], "Independent categorical/support column agrees", field=field, records=len(values))
        else:
            av = np.array([np.nan if v is None else v for v in columns[field]], dtype=float)
            ev = np.array([np.nan if v is None else v for v in values], dtype=float)
            check(np.allclose(av, ev, rtol=1e-12, atol=1e-12, equal_nan=True), "Independent numeric/support column agrees", field=field, records=len(values))
    check(len(assigned_parcels) == metadata["coverage"]["changed_parcels"]["assigned_points"], "Assigned parcel coverage agrees independently", assigned=len(assigned_parcels), unassigned=len(p)-len(assigned_parcels))
    check(metadata["indicator_family_count"] == 17 and metadata["covered_layer_count"] == 26, "All original layer keys have documented family mappings")
    for field in ["parcel_current_lu_mode", "parcel_future_lu_mode"]:
        description = metadata["fields"][field]
        check(description["kind"] == "category", "Land-use values have no numeric ranking", field=field)
        check(all(v in description["categories"] for v in description["defaultValues"]), "Initial category conditions are explicit and supported", field=field)

    # Small fixtures check semantic cases that the real data may not exercise.
    synthetic_tracts = gpd.GeoDataFrame({"GEOID": ["001", "002", "003"], "n_single_f": [2, 3, np.nan], "n_multi_fa": [1, 0, 1], "parcel_hu_change": [3, 0, 0]}, geometry=[box(0,0,10,10), box(10,0,20,10), box(20,0,30,10)], crs=3857)
    synthetic_parcels = gpd.GeoDataFrame({"Label_Current_Land_Use": ["Residential", "Commercial"], "Label_Land_Use_2050": ["Multiple", "Residential"], "hu_change": [2, 1]}, geometry=[box(1,1,2,2), box(3,3,4,4)], crs=3857)
    synthetic_grid = gpd.GeoDataFrame({"sf_count": [0, 5], "mf_count": [0, 1], "total_count": [0, 6]}, geometry=[box(1,1,2,2), box(9,1,11,2)], crs=3857)
    synthetic_climate = pd.DataFrame({"x": [2, 10, 15], "y": [2, 2, 2], "gmt": [2.5,2.5,2.5], "precip_mm": [0,99,np.nan]})
    syn = build_expanded_indicators(synthetic_tracts, synthetic_parcels, synthetic_grid, synthetic_climate)
    sc = syn["columns"]
    check(sc["point_pr_25"] == [0.0, None, None], "Zero precipitation is valid; absent or all-missing point coverage stays null")
    check(syn["metadata"]["coverage"]["climate_points"]["unassigned_points"] == 1, "Exactly-on-boundary climate point is not silently assigned")
    check(sc["parcel_current_lu_mode"] == ["Commercial", None, None] and sc["parcel_current_lu_mode_tied"] == [True, False, False], "Land-use tie handling is deterministic and flags the tie")
    check(sc["parcel_future_lu_mode"] == ["Multiple", None, None], "Future land-use remains categorical")
    check(sc["grid_total_median"] == [3.0, 6.0, None], "Whole intersecting cells use medians; absent grid coverage remains null")
    check(sc["housing_total_records"] == [3.0, 3.0, None], "Full supplied record counts preserve missing operands")
    check(sc["parcel_count"] == [2, 0, 0], "Zero assigned changed parcels is not fabricated land-use coverage")
    after = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    check(before == after, "Original prepared input files are unchanged")
    check("parcel_hu_change" not in columns, "Original tract housing change is never overwritten")
    check(all(len(v) == len(t) for v in columns.values()), "Every derived column preserves source tract order and length")

    output = ROOT / "qa" / "expanded_data_validation.json"
    output.parent.mkdir(exist_ok=True)
    result = {"status": "passed", "check_count": len(checks), "tracts": len(t), "derived_columns": len(columns), "independently_compared_values": len(columns)*len(t), "checks": checks, "coverage": metadata["coverage"], "source_hashes": before, "method": "Direct vectorized Shapely predicates and independent Pandas statistics, compared to the production spatial-index implementation."}
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"status": "passed", "check_count": len(checks), "independently_compared_values": result["independently_compared_values"], "report": str(output)}))


if __name__ == "__main__":
    main()
