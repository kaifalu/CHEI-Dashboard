/* Transparent tract overlap screening. No DOM, map or source-data mutation.
 * Countywide linear-interpolated percentiles use each field's finite values.
 * Every rule uses the same complete-case denominator; missing is not zero.
 * This exploratory screen does not recalculate CHEI or fixed hotspot classes.
 */
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CHEIOverlap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const METHODS = Object.freeze({
    quantile: 'Linear interpolation at (n - 1) × percentile / 100, using finite countywide values separately for each factor.',
    comparison: 'Numeric conditions compare the original, unrounded source value with its cutoff using greater than or equal. Category conditions test exact membership in the selected categories. Ties are included; category labels have no numeric rank.',
    missing: 'A tract with any missing selected-factor value is excluded from all screening rules and from the matched-share denominator. It remains visible as missing data.',
    geography: 'ZIP and precinct screens use whole intersecting census tracts, including boundary touches, without spatial allocation or population weighting.',
    purpose: 'Exploratory co-occurrence screen, not a new exposure index, probability, causal result, or recalculation of the supplied CHEI or fixed compound hotspots.'
  });

  const FIELD_META = Object.freeze({
    pr_15: {id:'precipitation',label:'Extreme precipitation · +1.5°C',short:'Extreme precipitation',unit:'mm',decimals:3,period:'20-year window at GMT +1.5°C; not a calendar year',source:'Supplied tract precipitation at GMT +1.5°C'},
    pr_20: {id:'precipitation',label:'Extreme precipitation · +2.0°C',short:'Extreme precipitation',unit:'mm',decimals:3,period:'20-year window at GMT +2.0°C; not a calendar year',source:'Supplied tract precipitation at GMT +2.0°C'},
    pr_25: {id:'precipitation',label:'Extreme precipitation · +2.5°C',short:'Extreme precipitation',unit:'mm',decimals:3,period:'20-year window at GMT +2.5°C; not a calendar year',source:'Supplied tract precipitation at GMT +2.5°C'},
    pr_30: {id:'precipitation',label:'Extreme precipitation · +3.0°C',short:'Extreme precipitation',unit:'mm',decimals:3,period:'20-year window at GMT +3.0°C; not a calendar year',source:'Supplied tract precipitation at GMT +3.0°C'},
    sens_pct: {id:'precipitation',label:'Precipitation change · +2.5°C versus +1.5°C',short:'Precipitation change',unit:'%',decimals:3,period:'GMT +2.5°C relative to +1.5°C; not 2020–2050',source:'Supplied tract percentage-change layer'},
    SVI: {id:'svi',label:'Social vulnerability · 2020',short:'Social vulnerability',unit:'SVI percentile (0–1)',decimals:5,period:'2020 baseline; no future SVI supplied',source:'Supplied CDC/ATSDR overall SVI'},
    parcel_hu_change: {id:'housing',label:'Housing-unit growth · 2020–2050',short:'Housing-unit growth',unit:'housing units',decimals:0,period:'Projected 2050 minus 2020',source:'Supplied changing-parcel housing-unit changes allocated to tracts by representative point',note:'Covers supplied parcels with housing-unit changes. A zero means no net allocated change in this source, not an absence of housing. Housing units and households are different measures.'},
    hp_2020: {id:'population',label:'Population · 2020',short:'Population',unit:'people',decimals:0,period:'2020 baseline',source:'Supplied H-GAC tract population baseline'},
    hp_2050: {id:'population',label:'Population · 2050',short:'Population',unit:'people',decimals:0,period:'2050 projection',source:'Supplied H-GAC tract population projection'},
    pop_chg: {id:'population',label:'Population growth · 2020–2050',short:'Population growth',unit:'people',decimals:0,period:'Projected 2050 minus 2020',source:'Supplied H-GAC tract population change'},
    hh_2020: {id:'households',label:'Households · 2020',short:'Households',unit:'households',decimals:0,period:'2020 baseline',source:'Supplied H-GAC tract household baseline'},
    hh_2050: {id:'households',label:'Households · 2050',short:'Households',unit:'households',decimals:0,period:'2050 projection',source:'Supplied H-GAC tract household projection'},
    hh_chg: {id:'households',label:'Household growth · 2020–2050',short:'Household growth',unit:'households',decimals:0,period:'Projected 2050 minus 2020',source:'Supplied H-GAC tract household change',note:'Counts households, not housing units. This is the growth variable used in the separate fixed three-factor hotspot layer.'},
    j_2020: {id:'employment',label:'Employment · 2020',short:'Employment',unit:'jobs',decimals:0,period:'2020 baseline',source:'Supplied H-GAC tract employment baseline'},
    j_2050: {id:'employment',label:'Employment · 2050',short:'Employment',unit:'jobs',decimals:0,period:'2050 projection',source:'Supplied H-GAC tract employment projection'},
    job_chg: {id:'employment',label:'Employment growth · 2020–2050',short:'Employment growth',unit:'jobs',decimals:0,period:'Projected 2050 minus 2020',source:'Supplied H-GAC tract employment change'},
    CHEI_2020: {id:'chei',label:'Climate-Housing Exposure Index · 2020',short:'CHEI',unit:'index',decimals:3,period:'Supplied 2020 baseline',source:'Supplied CHEI baseline',note:'The supplied composite index is not recalculated for a selected precipitation condition. It can share inputs with other selected indicators.'},
    CHEI_2050: {id:'chei',label:'Climate-Housing Exposure Index · 2050',short:'CHEI',unit:'index',decimals:3,period:'Supplied 2050 projection',source:'Supplied CHEI projection',note:'The supplied composite index is not recalculated for a selected precipitation condition. It can share inputs with other selected indicators.'},
    adapt_gap: {id:'chei',label:'CHEI change · 2050 minus 2020',short:'CHEI change',unit:'index change',decimals:3,period:'Supplied 2050 minus 2020',source:'Supplied CHEI change',note:'Positive and negative source changes remain valid. This composite difference is not recalculated for the precipitation setting.'},
    pop_den: {id:'pop_density',label:'Population density · 2020',short:'Population density',unit:'source density unit',decimals:3,period:'2020 baseline',source:'Supplied tract population-density field',note:'The prepared data do not establish the density denominator; the source density unit is retained.'},
    n_single_f: {id:'sf_tract',label:'Single-family housing records · 2020',short:'Single-family housing',unit:'source housing records',decimals:0,period:'2020 housing-stock baseline',source:'Supplied complete tract single-family record count',note:'Source records are not automatically equivalent to independently verified dwelling units.'},
    n_multi_fa: {id:'mf_tract',label:'Multi-family housing records · 2020',short:'Multi-family housing',unit:'source housing records',decimals:0,period:'2020 housing-stock baseline',source:'Supplied complete tract multi-family record count',note:'A multi-family property record is not an independently verified dwelling-unit total.'},
    housing_total_records: {id:'housing_points',label:'Housing locations · complete tract record count',short:'Housing locations',unit:'source housing records',decimals:0,period:'2020 housing-stock baseline',source:'Sum of supplied complete tract single-family and multi-family record counts',note:'Combination screening uses complete tract source counts, not the sampled point-display count. These are housing records, not verified dwelling units.'},
    hotspot_combo: {id:'hotspot',kind:'category',label:'Fixed compound-hotspot category',short:'Compound hotspots',unit:'category',decimals:0,period:'Fixed +2.5°C precipitation, 2020–2050 household growth, and 2020 SVI',source:'Supplied fixed three-condition hotspot definition',categories:['None high','Hazard only','Growth only','SVI only','Hazard + growth','Hazard + SVI','Growth + SVI','All three high'],defaultValues:['All three high'],note:'Choose which fixed categories meet this condition. Categories are not ranked or converted to percentile cutoffs. The fixed definition does not change with the selected climate input.'}

  });

  // Explicit checks avoid Number(null), Number('') and Number(false) becoming zero.
  function isFiniteValue(value) {
    return (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
  }
  function numeric(value) { return isFiniteValue(value) ? Number(value) : null; }
  function quantile(values, percentile) {
    if (!Number.isFinite(percentile) || percentile < 0 || percentile > 100) return null;
    const a = Array.from(values || []).filter(isFiniteValue).map(Number).sort((a,b)=>a-b);
    if (!a.length) return null;
    const position = (a.length - 1) * percentile / 100, low = Math.floor(position), high = Math.ceil(position);
    return a[low] + (a[high] - a[low]) * (position - low);
  }
  function stats(values) {
    const a = Array.from(values || []).filter(isFiniteValue).map(Number).sort((a,b)=>a-b);
    return {n:a.length, min:a.length?a[0]:null, max:a.length?a[a.length-1]:null, median:quantile(a,50)};
  }
  // IDs match the visible single-layer families. Aliases support prior names.
  const CATALOG = Object.freeze({
    precipitation:{climate:true}, svi:{field:'SVI'}, housing:{field:'parcel_hu_change'},
    population:{periodFields:{'2020':'hp_2020','2050':'hp_2050',change:'pop_chg'},defaultPeriod:'change'},
    households:{periodFields:{'2020':'hh_2020','2050':'hh_2050',change:'hh_chg'},defaultPeriod:'change'},
    employment:{periodFields:{'2020':'j_2020','2050':'j_2050',change:'job_chg'},defaultPeriod:'change'},
    chei:{periodFields:{'2020':'CHEI_2020','2050':'CHEI_2050',change:'adapt_gap'},defaultPeriod:'2050'},
    pop_density:{field:'pop_den'}, sf_tract:{field:'n_single_f'}, mf_tract:{field:'n_multi_fa'},hotspot:{field:'hotspot_combo'},
    pr_change:{field:'sens_pct',alias:true,short:'Precipitation change'},
    pr_points:{gmtPrefix:'point_pr_',short:'Climate model points'},
    pr_kriging:{gmtPrefix:'pr_',alias:true,short:'Kriging surface context',labelPrefix:'Kriging surface context',note:'Uses corresponding tract precipitation attributes for combination screening, not extracted raster-pixel statistics. This is an alternative representation of the same tract precipitation input.'},
    housing_density:{housingFields:{combined:'grid_total_median',single:'grid_sf_median',multi:'grid_mf_median'},short:'Housing concentration'},
    housing_points:{housingFields:{combined:'housing_total_records',single:'n_single_f',multi:'n_multi_fa'},alias:true,short:'Housing locations',labelPrefix:'Housing locations · complete tract count',note:'Uses complete tract source housing-record counts for combination screening; the sampled individual point display is not used to estimate totals.'},
    land_use:{periodFields:{'2020':'parcel_current_lu_mode','2050':'parcel_future_lu_mode'},defaultPeriod:'2050'},
    changed_parcels:{field:'parcel_count'},
    parcel_units:{periodFields:{'2020':'parcel_current_units','2050':'parcel_future_units',change:'parcel_hu_change'},defaultPeriod:'2050',alias:true},
    climate_points:{aliasId:'pr_points'},climate_surface:{aliasId:'pr_kriging'},
    housing_grid:{aliasId:'housing_density'},housing_locations:{aliasId:'housing_points'},parcel_count:{aliasId:'changed_parcels'}
  });
  function metadata(options={}) { return Object.assign({},FIELD_META,options.extraMetadata||{},options.metadata||{}); }
  function normalizeGMT(value){const g=String(value??'25');return {'1.5':'15','2':'20','2.0':'20','2.5':'25','3':'30','3.0':'30'}[g]||g;}
  function normalizePeriod(value){return {baseline:'2020',projection:'2050',growth:'change'}[value]||value;}
  function category(value){return typeof value==='string'&&value.trim()!==''?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):null;}
  function categoryStats(values){const counts=Object.create(null);let n=0;for(const raw of values||[]){const v=category(raw);if(v!==null){counts[v]=(counts[v]||0)+1;n++;}}return {n,counts,categories:Object.keys(counts).sort(),median:null,min:null,max:null};}
  function factor(spec, options={}) {
    const fields=metadata(options),catalog=Object.assign({},CATALOG,options.catalog||{});
    if (typeof spec === 'string') spec = fields[spec] ? {field:spec} : {id:spec};
    if (!spec || typeof spec !== 'object') throw new Error('Each factor must be a supported factor ID or descriptor.');
    let field=spec.field,id=spec.id,cfg=catalog[id];
    if(cfg?.aliasId)cfg=Object.assign({},catalog[cfg.aliasId],cfg);
    if (!field) {
      if(cfg?.climate){field=(spec.climate||options.climate)==='compare'?'sens_pct':'pr_'+normalizeGMT(spec.gmt??options.gmt);}
      else if(cfg?.field)field=cfg.field;
      else if(cfg?.gmtPrefix)field=cfg.gmtPrefix+normalizeGMT(spec.gmt??options.gmt);
      else if(cfg?.housingFields)field=cfg.housingFields[spec.housing||spec.housingType||options.housing||'combined'];
      else if(cfg?.periodFields){const period=normalizePeriod(spec.period||options[id+'Period']||options.period||(id==='population'?options.populationPeriod:null)||cfg.defaultPeriod);field=cfg.periodFields[period];}
      else {
        const candidates=Object.entries(fields).filter(([,m])=>m.id===id);
        const period=normalizePeriod(spec.period),gmt=normalizeGMT(spec.gmt??options.gmt);
        const matching=candidates.filter(([,m])=>(!period||!m.periodKey||m.periodKey===period)&&(!m.gmt||String(m.gmt)===gmt));
        if(matching.length===1)field=matching[0][0];
      }
    }
    const meta=fields[field];
    if (!meta) throw new Error('Unsupported factor, period, or unavailable source field: '+String(spec.id||field||'empty')+'.');
    if(id&&meta.id!==id&&!cfg?.alias&&!cfg?.aliasId)throw new Error('Factor ID does not match its source field: '+id+' / '+field+'.');
    id=id||meta.id;
    const result=Object.assign({kind:'numeric'},meta,{id,field});
    result.kind=['category','categorical'].includes(result.kind)?'category':'numeric';
    if(cfg?.short)result.short=cfg.short;
    if(cfg?.labelPrefix)result.label=cfg.labelPrefix+' · '+(cfg.gmtPrefix?'+'+(Number(normalizeGMT(spec.gmt??options.gmt))/10).toFixed(1)+'°C':spec.housing==='single'?'single-family':spec.housing==='multi'?'multi-family':'combined');
    if(cfg?.note)result.note=cfg.note;
    if(result.kind==='category'){
      const raw=spec.allowedValues??spec.values??spec.categories??result.defaultValues??[];
      if(!Array.isArray(raw))throw new Error('Select one or more categories for '+result.label+'.');
      result.allowedValues=[...new Set(raw.map(category).filter(v=>v!==null))];
      result.categories=Array.isArray(result.categories)?result.categories.map(category).filter(v=>v!==null):[];
      if(Object.prototype.hasOwnProperty.call(spec,'cutoff'))throw new Error('Category indicators use selected categories, not numeric cutoffs.');
    }else if(Object.prototype.hasOwnProperty.call(spec,'cutoff')){
      if(!isFiniteValue(spec.cutoff))throw new Error('The custom cutoff for '+meta.label+' must be a finite number.');
      result.cutoff=Number(spec.cutoff);
    }
    if(Object.prototype.hasOwnProperty.call(spec,'percentile'))result.percentile=spec.percentile;
    return result;
  }
  function factors(options={}) {
    const specs=Array.isArray(options)?options:options.factors||['precipitation','svi','housing','population'];
    return specs.map(spec=>factor(spec,Array.isArray(options)?{}:options));
  }
  function failed(errors) { return {ok:false,errors,error:errors.join(' ')}; }

  function screen(data, options={}) {
    if (!data || typeof data !== 'object') return failed(['Tract column data are required.']);
    let selected;
    try { selected = factors(options); } catch(error) { return failed([error.message]); }
    if (!selected.length) return failed(['Choose at least one indicator for the screen.']);
    if (selected.length > 64) return failed(['Choose no more than 64 distinct indicator types.']);
    if (new Set(selected.map(d=>d.id)).size !== selected.length) return failed(['Choose each indicator type only once.']);
    const duplicate=selected.find((d,j)=>selected.findIndex(x=>x.field===d.field)!==j);
    if(duplicate){const first=selected.find(d=>d.field===duplicate.field);return failed(['“'+first.label+'” and “'+duplicate.label+'” use the same source field ('+duplicate.field+'). Choose one representation so the same measure is not counted twice.']);}
    const rule = options.rule || 'all';
    if (!['all','any','atleast'].includes(rule)) return failed(['Choose the all, any, or atleast matching rule.']);
    if (options.percentile !== undefined && !isFiniteValue(options.percentile)) return failed(['The percentile must be a finite number between 0 and 100.']);
    const percentile = options.percentile === undefined ? 80 : Number(options.percentile);
    if (!Number.isFinite(percentile) || percentile < 0 || percentile > 100) return failed(['The percentile must be between 0 and 100.']);
    const required = rule === 'all' ? selected.length : rule === 'any' ? 1 : Number(options.minCount);
    if (!Number.isInteger(required) || required < 1 || required > selected.length) return failed(['The minimum matching count must be an integer between 1 and the number of selected indicators.']);
    const first = data[selected[0].field];
    if (!first || typeof first.length !== 'number') return failed(['Missing source column: ' + selected[0].field + '.']);
    const n = first.length;
    const errors=[];
    const thresholds=selected.map(d=>{
      const column=data[d.field];
      if (!column || column.length !== n) {errors.push('Missing or inconsistent source column: '+d.field+'.');return null;}
      if(d.kind==='category'){
        const county=categoryStats(column),available=[...new Set([...(d.categories||[]),...county.categories])];
        if(!d.allowedValues.length){errors.push('Select at least one category for '+d.label+'.');return null;}
        const unknown=d.allowedValues.filter(v=>!available.includes(v));
        if(unknown.length){errors.push('Unknown category for '+d.label+': '+unknown.join(', ')+'.');return null;}
        return Object.assign({},d,{cutoff:null,percentile:null,p:null,method:'category',availableValues:available,countyValidCount:county.n,countyStats:county,conditionLabel:'Category is '+d.allowedValues.join(' or ')});
      }
      if (d.percentile!==undefined && !isFiniteValue(d.percentile)) {errors.push('Invalid percentile for '+d.label+'.');return null;}
      const p=d.percentile===undefined?percentile:Number(d.percentile);
      if (!Number.isFinite(p) || p<0 || p>100) {errors.push('Invalid percentile for '+d.label+'.');return null;}
      const county=stats(column),custom=Object.prototype.hasOwnProperty.call(d,'cutoff');
      const cutoff=custom?d.cutoff:quantile(column,p);
      if (cutoff===null) {errors.push('No finite countywide values are available for '+d.label+'.');return null;}
      return Object.assign({},d,{cutoff,percentile:custom?null:p,p:custom?null:p,method:custom?'custom':'percentile',countyValidCount:county.n,countyStats:county,conditionLabel:'At or above '+String(cutoff)+' '+d.unit});
    });
    if (errors.length) return failed(errors);
    const indices=options.indices===undefined?Array.from({length:n},(_,i)=>i):Array.from(options.indices);
    if (indices.some(i=>!Number.isInteger(i)||i<0||i>=n)) return failed(['The selected geography contains an invalid tract index.']);
    if (new Set(indices).size!==indices.length) return failed(['The selected geography contains duplicate tract indices.']);
    const scope=new Set(indices),factorIds=thresholds.map(d=>d.id);
    const allRows=Array.from({length:n},(_,index)=>{
      const values={},flags={},fields={},missing=[];
      let matchCount=0,mask=selected.length<=30?0:null;const bits=[];
      thresholds.forEach((d,j)=>{
        const value=d.kind==='category'?category(data[d.field][index]):numeric(data[d.field][index]),met=value===null?null:d.kind==='category'?d.allowedValues.includes(value):value>=d.cutoff;
        bits.push(met===null?'?':met?'1':'0');
        values[d.id]=value;fields[d.field]=value;flags[d.id]=met;
        if (met===null) missing.push(d.id);
        else if (met) {matchCount++;if(mask!==null)mask|=(1<<j);}
      });
      const eligible=missing.length===0;
      return {index,geoid:String(data.GEOID?.[index]??index),name:String(data.NAME?.[index]??''),inScope:scope.has(index),values,fields,flags,missing,eligible,matchCount,mask,combinationKey:bits.join(''),matched:eligible&&matchCount>=required,classKey:eligible?String(matchCount):'missing'};
    });
    const rows=indices.map(i=>allRows[i]);
    const eligibleRows=rows.filter(r=>r.eligible),missingRows=rows.filter(r=>!r.eligible),matchedRows=eligibleRows.filter(r=>r.matched);
    const countDistribution=Array.from({length:selected.length+1},(_,count)=>({count,n:0,share:0}));
    const combinationMap=new Map();
    eligibleRows.forEach(row=>{
      countDistribution[row.matchCount].n++;
      const key=row.combinationKey;
      if (!combinationMap.has(key)) combinationMap.set(key,{key,mask:row.mask,ids:factorIds.filter(id=>row.flags[id]===true),count:0,indices:[]});
      const c=combinationMap.get(key);c.count++;c.indices.push(row.index);
    });
    countDistribution.forEach(d=>d.share=eligibleRows.length?d.n/eligibleRows.length:null);
    const factorSummaries=thresholds.map(d=>{
      const valid=rows.filter(r=>r.values[d.id]!==null),high=valid.filter(r=>r.flags[d.id]);
      const eligibleHigh=eligibleRows.filter(r=>r.flags[d.id]);
      return Object.assign({},d,{validCount:valid.length,missingCount:rows.length-valid.length,highCount:high.length,highShare:valid.length?high.length/valid.length:null,eligibleHighCount:eligibleHigh.length,conditionCount:high.length,conditionShare:valid.length?high.length/valid.length:null,selectedStats:d.kind==='category'?categoryStats(valid.map(r=>r.values[d.id])):stats(valid.map(r=>r.values[d.id])),matchedStats:d.kind==='category'?categoryStats(matchedRows.map(r=>r.values[d.id])):stats(matchedRows.map(r=>r.values[d.id]))});
    });
    const warnings=[];
    if (missingRows.length) warnings.push(missingRows.length+' selected tracts have a missing value in at least one chosen indicator and are excluded from the screening denominator.');
    thresholds.forEach(d=>{
      const countyHigh=Array.from(data[d.field]).filter(v=>d.kind==='category'?category(v)!==null&&d.allowedValues.includes(category(v)):isFiniteValue(v)&&Number(v)>=d.cutoff).length;
      d.countyHighCount=countyHigh;
      d.countyHighShare=d.countyValidCount?countyHigh/d.countyValidCount:null;
      if (d.method==='percentile' && countyHigh>d.countyValidCount*(1-d.percentile/100)+1) warnings.push('Ties at the cutoff mean more than '+(100-d.percentile)+'% of county tracts may meet the '+d.short.toLowerCase()+' condition.');
    });
    const climateInputs=thresholds.filter(d=>/^(pr_|point_pr_|sens_pct$)/.test(d.field));
    if(climateInputs.length>1)warnings.push('Several selected conditions describe related precipitation data. Their co-occurrence does not provide independent evidence.');
    if(thresholds.filter(d=>/^(n_single_f|n_multi_fa|housing_total_records|grid_.*_median)$/.test(d.field)).length>1)warnings.push('Several selected housing-stock conditions describe related source records. Combined counts include single-family and multi-family records, so these conditions are not independent evidence.');
    if(thresholds.some(d=>d.id==='chei')&&thresholds.length>1)warnings.push('CHEI is a supplied composite and may share inputs with other selected factors. The match count is not an independent-risk count or a new weighted CHEI.');
    if(thresholds.some(d=>d.field==='hotspot_combo')&&thresholds.length>1)warnings.push('The fixed hotspot category already combines precipitation, household growth, and SVI. Combining it with related inputs repeats those concepts without recalculating the fixed definition.');
    const ruleLabel=rule==='all'?'All '+selected.length+' selected conditions':rule==='any'?'Any selected condition':'At least '+required+' of '+selected.length+' selected conditions';
    return {ok:true,errors:[],numericFactorCount:thresholds.filter(d=>d.kind==='numeric').length,categoryFactorCount:thresholds.filter(d=>d.kind==='category').length,factorCount:selected.length,factorIds,factors:thresholds,thresholds,rule,minCount:required,ruleLabel,percentile,indices,rows,allRows,eligibleIndices:eligibleRows.map(r=>r.index),missingIndices:missingRows.map(r=>r.index),matchedIndices:matchedRows.map(r=>r.index),scopeCount:rows.length,eligibleCount:eligibleRows.length,missingCount:missingRows.length,matchedCount:matchedRows.length,share:eligibleRows.length?matchedRows.length/eligibleRows.length:null,countDistribution,combinationCounts:Array.from(combinationMap.values()).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key)),factorSummaries,warnings,methods:METHODS};
  }

  return Object.freeze({version:'2.0.0',FIELD_META,CATALOG,METHODS,metadata,isFiniteValue,numeric,category,categoryStats,quantile,stats,factor,factors,screen});
});
