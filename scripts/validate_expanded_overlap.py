#!/usr/bin/env python3
"""Independently verify the expanded numeric/category screening engine.

The Python reference computes source-data cutoffs, category membership and
complete-case sets without consulting JavaScript result descriptors. Spatial
derivation is checked separately by validate_expanded_indicators.py.
Requires Python's standard library and Node.js.
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def quantile(values, percentile):
    values = sorted(value for value in values if finite(value))
    if not values:
        return None
    pos = (len(values) - 1) * percentile / 100
    lo, hi = math.floor(pos), math.ceil(pos)
    return values[lo] + (values[hi] - values[lo]) * (pos - lo)


def main():
    node = shutil.which('node')
    assert node, 'Node.js is required.'
    rows = [f['properties'] for f in json.loads((ROOT / 'data/tracts_web.geojson').read_text())['features']]
    expanded = json.loads((ROOT / 'data/expanded_indicator_fields.json').read_text())
    assert expanded['metadata']['geoid_order'] == [str(row['GEOID']) for row in rows], 'Derived columns must retain source tract order.'
    columns = {key: [row.get(key) for row in rows] for key in rows[0]}
    columns.update(expanded['columns'])
    fixed_labels = {
        (False, False, False): 'None high', (True, False, False): 'Hazard only',
        (False, True, False): 'Growth only', (False, False, True): 'SVI only',
        (True, True, False): 'Hazard + growth', (True, False, True): 'Hazard + SVI',
        (False, True, True): 'Growth + SVI', (True, True, True): 'All three high',
    }
    columns['hotspot_combo'] = []
    for row in rows:
        flags = (round(row['pr_25'], 3) >= 203.603, row['hh_chg'] >= 746, row['SVI'] >= .88386)
        assert sum(flags) == row['hotspot_sc'], 'Fixed categorical reconstruction differs from the supplied hotspot score.'
        columns['hotspot_combo'].append(fixed_labels[flags])
    fields = expanded['metadata']['fields']
    membership = json.loads((ROOT / 'data/guided_scope_membership.json').read_text())
    cases = []

    def add(name, specs, expected_fields, *, categories=None, **options):
        assert len(specs) == len(expected_fields)
        case = {'name': name, 'options': {'factors': specs, 'percentile': 80, 'rule': 'all', **options},
                'fields': expected_fields, 'categories': categories or {}}
        cases.append(case)

    def pair(name, spec, field, *, categories=None):
        add(name, [spec, {'id': 'svi'}], [field, 'SVI'], categories=categories)

    for gmt in ('15', '20', '25', '30'):
        pair('tract precipitation ' + gmt, {'id': 'precipitation', 'gmt': gmt}, 'pr_' + gmt)
        pair('model points ' + gmt, {'id': 'pr_points', 'gmt': gmt}, 'point_pr_' + gmt)
        pair('surface tract proxy ' + gmt, {'id': 'pr_kriging', 'gmt': gmt}, 'pr_' + gmt)
    pair('precipitation comparison', {'id': 'precipitation', 'climate': 'compare'}, 'sens_pct')
    pair('precipitation change family', {'id': 'pr_change'}, 'sens_pct')
    for factor_id, field in [('housing', 'parcel_hu_change'), ('pop_density', 'pop_den'), ('sf_tract', 'n_single_f'), ('mf_tract', 'n_multi_fa')]:
        pair(factor_id, {'id': factor_id}, field)
    for factor_id, period_fields in {
        'population': {'2020': 'hp_2020', '2050': 'hp_2050', 'change': 'pop_chg'},
        'households': {'2020': 'hh_2020', '2050': 'hh_2050', 'change': 'hh_chg'},
        'employment': {'2020': 'j_2020', '2050': 'j_2050', 'change': 'job_chg'},
        'chei': {'2020': 'CHEI_2020', '2050': 'CHEI_2050', 'change': 'adapt_gap'},
    }.items():
        for period, field in period_fields.items():
            pair(factor_id + ' ' + period, {'id': factor_id, 'period': period}, field)
    for factor_id, type_fields in {
        'housing_density': {'combined': 'grid_total_median', 'single': 'grid_sf_median', 'multi': 'grid_mf_median'},
        'housing_points': {'combined': 'housing_total_records', 'single': 'n_single_f', 'multi': 'n_multi_fa'},
    }.items():
        for housing, field in type_fields.items():
            pair(factor_id + ' ' + housing, {'id': factor_id, 'housing': housing}, field)
    for label in fixed_labels.values():
        pair('fixed hotspot ' + label, {'id': 'hotspot', 'allowedValues': [label]}, 'hotspot_combo', categories={'hotspot_combo': [label]})
    pair('fixed hotspot default', {'id': 'hotspot'}, 'hotspot_combo', categories={'hotspot_combo': ['All three high']})
    pair('fixed hotspot multiple categories', {'id': 'hotspot', 'allowedValues': ['Hazard + SVI', 'All three high']}, 'hotspot_combo', categories={'hotspot_combo': ['Hazard + SVI', 'All three high']})
    for period, field in [('2020', 'parcel_current_lu_mode'), ('2050', 'parcel_future_lu_mode')]:
        pair('land use default ' + period, {'id': 'land_use', 'period': period}, field, categories={field: fields[field]['defaultValues']})
        pair('land use every source category ' + period, {'id': 'land_use', 'period': period, 'allowedValues': fields[field]['categories']}, field, categories={field: fields[field]['categories']})
    pair('known category absent as tract mode', {'id': 'land_use', 'period': '2020', 'allowedValues': ['Unknown']}, 'parcel_current_lu_mode', categories={'parcel_current_lu_mode': ['Unknown']})

    # Sixteen distinct source conditions include every family except the exact
    # tract-precipitation alias. That alias is tested independently above and
    # rejected when duplicated below.
    broad_specs = [
        {'id': 'precipitation', 'gmt': '25'}, {'id': 'svi'}, {'id': 'housing'},
        {'id': 'population', 'period': '2050'}, {'id': 'households', 'period': 'change'},
        {'id': 'employment', 'period': '2020'}, {'id': 'chei', 'period': '2050'},
        {'id': 'pop_density'}, {'id': 'sf_tract'}, {'id': 'mf_tract'},
        {'id': 'hotspot', 'allowedValues': ['Hazard + SVI', 'All three high']},
        {'id': 'pr_points', 'gmt': '25'}, {'id': 'pr_change'},
        {'id': 'housing_density', 'housing': 'combined'}, {'id': 'housing_points', 'housing': 'combined'},
        {'id': 'land_use', 'period': '2050', 'allowedValues': ['Residential']},
    ]
    broad_fields = ['pr_25', 'SVI', 'parcel_hu_change', 'hp_2050', 'hh_chg', 'j_2020', 'CHEI_2050', 'pop_den',
                    'n_single_f', 'n_multi_fa', 'hotspot_combo', 'point_pr_25', 'sens_pct', 'grid_total_median',
                    'housing_total_records', 'parcel_future_lu_mode']
    broad_categories = {'hotspot_combo': ['Hazard + SVI', 'All three high'], 'parcel_future_lu_mode': ['Residential']}
    scopes = [('county', None), ('ZIP 77007', membership['zip']['77007']['tract']),
              ('precinct 1', membership['precinct']['1']['tract']), ('tract', [0]), ('empty scope', [])]
    for scope_name, indices in scopes:
        for rule in ('all', 'any', 'atleast'):
            add('sixteen factors ' + scope_name + ' ' + rule, broad_specs, broad_fields,
                categories=broad_categories, rule=rule, minCount=4, **({} if indices is None else {'indices': indices}))
    for percentile in (75, 90):
        for rule in ('all', 'any', 'atleast'):
            add('sixteen factors percentile ' + str(percentile) + ' ' + rule, broad_specs, broad_fields,
                categories=broad_categories, rule=rule, minCount=4, percentile=percentile)
    add('mixed custom cutoff', [{'id': 'chei', 'period': 'change', 'cutoff': 0}, {'id': 'land_use', 'period': '2020', 'allowedValues': ['Residential', 'Multiple']}],
        ['adapt_gap', 'parcel_current_lu_mode'], categories={'parcel_current_lu_mode': ['Residential', 'Multiple']}, rule='any')

    script = r'''
const fs=require('fs'), nativeAssert=require('assert');
let syntheticChecks=0;
const assert=new Proxy(nativeAssert,{apply(target,self,args){syntheticChecks++;return Reflect.apply(target,self,args);},get(target,key){const fn=target[key];return typeof fn==='function'?(...args)=>{syntheticChecks++;return fn(...args);}:fn;}});
const api=require('./web/overlap.js'), input=JSON.parse(fs.readFileSync(0,'utf8'));
const original=JSON.stringify(input.columns), beforeMeta=JSON.stringify(input.metadata), beforeCases=JSON.stringify(input.cases);
const results=input.cases.map(c=>{
 const r=api.screen(input.columns,{...c.options,metadata:input.metadata});
 if(!r.ok)return r;
 return {ok:r.ok,thresholds:r.thresholds,factorCount:r.factorCount,numericFactorCount:r.numericFactorCount,
 categoryFactorCount:r.categoryFactorCount,matchedIndices:r.matchedIndices,missingIndices:r.missingIndices,
 eligibleIndices:r.eligibleIndices,countDistribution:r.countDistribution,combinationCounts:r.combinationCounts,
 share:r.share,factorSummaries:r.factorSummaries,warnings:r.warnings};
});
assert.equal(JSON.stringify(input.columns),original,'Source columns changed');
assert.equal(JSON.stringify(input.metadata),beforeMeta,'Metadata changed');
assert.equal(JSON.stringify(input.cases),beforeCases,'Configuration changed');
assert.equal(api.factor({id:'chei',period:'2020'}).field,'CHEI_2020');
assert.equal(api.factor({id:'chei',period:'change'}).field,'adapt_gap');
assert.equal(api.factor({id:'housing_points',housing:'combined'}).field,'housing_total_records');
assert.equal(api.factor({id:'pr_kriging',gmt:'1.5'}).field,'pr_15');
assert.equal(api.factor({id:'housing_points',housing:'single'}).field,'n_single_f');
assert.equal(api.factor({id:'pr_points',gmt:'3.0'},{metadata:input.metadata}).field,'point_pr_30');
assert.equal(api.factor({id:'land_use',period:'2020'},{metadata:input.metadata}).kind,'category');
assert.deepEqual(api.factor({id:'land_use',period:'2050'},{metadata:input.metadata}).allowedValues,['Residential']);
assert.deepEqual(api.factor({id:'hotspot'}).allowedValues,['All three high']);
assert.throws(()=>api.factor({id:'svi',field:'hp_2020'}),/does not match/);

const categoryMeta={c:{id:'category',kind:'category',label:'Test category',short:'Test category',unit:'category',categories:['A','B','C'],defaultValues:['A']}};
const toy={GEOID:['a','b','c','d','e','f'],pr_25:[10,20,30,null,50,20],c:['B','A',null,'A','B','A']};
const specs=[{id:'precipitation',cutoff:20},{id:'category',field:'c',allowedValues:['A']}];
for(const rule of ['all','any','atleast']){
 const r=api.screen(toy,{factors:specs,metadata:categoryMeta,rule,minCount:2});
 assert(r.ok,r.error);assert.equal(r.eligibleCount,4);assert.deepEqual(r.missingIndices,[2,3]);
 assert.deepEqual(r.matchedIndices,rule==='any'?[1,4,5]:[1,5]);
 assert.equal(r.categoryFactorCount,1);assert.equal(r.numericFactorCount,1);
 assert.equal(r.thresholds[1].cutoff,null);assert.equal(r.thresholds[1].percentile,null);
 assert.equal(r.rows[1].values.category,'A');assert.equal(r.rows[2].values.category,null);
 assert.equal(r.rows[3].flags.category,true);assert.equal(r.rows[3].matched,false);
 assert.equal(r.rows[1].flags.precipitation,true,'Numeric cutoff equality is retained');
 assert.equal(r.rows[2].combinationKey,'1?');assert.equal(r.rows[3].combinationKey,'?1');
 assert.deepEqual(r.factorSummaries[1].selectedStats.counts,{A:3,B:2});
 assert.equal(r.factorSummaries[1].matchedStats.median,null);
 assert.equal(r.factorSummaries[1].conditionCount,3);
 assert.equal(r.countDistribution.reduce((total,d)=>total+d.n,0),4);
}
const absent=api.screen(toy,{factors:[{id:'category',field:'c',allowedValues:['C']}],metadata:categoryMeta});
assert(absent.ok);assert.equal(absent.matchedCount,0);assert.equal(absent.eligibleCount,5);
for(const allowedValues of [[],['Z']])assert.equal(api.screen(toy,{factors:[{id:'category',field:'c',allowedValues}],metadata:categoryMeta}).ok,false);
assert.equal(api.screen(toy,{factors:[{id:'category',field:'c',allowedValues:['A'],cutoff:1}],metadata:categoryMeta}).ok,false);
assert.equal(api.screen(toy,{factors:[{id:'category',field:'c',allowedValues:'A'}],metadata:categoryMeta}).ok,false);
const zero=api.screen({c:[null,'',false]},{factors:[{field:'c',allowedValues:['A']}],metadata:categoryMeta});
assert(zero.ok);assert.equal(zero.eligibleCount,0);assert.equal(zero.share,null);assert.equal(zero.matchedCount,0);
const numericLabels={c:{...categoryMeta.c,categories:['1','2','10'],defaultValues:['2']}};
const labels=api.screen({c:[1,2,10,'2']},{factors:[{field:'c'}],metadata:numericLabels,percentile:90});
assert(labels.ok);assert.deepEqual(labels.matchedIndices,[1,3]);assert.equal(labels.rows[1].values.category,'2');
assert.deepEqual(api.categoryStats(['__proto__','__proto__','constructor']).counts,JSON.parse('{"__proto__":2,"constructor":1}'));

for(const factors of [
 [{id:'precipitation',gmt:'25'},{id:'pr_kriging',gmt:'25'}],
 [{id:'precipitation',climate:'compare'},{id:'pr_change'}],
 [{id:'sf_tract'},{id:'housing_points',housing:'single'}],
 [{id:'mf_tract'},{id:'housing_points',housing:'multi'}]
]){const r=api.screen(input.columns,{factors,metadata:input.metadata});assert.equal(r.ok,false);assert.match(r.error,/same source field/);}
const related=api.screen(input.columns,{factors:[{id:'chei'},{id:'svi'},{id:'hotspot'},{id:'pr_points'},{id:'pr_kriging'}],metadata:input.metadata,rule:'any'});
assert(related.ok,related.error);assert(related.warnings.some(w=>w.includes('composite')));assert(related.warnings.some(w=>w.includes('related precipitation')));assert(related.warnings.some(w=>w.includes('fixed hotspot')));
const missingIndex=input.columns.point_pr_25.findIndex(x=>x===null);
const missingScope=api.screen(input.columns,{factors:[{id:'pr_points'},{id:'svi'}],metadata:input.metadata,indices:[missingIndex],rule:'any'});
assert(missingScope.ok);assert.equal(missingScope.eligibleCount,0);assert.equal(missingScope.share,null);assert.equal(missingScope.matchedCount,0);
assert.equal(api.screen(input.columns,{factors:[{id:'land_use',period:'2090'}],metadata:input.metadata}).ok,false);
assert.equal(api.screen(input.columns,{factors:[{id:'pr_points',gmt:'40'}],metadata:input.metadata}).ok,false);

// A distinct high bit must not collapse into a 32-bit mask collision.
const manyData={},manyMetadata={},manySpecs=[];
for(let j=0;j<65;j++){
 const field='x'+j,id='factor'+j;manyData[field]=j===32?[0,1,1]:[1,0,1];
 manyMetadata[field]={id,label:id,short:id,unit:'count'};manySpecs.push({id,field,cutoff:1});
}
for(const count of [7,33,64]){
 const r=api.screen(manyData,{factors:manySpecs.slice(0,count),metadata:manyMetadata});
 assert(r.ok,r.error);assert.equal(r.factorCount,count);assert.equal(r.rows[2].matchCount,count);
 assert.equal(r.rows[2].combinationKey.length,count);assert.deepEqual(r.matchedIndices,count<33?[0,2]:[2]);
 if(count>30){assert.equal(r.rows[0].mask,null);assert.equal(new Set(r.combinationCounts.map(x=>x.key)).size,3);}
}
assert.equal(api.screen(manyData,{factors:manySpecs,metadata:manyMetadata}).ok,false);
process.stdout.write(JSON.stringify({results,syntheticChecks,noMutation:true}));
'''
    payload = {'columns': columns, 'metadata': fields, 'cases': cases}
    result = subprocess.run([node, '-e', script], input=json.dumps(payload), cwd=ROOT, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    output = json.loads(result.stdout)
    evidence = []
    for case, actual in zip(cases, output['results']):
        assert actual['ok'], (case['name'], actual.get('error'))
        expected_fields, categories, options = case['fields'], case['categories'], case['options']
        assert [d['field'] for d in actual['thresholds']] == expected_fields, (case['name'], 'field mapping')
        cuts = {}
        for spec, field, descriptor in zip(options['factors'], expected_fields, actual['thresholds']):
            if field in categories:
                assert descriptor['kind'] == 'category' and descriptor['cutoff'] is None and descriptor['percentile'] is None
                assert descriptor['allowedValues'] == categories[field]
                cuts[field] = None
            else:
                cuts[field] = spec.get('cutoff', quantile(columns[field], options['percentile']))
                assert descriptor['kind'] == 'numeric'
                assert math.isclose(descriptor['cutoff'], cuts[field], rel_tol=1e-12, abs_tol=1e-12)
        selected = options.get('indices', list(range(len(rows))))
        minimum = len(expected_fields) if options['rule'] == 'all' else 1 if options['rule'] == 'any' else options['minCount']
        matched, missing, eligible, distribution = [], [], [], [0] * (len(expected_fields) + 1)
        combinations = Counter()
        flags_by_index = {}
        for index in selected:
            valid = all(isinstance(columns[f][index], str) and bool(columns[f][index].strip()) if f in categories else finite(columns[f][index]) for f in expected_fields)
            if not valid:
                missing.append(index)
                continue
            eligible.append(index)
            flags = [columns[f][index] in categories[f] if f in categories else columns[f][index] >= cuts[f] for f in expected_fields]
            flags_by_index[index] = flags
            hits = sum(flags)
            distribution[hits] += 1
            combinations[''.join('1' if flag else '0' for flag in flags)] += 1
            if hits >= minimum:
                matched.append(index)
        assert actual['matchedIndices'] == matched, (case['name'], 'matched set')
        assert actual['eligibleIndices'] == eligible, (case['name'], 'complete-case set')
        assert actual['missingIndices'] == missing, (case['name'], 'missing set')
        assert [d['n'] for d in actual['countDistribution']] == distribution
        assert {c['key']: c['count'] for c in actual['combinationCounts']} == dict(combinations)
        assert actual['share'] == (len(matched) / len(eligible) if eligible else None)
        assert actual['categoryFactorCount'] == len(categories)
        assert actual['numericFactorCount'] == len(expected_fields) - len(categories)
        for field, summary in zip(expected_fields, actual['factorSummaries']):
            if field in categories:
                selected_counts = Counter(columns[field][i] for i in selected if isinstance(columns[field][i], str) and columns[field][i].strip())
                matched_counts = Counter(columns[field][i] for i in matched)
                assert summary['selectedStats']['counts'] == dict(selected_counts)
                assert summary['matchedStats']['counts'] == dict(matched_counts)
                assert summary['selectedStats']['median'] is None
                assert summary['conditionCount'] == sum(count for label, count in selected_counts.items() if label in categories[field])
        evidence.append({'name': case['name'], 'fields': expected_fields, 'categories': categories, 'numeric_cutoffs': {f: c for f, c in cuts.items() if c is not None},
                         'scope_count': len(selected), 'eligible_count': len(eligible), 'missing_count': len(missing), 'matched_count': len(matched),
                         'rule': options['rule'], 'minimum': minimum})
    report = {'result': 'passed', 'source_tracts': len(rows), 'source_families_covered': sorted({s['id'] for c in cases for s in c['options']['factors']}),
              'independent_configurations': len(cases), 'synthetic_checks': output['syntheticChecks'], 'source_columns_and_metadata_unchanged': output['noMutation'],
              'checks': ['Independent numeric quantiles and unrounded >= comparisons', 'Exact categorical membership and preserved category summaries',
                         'All/any/at-least complete-case sets at county/ZIP/precinct/tract/empty scopes', 'Known absent and invalid category handling',
                         'Exact duplicate source alias rejection', 'Sparse point coverage stays missing', 'More than six conditions; string keys beyond 30 conditions'],
              'cases': evidence}
    path = ROOT / 'qa/expanded_overlap_validation.json'
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + '\n')
    print(f"PASS: {len(cases)} expanded source-data configurations; {output['syntheticChecks']} synthetic checks; {len(report['source_families_covered'])} source families; source data unchanged.")
    print(path)


if __name__ == '__main__':
    main()
