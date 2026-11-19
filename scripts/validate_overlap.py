#!/usr/bin/env python3
"""Independently verify browser overlap arithmetic against prepared GeoJSON.

Requires only Python's standard library and Node.js. Runs 144 four-factor
configurations plus selected-location and optional-factor cases, and checks
ties, negative changes, missing values and invalid inputs using synthetic data.
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def quantile(values, percentile):
    values = sorted(v for v in values if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v))
    if not values:
        return None
    pos = (len(values) - 1) * percentile / 100
    low, high = math.floor(pos), math.ceil(pos)
    return values[low] + (values[high] - values[low]) * (pos - low)


def main():
    node = shutil.which('node')
    assert node, 'Node.js is required for the independent JavaScript check.'
    features = json.loads((ROOT / 'data/tracts_web.geojson').read_text())['features']
    rows = [f['properties'] for f in features]
    membership = json.loads((ROOT / 'data/guided_scope_membership.json').read_text())
    cases = []
    for gmt in ('15', '20', '25', '30'):
        for period, popfield in [('2020', 'hp_2020'), ('2050', 'hp_2050'), ('change', 'pop_chg')]:
            for p in (75, 80, 90):
                for rule, minimum in [('all', 4), ('any', 1), ('atleast', 2), ('atleast', 3)]:
                    cases.append({'factors': ['pr_' + gmt, 'SVI', 'parcel_hu_change', popfield], 'percentile': p, 'rule': rule, 'minCount': minimum})
    for kind, code in [('zip', '77007'), ('precinct', '1'), ('precinct', '4'), ('tract', rows[0]['GEOID'])]:
        for rule in ('all', 'any', 'atleast'):
            cases.append({'factors': ['pr_25', 'SVI', 'parcel_hu_change', 'pop_chg'], 'percentile': 80, 'rule': rule, 'minCount': 2, 'indices': membership[kind][code]['tract']})
    cases.extend([
        {'factors': ['sens_pct', 'SVI', 'hh_chg'], 'percentile': 80, 'rule': 'all'},
        {'factors': ['pr_30', 'SVI', 'parcel_hu_change', 'hp_2050', 'hh_2020', 'job_chg'], 'percentile': 75, 'rule': 'atleast', 'minCount': 3},
        {'factors': ['SVI'], 'percentile': 90, 'rule': 'all'},
        {'factors': ['pr_15', 'SVI'], 'percentile': 80, 'rule': 'all', 'indices': []},
    ])
    script = r'''
const fs=require('fs'), nativeAssert=require('assert');
let syntheticChecks=0;
const assert=new Proxy(nativeAssert,{apply(target,self,args){syntheticChecks++;return Reflect.apply(target,self,args);},get(target,key){const fn=target[key];return typeof fn==='function'?(...args)=>{syntheticChecks++;return fn(...args);}:fn;}});
const api=require('./web/overlap.js');
const rows=JSON.parse(fs.readFileSync('./data/tracts_web.geojson')).features.map(f=>f.properties);
const columns=Object.fromEntries(Object.keys(rows[0]).map(k=>[k,rows.map(r=>r[k])]));
const cases=JSON.parse(fs.readFileSync(0,'utf8'));
const original=JSON.stringify(columns);
const results=cases.map(c=>api.screen(columns,c));
assert.equal(JSON.stringify(columns),original,'Must not mutate source columns');
const selected=api.factors({gmt:'15',populationPeriod:'2050'});
assert.deepEqual(selected.map(f=>f.field),['pr_15','SVI','parcel_hu_change','hp_2050']);
assert.equal(api.factor({id:'precipitation'},{climate:'compare'}).field,'sens_pct');
assert.equal(api.quantile([null,undefined,'',false,'bad',' ',1,3,5],50),3);
assert.equal(api.quantile([],80),null);
const toy={GEOID:['a','b','c','d','e','f'],pr_25:[10,20,30,null,50,20],SVI:[.1,.2,null,.4,.5,.2],parcel_hu_change:[0,1,2,3,4,1],pop_chg:[-1,0,1,2,3,0]};
const specs=[{id:'precipitation',cutoff:20},{id:'svi',cutoff:.2},{id:'housing',cutoff:1},{id:'population',cutoff:0}];
for (const rule of ['all','any','atleast']){
 const r=api.screen(toy,{factors:specs,rule,minCount:2});
 assert(r.ok,r.error);assert.equal(r.eligibleCount,4);assert.deepEqual(r.missingIndices,[2,3]);
 assert.deepEqual(r.matchedIndices,[1,4,5]);assert.equal(r.share,.75);
 assert.equal(r.rows[0].values.population,-1,'Negative changes remain valid');
 assert.equal(r.rows[1].matchCount,4,'Values equal to cutoffs meet conditions');
 assert.equal(r.rows[2].flags.svi,null);assert.equal(r.rows[2].matched,false);
 assert.equal(r.rows[3].classKey,'missing');
 assert.equal(r.countDistribution.reduce((s,r)=>s+r.n,0),4);
}
const zeroes={pr_25:[0,0,0],SVI:[0,null,0]};
const z=api.screen(zeroes,{factors:['pr_25','SVI'],percentile:80});
assert(z.ok);assert.equal(z.matchedCount,2);assert.equal(z.thresholds[0].cutoff,0);
assert.equal(api.screen({pr_25:[null,null]},{factors:['pr_25']}).ok,false);
for(const config of [{factors:[]},{factors:['pr_25','pr_30']},{factors:['nope']},{percentile:101},{percentile:-1},{percentile:null},{percentile:false},{rule:'bad'},{rule:'atleast',minCount:5},{indices:[-1]},{indices:[0,0]}])assert.equal(api.screen(toy,config).ok,false,JSON.stringify(config));
process.stdout.write(JSON.stringify({results,syntheticChecks,noMutation:true}));
'''
    output = subprocess.run([node, '-e', script], input=json.dumps(cases), text=True, cwd=ROOT, check=True, capture_output=True)
    js = json.loads(output.stdout)
    evidence = []
    for case, actual in zip(cases, js['results']):
        assert actual['ok'], actual.get('error')
        fields, p = case['factors'], case['percentile']
        cuts = {field: quantile([row[field] for row in rows], p) for field in fields}
        for descriptor in actual['thresholds']:
            assert math.isclose(descriptor['cutoff'], cuts[descriptor['field']], rel_tol=1e-12, abs_tol=1e-12)
        idx = case.get('indices', list(range(len(rows))))
        eligible, expected, missing, counts = [], [], [], [0] * (len(fields) + 1)
        minimum = len(fields) if case['rule'] == 'all' else 1 if case['rule'] == 'any' else case['minCount']
        for i in idx:
            vals = [rows[i][f] for f in fields]
            if any(v is None or not math.isfinite(v) for v in vals):
                missing.append(i)
                continue
            eligible.append(i)
            hits = sum(rows[i][f] >= cuts[f] for f in fields)
            counts[hits] += 1
            if hits >= minimum:
                expected.append(i)
        assert actual['matchedIndices'] == expected, (case, 'matched set differs')
        assert actual['eligibleIndices'] == eligible
        assert actual['missingIndices'] == missing
        assert [d['n'] for d in actual['countDistribution']] == counts
        share = len(expected) / len(eligible) if eligible else None
        assert actual['share'] == share
        evidence.append({'fields': fields, 'percentile': p, 'rule': case['rule'], 'minimum': minimum, 'scope_count': len(idx), 'eligible_count': len(eligible), 'matched_count': len(expected), 'cutoffs': cuts})
    report = {'result': 'passed', 'source_tracts': len(rows), 'independent_configurations': len(cases), 'synthetic_checks': js['syntheticChecks'], 'source_columns_unchanged': js['noMutation'], 'quantile': 'Independent Python implementation of linear interpolation at (n-1)*p/100', 'comparison': 'Raw value >= cutoff; exact ties included', 'missing': 'Complete-case exclusion for all/any/atleast; empty denominator returns null share', 'cases': evidence}
    path = ROOT / 'qa' / 'overlap_validation.json'
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + '\n')
    print(f"PASS: {len(cases)} source-data configurations; {js['syntheticChecks']} synthetic checks; no source mutation.")
    print(path)


if __name__ == '__main__':
    main()
