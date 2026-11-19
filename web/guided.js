/* Guided Climate-Housing Exposure Explorer.
 * All analytical values originate in the supplied prepared data and Bokeh engine.
 * Native controls provide progressive disclosure; they do not invent projections.
 */
(() => {
'use strict';
const DATA = JSON.parse(document.getElementById('guided-metadata').textContent);
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const numbers = a => Array.from(a || []).filter(finite).map(Number);
const fmt = (v,d=0) => finite(v) ? Number(v).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}) : 'No data';
const range = n => Array.from({length:n},(_,i)=>i);
function quantile(a,q) { a=numbers(a).sort((x,y)=>x-y); if(!a.length)return NaN; const p=(a.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return a[l]+(a[h]-a[l])*(p-l); }
function stats(a) { const v=numbers(a);return {n:v.length,values:v,median:quantile(v,.5),min:v.length?Math.min(...v):NaN,max:v.length?Math.max(...v):NaN}; }
const initial = () => ({step:0,furthest:0,location:null,code:'',climate:null,gmt:'25',indicator:'',period:'',housing:'combined',viewMode:'combine',factors:[],populationPeriod:'2050',householdsPeriod:'change',employmentPeriod:'change',cheiPeriod:'2050',land_usePeriod:'2050',factorHousing:{housing_density:'combined',housing_points:'combined'},categoryValues:{hotspot:['All three high']},factorSearch:'',openFactorGroups:{core:true},rule:'all',minCount:2,mapFactor:'combined',factorA:'pr_25',factorB:'hh_chg',percentile:80,applying:false,applied:false,inspected:null,page:'explorer'});
let state=initial(), doc=null, refreshTimer=null, snapshot=null, currentMembers=[], currentLegendKey=null;
const M = key => doc?.get_model_by_name(DATA.names[key] || key);
const S = key => M(key)?.data;
const nativeModel = name => doc?.get_model_by_name(name);
function silent(key,property,value) { const m=M(key); if(m)m.setv({[property]:value},{silent:true}); }
/*FACTOR_CATALOG*/
const FACTORS = [
 ['pr_15','Precipitation · GMT +1.5°C'],['pr_20','Precipitation · GMT +2.0°C'],['pr_25','Precipitation · GMT +2.5°C'],['pr_30','Precipitation · GMT +3.0°C'],
 ['SVI','Social vulnerability · 2020'],['CHEI_2050','CHEI · 2050'],['pop_chg','Population change · 2020–2050'],['hh_chg','Household change · 2020–2050'],['job_chg','Employment change · 2020–2050'],['parcel_hu_change','Housing-unit change · 2020–2050']
];
const FACTOR_TEXT=Object.fromEntries(FACTORS);
const INDICATORS={
 combined:{name:'Flexible indicator overlap',meta:'hotspot',contexts:['threshold','compare','none'],periods:[['mixed','Each indicator keeps its own reference period']],description:'Find census tracts where selected numeric or category conditions coincide.'},
 pr_tract:{name:'Extreme precipitation · census tracts',meta:'pr_tract',contexts:['threshold'],periods:[['threshold','Selected warming threshold'],['profile','Compare all four warming thresholds']],description:'A useful starting point: see the modeled average three-day precipitation total for extreme events, summarized to census tracts.'},
 pr_points:{name:'Extreme precipitation · model points',meta:'pr_points',contexts:['threshold'],periods:[['threshold','Selected warming threshold'],['profile','Compare all four warming thresholds']],description:'Inspect the underlying climate-model point values. A small selected area may contain no model points; that does not mean there is no precipitation exposure.'},
 pr_kriging:{name:'Extreme precipitation · interpolated surface',meta:'pr_kriging',contexts:['threshold'],periods:[['threshold','Selected warming threshold'],['profile','Compare all four warming thresholds']],description:'View the derived ordinary-kriging display surface. Summary statistics and clickable classes use the corresponding tract precipitation values, not individual raster pixels.'},
 pr_change:{name:'Precipitation change · +2.5°C versus +1.5°C',meta:'pr_change',contexts:['compare'],periods:[['warming_comparison','GMT +2.5°C relative to +1.5°C']],description:'View the supplied percentage-change values for extreme precipitation between two warming conditions. This is not a 2020–2050 comparison.'},
 chei:{name:'Overall climate–housing exposure (CHEI)',meta:'chei_2050',contexts:['composite'],periods:[['2020','2020 · supplied baseline'],['2050','2050 · supplied projection'],['change','Change · 2050 minus 2020'],['comparison','Compare 2020 and 2050']],description:'Explore the supplied composite Climate-Housing Exposure Index. Higher values indicate greater relative combined exposure; the index is not a probability of flood damage.'},
 hotspot:{name:'Compound hotspots · three high conditions',meta:'hotspot',contexts:['composite'],periods:[['hotspot_2050','Supplied 2050 compound-screening definition']],description:'Identify the eight combinations of high precipitation at +2.5°C, high 2020–2050 household growth, and high 2020 social vulnerability. Patterns show which conditions coincide.'},
 overlap:{name:'Custom screening · compare two factors',meta:'hotspot',contexts:['composite'],periods:[['mixed','Source reference periods of the selected factors']],description:'Choose two different indicators and a countywide high-value percentile. This is a separate exploratory screen; it does not modify the fixed compound-hotspot definitions.'},
 population:{name:'Population · baseline, projection, or change',meta:'pop_2050',contexts:['community'],periods:[['2020','2020 · baseline'],['2050','2050 · projection'],['change','Change · 2050 minus 2020'],['comparison','Compare 2020 and 2050']],description:'Explore how the number of people in each census tract is projected to change, or review a baseline or future snapshot.'},
 households:{name:'Households · baseline, projection, or change',meta:'hh_2050',contexts:['community'],periods:[['2020','2020 · baseline'],['2050','2050 · projection'],['change','Change · 2050 minus 2020'],['comparison','Compare 2020 and 2050']],description:'Review baseline and projected household counts. A household measure is not automatically the same as the number of housing units or housing-stock records.'},
 employment:{name:'Employment · baseline, projection, or change',meta:'jobs_2050',contexts:['community'],periods:[['2020','2020 · baseline'],['2050','2050 · projection'],['change','Change · 2050 minus 2020'],['comparison','Compare 2020 and 2050']],description:'Explore baseline jobs, projected jobs, or employment change to support workplace and infrastructure screening.'},
 svi:{name:'Social vulnerability (SVI)',meta:'svi',contexts:['community'],periods:[['2020','2020 · supplied SVI baseline']],description:'Review the supplied overall SVI percentile for each tract. Higher percentiles indicate greater relative social vulnerability. No future SVI projection is supplied.'},
 pop_density:{name:'Population density',meta:'pop_density',contexts:['community'],periods:[['2020','2020 · supplied density baseline']],description:'View the supplied population-density measure. The prepared dataset does not establish the density denominator; results retain the label “source density unit.”'},
 sf_tract:{name:'Single-family housing records · census tracts',meta:'sf_tract',contexts:['community'],periods:[['2020','2020 · housing-stock baseline']],description:'View tract-level counts of the supplied single-family housing records. Record counts are retained as provided, without assuming each record means the same number of dwelling units.'},
 mf_tract:{name:'Multi-family housing records · census tracts',meta:'mf_tract',contexts:['community'],periods:[['2020','2020 · housing-stock baseline']],description:'View tract-level counts of supplied multi-family housing records. Do not treat a multi-family property record as an independently verified dwelling-unit total.'},
 housing_density:{name:'Housing concentration · 1 km grid',meta:'housing_density',contexts:['community'],periods:[['2020','2020 · housing-stock baseline']],description:'Use a 1 km grid calculated from all source housing points. You can select single-family, multi-family, or both housing-stock types in the next step.'},
 housing_points:{name:'Housing locations · point display',meta:'housing_points',contexts:['community'],periods:[['2020','2020 · housing-stock baseline']],description:'Inspect housing locations. The static dashboard uses a 30,000-record single-family preview and all supplied multi-family points; the grid provides full-count coverage.'},
 parcel_hu_change:{name:'Housing-unit change · changed parcels',meta:'parcel_hu_change',contexts:['community'],periods:[['change','Projected change · 2020–2050']],description:'Locate parcels with projected changes in housing units. This layer is limited to the changing-parcel dataset, not a complete parcel inventory.'},
 land_use:{name:'Land use · parcels with housing-unit change',meta:'parcel_future_lu',contexts:['community'],periods:[['2020','2020 · current land use'],['2050','2050 · projected land use'],['comparison','Compare current and future land use']],description:'Explore current and projected land-use categories for parcels expected to have housing-unit changes. The view is not a complete countywide land-use inventory.'}
};
function selectedPlace() { return DATA.places[state.location]?.find(p=>p.code===state.code) || null; }
function placeLabel() { return selectedPlace()?.label || 'No place selected'; }
function scopeMembership() { return DATA.scope[state.location]?.[state.code] || {tract:[],parcel:[],grid:[]}; }
function layerId() {
 const period=state.period;
 if(state.indicator==='chei')return period==='2020'?'chei_2020':period==='2050'?'chei_2050':'adapt_gap';
 if(state.indicator==='population')return period==='2020'?'pop_2020':period==='2050'?'pop_2050':'pop_growth';
 if(state.indicator==='households')return period==='2020'?'hh_2020':period==='2050'?'hh_2050':'hh_growth';
 if(state.indicator==='employment')return period==='2020'?'jobs_2020':period==='2050'?'jobs_2050':'jobs_growth';
 if(state.indicator==='land_use')return period==='2020'?'parcel_current_lu':'parcel_future_lu';
 return INDICATORS[state.indicator]?.meta || 'chei_2050';
}
function isCombined(){return state.viewMode==='combine'&&state.indicator==='combined';}
function selectedClimateLabel(){return state.climate==='threshold'?`Rainfall at +${(Number(state.gmt)/10).toFixed(1)}°C global warming`:state.climate==='compare'?'Rainfall change · +2.5°C relative to +1.5°C':state.climate==='none'?'No precipitation input':'Not selected yet';}
function usesPrecipitation(){return isCombined()?state.factors.some(id=>['precipitation','pr_points','pr_kriging','pr_change'].includes(id)):['pr_tract','pr_points','pr_kriging','pr_change'].includes(state.indicator);}
function climateLabel() {
 if(isCombined()){
  const labels=[];
  if(state.factors.includes('precipitation'))labels.push(selectedClimateLabel());
  if(state.factors.some(id=>['pr_points','pr_kriging'].includes(id)))labels.push(`Rainfall at +${(Number(state.gmt)/10).toFixed(1)}°C global warming`);
  if(state.factors.includes('pr_change'))labels.push('Rainfall change · +2.5°C relative to +1.5°C');
  if(state.factors.includes('hotspot'))labels.push('Fixed +2.5°C hotspot definition');
  if(state.factors.includes('chei'))labels.push('Supplied CHEI climate assumptions');
  return [...new Set(labels)].join(' · ')||'No precipitation input';
 }
 if(usesPrecipitation())return selectedClimateLabel();
 if(state.indicator==='hotspot')return 'Fixed +2.5°C precipitation · supplied hotspot definition';
 if(state.indicator==='chei')return 'Supplied CHEI climate assumptions · not recalculated';
 return 'Precipitation not used in this view';
}
function periodLabel() { return isCombined()?'Separate reference periods for each indicator':INDICATORS[state.indicator]?.periods.find(p=>p[0]===state.period)?.[1] || 'Not selected yet'; }
function indicatorAllowed(key){if(['combined','overlap'].includes(key))return false;if(['pr_tract','pr_points','pr_kriging'].includes(key))return state.climate==='threshold';if(key==='pr_change')return state.climate==='compare';return true;}
function factorSpecs(){return state.factors.map(id=>{
 const spec={id},cfg=FACTOR_BY_ID[id];
 if(cfg?.periods)spec.period=state[id+'Period'];
 if(cfg?.housing)spec.housing=state.factorHousing[id];
 if(cfg?.category&&Object.prototype.hasOwnProperty.call(state.categoryValues,id))spec.allowedValues=state.categoryValues[id];
 return spec;
});}
function screenOptions(indices){return {factors:factorSpecs(),metadata:DATA.expanded?.metadata?.fields||{},climate:state.climate,gmt:state.gmt,percentile:state.percentile,rule:state.rule,minCount:state.minCount,indices:indices??scopeMembership().tract};}
function combinationScreen(){return window.CHEIOverlap.screen(S('tract_source'),screenOptions());}
function factorDescriptors(){return window.CHEIOverlap.factors(screenOptions());}
function ruleText(){return state.rule==='all'?`All ${state.factors.length} conditions met`:state.rule==='any'?'Any selected condition met':`At least ${state.minCount} of ${state.factors.length} conditions met`;}
function invalidateAfter(step){state.furthest=Math.min(state.furthest,step);state.applied=false;snapshot=null;$('report-button').disabled=true;}

function detail(meta,key) { let v=meta?.[key];if(v&&typeof v==='object')v=v[state.gmt]??'';return String(v??'').replaceAll('{gmt}',`+${(Number(state.gmt)/10).toFixed(1)}°C`); }
function validStep(n) {
 if(n===0)return Boolean(selectedPlace());
 if(n===1)return ['threshold','compare','none'].includes(state.climate)&& (state.climate!=='threshold'||['15','20','25','30'].includes(state.gmt));
 if(n===2)return state.viewMode==='combine'?state.factors.length>=2&&!factorValidationError(true):Boolean(INDICATORS[state.indicator])&&indicatorAllowed(state.indicator);
 if(n===3)return isCombined()?Boolean(combinationScreen().ok):Boolean(INDICATORS[state.indicator]?.periods.some(p=>p[0]===state.period));
 return true;
}
function refreshNavigation() {
 document.querySelectorAll('.steps button').forEach((b,i)=>{b.disabled=i>state.furthest;b.classList.toggle('current',i===state.step);b.classList.toggle('done',i<state.step);if(i===state.step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
 $('back-button').disabled=state.step===0;
 $('next-button').disabled=!validStep(state.step);
 $('next-button').textContent=['Next: Precipitation →','Next: Indicators →','Next: Periods & rules →','Show my results →'][state.step]||'Show results';
 $('step-count').textContent=`Step ${state.step+1} of 5`;
 const selectedNames=isCombined()?factorDescriptors().map(f=>f.short).join(' + '):INDICATORS[state.indicator]?.name;
 const rows=[['Location',selectedPlace()?.label],['Precipitation setting',state.climate?selectedClimateLabel():null],['Selected indicators',selectedNames],['Periods / rule',isCombined()?(state.step>=3?ruleText()+' · '+conditionSummary():'Set periods and a rule in Step 4'):state.period?periodLabel():null]];
 $('path-summary').innerHTML=rows.map(([k,v])=>`<div class="path-item ${v?'':'pending'}"><span>${esc(k)}</span><b>${esc(v||'Choose in the next steps')}</b></div>`).join('');
 $('review-selection').innerHTML='<dl>'+rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v||'Not selected')}</dd>`).join('')+'</dl>';
}

function gotoStep(n,scroll=true) {
 state.step=n;state.furthest=Math.max(state.furthest,n);state.page='explorer';showPage('explorer',false);
 document.querySelectorAll('.step-panel').forEach((p,i)=>p.hidden=i!==n);
 $('setup-grid').hidden=n===4;$('results').hidden=n!==4;$('wizard-error').hidden=true;
 // Only one editable step is open. Results are a separate, final screen.
 $('intro').hidden=n===4;
 if(n===2)updateIndicatorOptions();if(n===3)updatePeriodOptions();refreshNavigation();
 if(n===4)applyResults();
 if(scroll){$('workflow').scrollIntoView({block:'start',behavior:'smooth'});setTimeout(()=>{const h=n===4?$('results-title'):document.querySelector(`[data-panel="${n}"] h2`);h?.focus({preventScroll:true});},70);}
}
function showPage(page,scroll=true) {
 state.page=page;document.querySelectorAll('.page-section').forEach(el=>el.hidden=el.id!==`page-${page}`);
 document.querySelectorAll('.top-nav button').forEach(b=>{b.classList.toggle('nav-active',b.dataset.page===page);b.setAttribute('aria-current',b.dataset.page===page?'page':'false');});
 if(scroll)window.scrollTo({top:0,behavior:'smooth'});if(page==='explorer'&&state.step===4)setTimeout(resizeMap,40);
}
function setLocationType(type) {
 if(state.location!==type){state.location=type;state.code=type==='county'?'all':'';invalidateAfter(0);}
 document.querySelectorAll('[data-location]').forEach(b=>{b.classList.toggle('selected',b.dataset.location===type);b.setAttribute('aria-pressed',b.dataset.location===type?'true':'false');});
 $('place-field').hidden=type==='county';$('place-input').hidden=type==='precinct';$('precinct-input').hidden=type!=='precinct';
 if(type==='zip'||type==='tract'){
  $('place-label').textContent=type==='zip'?'Five-digit ZIP code':'Eleven-digit census tract GEOID';
  $('place-input').value=state.code;$('place-input').placeholder=type==='zip'?'e.g., 77007':'e.g., 48201342001';
  $('place-input').maxLength=type==='zip'?5:11;
  $('place-options').innerHTML=DATA.places[type].map(p=>`<option value="${esc(p.code)}">${esc(p.subtitle)}</option>`).join('');
  $('place-help').textContent=type==='zip'?'Use a five-digit code from the supplied Harris County ZIP boundaries.':'Type or select an exact GEOID from the supplied Harris County tract inventory.';
 }else if(type==='precinct'){$('place-label').textContent='Commissioner precinct';$('precinct-input').value=state.code;$('place-help').textContent='Use the precinct number. No officeholder names are required.';}
 updatePlaceStatus();
}
function updatePlaceStatus() {
 const p=selectedPlace();$('place-status').classList.toggle('error',!p&&Boolean(state.code));
 $('place-status').textContent=p?`${p.label}${p.subtitle?' · '+p.subtitle:''} is ready. Continue to choose a precipitation setting.`:state.code?'This code is not in the supplied boundary inventory. Check its digits or select a suggested code.':state.location==='precinct'?'Select a precinct to continue.':state.location?'Enter a valid code to continue.':'';
 refreshNavigation();
}
function setClimate(mode) {
 const previous=state.climate;state.climate=mode;
 if(mode==='none')state.factors=state.factors.filter(f=>f!=='precipitation');
 else if(previous===null||previous==='none'){if(!state.factors.includes('precipitation'))state.factors.unshift('precipitation');}
 if(state.viewMode==='single'&&state.indicator&&!indicatorAllowed(state.indicator)){state.indicator='';state.period='';}
 if(state.viewMode==='combine'){state.indicator='combined';state.period='mixed';}
 normalizeFactorSelections();
 if(previous!==mode)invalidateAfter(1);
 document.querySelectorAll('[data-climate]').forEach(b=>{b.classList.toggle('selected',b.dataset.climate===mode);b.setAttribute('aria-pressed',String(b.dataset.climate===mode));});
 $('warming-field').hidden=mode!=='threshold';$('warming-input').value=state.gmt;
 const text={threshold:'The map uses modeled extreme three-day rainfall totals, summarized over a 20-year climate window at the selected global warming level. Warming is relative to 1850–1899. No calendar year is assigned to this condition.',compare:'The supplied layer measures the percentage change in extreme rainfall at +2.5°C relative to +1.5°C. This is a comparison of climate conditions, not a 2020–2050 projection. You can still combine it with community indicators.',none:'No main precipitation input will be added. You can combine the available housing, community, and exposure indicators. Fixed precipitation change, CHEI, and hotspots keep their own climate definitions when selected in Step 3.'};
 $('climate-explanation').textContent=text[mode];refreshNavigation();
}
function setViewMode(mode){state.viewMode=mode;state.indicator=mode==='combine'?'combined':'';state.period=mode==='combine'?'mixed':'';invalidateAfter(2);updateIndicatorOptions();}
function updateIndicatorOptions() {
 const combined=state.viewMode==='combine';
 document.querySelectorAll('[data-view-mode]').forEach(b=>{b.classList.toggle('selected',b.dataset.viewMode===state.viewMode);b.setAttribute('aria-pressed',String(b.dataset.viewMode===state.viewMode));});
 $('combined-indicator-options').hidden=!combined;$('single-indicator-options').hidden=combined;
 if(combined){state.indicator='combined';state.period='mixed';renderFactorChecklist();refreshNavigation();return;}
 const options=Object.entries(INDICATORS).filter(([key])=>indicatorAllowed(key));
 if(!options.some(([k])=>k===state.indicator)){state.indicator='';state.period='';}
 const groups=[['Precipitation',['pr_tract','pr_points','pr_kriging','pr_change']],['Supplied indices and fixed hotspots',['chei','hotspot']],['Community and housing',options.map(([k])=>k).filter(k=>!['pr_tract','pr_points','pr_kriging','pr_change','chei','hotspot'].includes(k))]];
 $('indicator-input').innerHTML='<option value="">Select an indicator…</option>'+groups.map(([label,keys])=>{const valid=keys.filter(indicatorAllowed);return valid.length?`<optgroup label="${esc(label)}">${valid.map(k=>`<option value="${k}">${esc(INDICATORS[k].name)}</option>`).join('')}</optgroup>`:'';}).join('');$('indicator-input').value=state.indicator;updateIndicatorExplanation();
}
function updateIndicatorExplanation() {
 const i=INDICATORS[state.indicator];$('overlap-options').hidden=true;
 const climateNote=state.indicator==='hotspot'?'This fixed layer always uses +2.5°C precipitation, household growth, and 2020 SVI, regardless of Step 2. Choose Combine indicators to use your own precipitation condition and factors.':state.indicator==='chei'?'The supplied CHEI is not recalculated for the precipitation setting in Step 2.':i&&!usesPrecipitation()?'The precipitation setting is not applied to this individual layer.':'';
 $('indicator-explanation').innerHTML=i?`<h3>${esc(i.name)}</h3><p>${esc(i.description)}</p>${climateNote?`<p class="applied-climate-note">${esc(climateNote)}</p>`:''}<p class="quiet-note">${esc(detail(DATA.layers[i.meta],'geography'))} · ${esc(detail(DATA.layers[i.meta],'measurement'))}</p>`:'<p>Choose a layer above to read its purpose, units, and limitations. All community and housing layers remain available whatever precipitation setting you chose.</p>';
 refreshNavigation();
}
function updatePeriodOptions() {
 $('combined-period-options').hidden=!isCombined();$('single-period-options').hidden=isCombined();
 $('period-heading').textContent=isCombined()?'Choose periods and the overlap rule':'Choose the time frame and view';
 $('period-lead').textContent=isCombined()?'Each indicator keeps its own reference period. Then decide which combinations you want the map to identify.':'Only the reference periods available for this indicator are offered.';
 if(isCombined()){state.period='mixed';renderCombinedPeriodOptions();return;}
 const i=INDICATORS[state.indicator];if(!i)return;
 if(!i.periods.some(p=>p[0]===state.period))state.period=i.periods.length===1?i.periods[0][0]:'';
 $('period-input').innerHTML=(i.periods.length>1?'<option value="">Choose a reference period…</option>':'')+i.periods.map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('');$('period-input').value=state.period;
 $('period-label').textContent=usesPrecipitation()?'Climate-condition view (not a projection year)':'Reference period / comparison';
 $('display-options').hidden=!['housing_density','housing_points'].includes(state.indicator);$('display-input').value=state.housing;updatePeriodExplanation();
}
function exactCutoff(f){return `<span title="Exact cutoff: ${esc(f.cutoff)}">${fmt(f.cutoff,Math.max(f.decimals,3))} ${esc(f.unit)}</span>`;}
function updatePeriodExplanation() {
 let text='Choose a period above. Only valid source-data periods are shown.';
 if(isCombined())text=`${ruleText()}. Numeric indicators use their own countywide ${state.percentile}th-percentile cutoffs; category indicators use your named choices. Each input keeps its source period and geographic summary. Tracts missing any selected value are excluded from every rule and its percentage denominator. Related indicators may share source data; the count is not a count of independent risks.`;
 else if(['pr_tract','pr_points','pr_kriging'].includes(state.indicator))text=state.period==='profile'?'The map uses your selected warming level. The chart compares all four warming levels for the same location. These are climate conditions, not calendar projection years.':'The map and summary use the precipitation condition selected in Step 2. The 20-year climate window is not labeled 2020 or 2050.';
 else if(state.indicator==='pr_change')text='The map shows the supplied percentage change at +2.5°C relative to +1.5°C. The chart provides the two underlying tract precipitation values or medians. This is not a 2020–2050 comparison.';
 else if(state.indicator==='hotspot')text='The fixed screen uses +2.5°C precipitation, household growth from 2020 to 2050, and 2020 SVI. It keeps that definition whatever you selected in Step 2.';
 else if(state.period==='comparison')text=state.indicator==='land_use'?'The map displays 2050 land-use categories. The chart compares 2020 and 2050 category counts for the same intersecting, changing parcels.':'The map shows supplied 2050-minus-2020 change. The chart compares baseline and projection values (or tract medians) in the same selected place.';
 else if(state.period==='change')text='The map shows projected change from 2020 to 2050. Positive values indicate an increase; negative values indicate a decline. This does not select a warming level.';
 else if(state.period==='2020')text='Use the supplied 2020 baseline. No future value is inferred for a baseline-only indicator.';
 else if(state.period==='2050')text='Use the supplied 2050 projection. The projection year is independent of the global warming conditions used for precipitation.';
 $('period-explanation').textContent=text;refreshNavigation();
}


// ---- Selected geography and spatial membership ---------------------------
function boundaryData() {
 const p=selectedPlace();if(!p)return null;
 const key={county:'county_source',zip:'zipcode_source',precinct:'precinct_source',tract:'tract_source'}[state.location],d=S(key),i=p.index;
 if(state.location==='county')return {xs:Array.from(d.xs),ys:Array.from(d.ys),bounds:p.bounds};
 return {xs:[d.xs[i]],ys:[d.ys[i]],bounds:p.bounds};
}
function collectRings(xs,ys) { const out=[];function walk(x,y){if(!x||!y)return;if(x.length&&typeof x[0]==='number'){out.push([x,y]);return;}for(let i=0;i<x.length;i++)walk(x[i],y[i]);}walk(xs,ys);return out; }
let ringCache={key:'',rings:[],bounds:[]};
function withinPlace(x,y) {
 if(state.location==='county')return true;
 const key=state.location+':'+state.code;
 if(ringCache.key!==key){const b=boundaryData();ringCache={key,rings:collectRings(b.xs,b.ys),bounds:b.bounds};}
 const [x0,y0,x1,y1]=ringCache.bounds;if(x<x0||x>x1||y<y0||y>y1)return false;
 let inside=false;
 for(const [rx,ry] of ringCache.rings){
  let hit=false;
  for(let i=0,j=rx.length-1;i<rx.length;j=i++){
   const xi=rx[i],yi=ry[i],xj=rx[j],yj=ry[j];
   const cross=(x-xi)*(yj-yi)-(y-yi)*(xj-xi);
   if(Math.abs(cross)<1e-5&&x>=Math.min(xi,xj)&&x<=Math.max(xi,xj)&&y>=Math.min(yi,yj)&&y<=Math.max(yi,yj))return true;
   if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))hit=!hit;
  }if(hit)inside=!inside;
 }return inside;
}
let pointCache={data:null,key:'',members:[]};
function scopeForContext(ctx) {
 if(!ctx||!selectedPlace())return [];
 const source=ctx.source,d=source.data;
 if(source===M('tract_source'))return scopeMembership().tract;
 if(source===M('parcel_source'))return scopeMembership().parcel;
 if(source===M('grid_source'))return scopeMembership().grid;
 const key=state.location+':'+state.code;
 if(pointCache.data===d&&pointCache.key===key)return pointCache.members;
 const members=[];for(let i=0;i<(d.x||[]).length;i++)if(withinPlace(Number(d.x[i]),Number(d.y[i])))members.push(i);
 pointCache={data:d,key,members};return members;
}
window.__guidedScopeForContext=scopeForContext;
function fitBounds(b) {
 if(!b||!b.every(Number.isFinite))return;const p=M('map_plot'),w=Math.max($('map-host').clientWidth,300),h=$('map-host').clientHeight||550;
 let dx=Math.max(b[2]-b[0],900)*1.18,dy=Math.max(b[3]-b[1],900)*1.18;
 const ratio=w/h;if(dx/dy<ratio)dx=dy*ratio;else dy=dx/ratio;
 const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;p.x_range.setv({start:cx-dx/2,end:cx+dx/2});p.y_range.setv({start:cy-dy/2,end:cy+dy/2});
}
function fitPlace(){fitBounds(selectedPlace()?.bounds);}
function resizeMap() { if(!doc||state.step!==4||state.page!=='explorer')return;const w=Math.floor($('map-host').clientWidth),h=window.innerWidth<=650?420:550;if(w<100)return;const p=M('map_plot');p.setv({width:w,height:h,sizing_mode:'fixed'}); }
function updateScopeMask(ctx) {
 const mask=nativeModel('guided_scope_mask'),b=nativeModel('guided_scope_boundary'),bd=boundaryData();if(!bd)return;
 b.data={xs:bd.xs,ys:bd.ys};b.change.emit();
 const allowed=new Set(currentMembers),d=ctx.source.data;
 if(ctx.geometry==='polygon'&&state.location!=='county'){
  const ids=range(ctx.classes.length).filter(i=>!allowed.has(i));mask.data={xs:ids.map(i=>d.xs[i]),ys:ids.map(i=>d.ys[i])};
 }else mask.data={xs:[],ys:[]};mask.change.emit();
 if(ctx.geometry==='point'){
  d.display_alpha=Array.from(ctx.classes,(_,i)=>allowed.has(i)?ctx.baseAlpha:.045);ctx.source.change.emit();
 }
}

// ---- Apply the guide to the unchanged layer engine -----------------------
function applyResults() {
 if(![0,1,2,3].every(validStep)){gotoStep([0,1,2,3].find(i=>!validStep(i)));return;}
 $('report-button').disabled=true;
 state.applying=true;state.applied=true;state.inspected=null;currentLegendKey=null;snapshot=null;pointCache.data=null;
 $('tract-inspection').hidden=true;nativeModel('guided_inspected_tract').data={xs:[],ys:[]};
 M('tract_source').selected.indices=[];window.CHEI.clearLegendFilter();
 nativeModel('guided_screen_matches').data={xs:[],ys:[]};
 if(isCombined()){state.mapFactor='combined';applyCombinedResults();return;}
 ['combined-input-summary','factor-map-tabs','combined-table-section'].forEach(id=>$(id).hidden=true);
 silent('layer_select','value',layerId());silent('gmt_select','value',state.gmt);silent('housing_select','value',state.housing);
 silent('overlap_toggle','active',state.indicator==='overlap');silent('overlap_a','value',state.factorA);silent('overlap_b','value',state.factorB);silent('threshold_slider','value',state.percentile);
 window.CHEI.updateLayer();resizeMap();fitPlace();
 state.applying=false;refreshResults();setTimeout(()=>{resizeMap();fitPlace();},80);
}
function featureLabel(ctx) {
 if(ctx.source===M('tract_source'))return 'census tracts';
 if(ctx.source===M('parcel_source'))return 'changed parcels';
 if(ctx.source===M('grid_source'))return '1 km grid cells';
 if(ctx.source===M('climate_display_source'))return 'climate-model points';
 return 'displayed housing points';
}
function chosenField(meta) { if(state.indicator==='overlap')return null;if(['pr_tract','pr_kriging'].includes(layerId()))return 'pr_'+state.gmt;if(layerId()==='housing_density')return state.housing==='single'?'sf_count':state.housing==='multi'?'mf_count':'total_count';return meta.field; }
function comparisonFields() {return {chei:['CHEI_2020','CHEI_2050','adapt_gap'],population:['hp_2020','hp_2050','pop_chg'],households:['hh_2020','hh_2050','hh_chg'],employment:['j_2020','j_2050','job_chg']}[state.indicator]||null;}
function makeSnapshot(ctx) {
 const meta=DATA.layers[layerId()],field=chosenField(meta),data=ctx.source.data,indices=scopeForContext(ctx),sourceFeatureLabel=featureLabel(ctx);
 const categorical=state.indicator==='overlap'||['cat_hotspot','cat_land','points'].includes(meta.kind);
 const values=categorical?indices.map(i=>String(ctx.classes[i])):indices.map(i=>data[field]?.[i]);
 const counts={};indices.forEach(i=>{const k=String(ctx.classes[i]);counts[k]=(counts[k]||0)+1;});
 const st=stats(values),all=stats(categorical?[]:data[field]),pair=comparisonFields(),td=S('tract_source'),ti=scopeMembership().tract;
 const comparison=pair?pair.map(f=>stats(ti.map(i=>td[f][i]))):null;
 return {meta,field,indices,data,values,stats:st,county:all,counts,context:ctx,categorical,unit:meta.unit||'',dec:meta.decimals??0,features:sourceFeatureLabel,comparison,levelUnit:state.indicator==='chei'?'index':(meta.unit||'')};
}
function locationCaveat(s) {
 const pieces=[];
 if(state.location==='tract'&&s.context.source===M('tract_source'))pieces.push('Exact source value for the selected census tract.');
 else if(state.location==='county')pieces.push('Countywide screening. Numeric summaries are medians and ranges across source features, not county totals.');
 else pieces.push(`Summary of whole ${s.features} intersecting ${placeLabel()}, including boundary touches. Features are not clipped or area-weighted; this is not an official ZIP- or precinct-level aggregate.`);
 if(layerId()==='pr_kriging')pieces.push('The surface is a derived display; values, charts, and legend selections use the corresponding tract precipitation data.');
 if(layerId()==='housing_points')pieces.push('Counts describe displayed points only. The static single-family preview is sampled; use the 1 km grid for full-count housing coverage.');
 if(state.climate==='threshold'||state.climate==='compare')pieces.push('Warming conditions are not calendar years.');
 if(state.indicator==='hotspot')pieces.push('Fixed screen: +2.5°C precipitation; 2020–2050 household growth; 2020 SVI.');
 return pieces.join(' ');
}
function refreshResults() {
 if(state.step!==4||!state.applied||state.applying||!window.__cheiLegendContext)return;
 if(isCombined()){refreshCombinedResults();return;}
 const ctx=window.__cheiLegendContext;
 if(state.indicator==='overlap'?ctx.layerId!=='overlap':ctx.layerId!==layerId())return;
 currentMembers=scopeForContext(ctx);snapshot=makeSnapshot(ctx);const s=snapshot;
 updateScopeMask(ctx);
 if(currentLegendKey!==null){currentLegendKey=null;window.CHEI.clearLegendFilter(true);}
 const title=INDICATORS[state.indicator].name.split(' · ')[0];
 $('results-title').textContent=placeLabel();$('results-subtitle').textContent=`${title} · ${periodLabel()}`;
 $('result-context').innerHTML=[['LOCATION',placeLabel()],['CLIMATE CONDITIONS',climateLabel()],['TIME / COMPARISON',periodLabel()]].map(([k,v])=>`<div><span>${k}</span><b>${esc(v)}</b></div>`).join('');
 $('result-caveat').textContent=locationCaveat(s);
 $('map-title').textContent=state.indicator==='overlap'?'Custom two-factor overlap':s.meta.label.split('•').pop().trim();
 $('map-subtitle').textContent=`${placeLabel()} · ${state.period==='comparison'&&comparisonFields()?'map shows the change; chart compares both years':state.period==='comparison'&&state.indicator==='land_use'?'map shows 2050; chart compares both land-use distributions':'original analytical geography retained'}`;
 $('map-status').textContent=layerId()==='housing_points'?stripHTML(M('point_status').text):'Pan or zoom to explore. Click a census tract to inspect it; the selected location stays unchanged.';
 $('legend-scope').textContent=`Counts below refer to ${placeLabel()}. Numeric class cutoffs remain countywide. Click one class at a time.`+(layerId()==='pr_kriging'?' These are tract-locator classes, not raster-pixel bins; the surface has a continuous color scale.':'');
 renderMetrics(s);renderLegend(s);renderCharts(s);renderFindings(s);renderReference(s);$('report-button').disabled=false;
}
function stripHTML(text){const el=document.createElement('div');el.innerHTML=text;return el.textContent.trim();}
function metric(value,label,note=''){return `<div class="metric"><b>${esc(value)}</b><span>${esc(label)}</span><small>${esc(note)}</small></div>`;}
function renderMetrics(s) {
 const exact=state.location==='tract'&&s.context.source===M('tract_source');let html='';
 if(!s.indices.length){html=metric('No matches','Features in selected place','Absence of data is not zero exposure');$('summary-metrics').innerHTML=html;return;}
 if(state.period==='comparison'&&s.comparison){const[a,b,c]=s.comparison;html=metric(fmt(a.median,s.dec),exact?'2020 value':'2020 tract median',s.levelUnit)+metric(fmt(b.median,s.dec),exact?'2050 value':'2050 tract median',s.levelUnit)+metric(fmt(c.median,s.dec),exact?'Supplied change':'Median of tract changes',s.unit+' · not change of medians')+metric(fmt(s.indices.length),'Source tracts',exact?'Exact tract profile':'Equal weight per intersecting tract');}
 else if(state.indicator==='hotspot'){
  const td=S('tract_source'),idx=s.indices;const nh=idx.filter(i=>td.hazard_high[i]===1).length,ng=idx.filter(i=>td.growth_high[i]===1).length,nv=idx.filter(i=>td.svi_high[i]===1).length;
  html=metric(fmt(s.counts['All three high']||0),'All-three-high tracts',`of ${fmt(idx.length)} selected tracts`)+metric(fmt(nh),'High precipitation','+2.5°C · ≥203.603 mm')+metric(fmt(ng),'High household growth','2020–2050 · ≥746 households')+metric(fmt(nv),'High SVI','2020 · ≥0.88386');
 }else if(s.categorical){const dominant=Object.entries(s.counts).sort((a,b)=>b[1]-a[1])[0];const label=s.context.labels?.[dominant?.[0]]||dominant?.[0]||'No data';html=metric(fmt(s.indices.length),s.features,'In the selected geographic screen')+metric(label,'Most common class','Not necessarily the highest class')+metric(fmt(dominant?.[1]||0),'Features in that class','Category count')+metric(fmt(100*(dominant?.[1]||0)/s.indices.length,1)+'%','Share in that class','Of selected features');}
 else{html=metric(fmt(s.stats.median,s.dec),exact?'Selected tract value':'Selected-place median',s.unit)+metric(`${fmt(s.stats.min,s.dec)} – ${fmt(s.stats.max,s.dec)}`,'Selected-place range',s.unit)+metric(fmt(s.county.median,s.dec),'Countywide feature median','Context, not an official aggregate')+metric(fmt(s.stats.n),s.features,'With valid numeric values');}
 $('summary-metrics').innerHTML=html;
}
function renderLegend(s) {
 const temp=document.createElement('div');temp.innerHTML=M('legend_div').text;
 temp.querySelectorAll('.panel-eyebrow,h4,.legend-unit').forEach(el=>el.remove());
 if(s.meta.kind==='div'&&state.indicator!=='overlap'){
  const lim=Math.max(quantile(numbers(s.data[s.field]).map(Math.abs),.95),1e-9)/2,d=Math.max(s.dec,3);
  const labs={'0':`Large decrease · ≤ ${fmt(-lim,d)}`,'1':`Decrease · > ${fmt(-lim,d)} to < 0`,'2':'No change · = 0','3':`Increase · > 0 to < ${fmt(lim,d)}`,'4':`Large increase · ≥ ${fmt(lim,d)}`};
  Object.assign(s.context.labels,labs);
  temp.querySelectorAll('button[data-legend-key]').forEach(b=>{const label=b.querySelector('b');if(label)label.textContent=labs[b.dataset.legendKey]||label.textContent;});
 }
 const buttons=temp.querySelectorAll('button[data-legend-key]');
 buttons.forEach(b=>{const key=b.dataset.legendKey;b.removeAttribute('onclick');b.setAttribute('aria-pressed',String(currentLegendKey===key));b.classList.toggle('active',currentLegendKey===key);b.disabled=!s.counts[key];let count=b.querySelector('em');if(!count){count=document.createElement('em');b.append(count);}count.textContent=fmt(s.counts[key]||0);b.title=`${s.context.labels?.[key]||b.querySelector('b')?.textContent}: ${s.counts[key]||0} ${s.features} in ${placeLabel()}`;});
 const sub=temp.querySelector('.legend-subtitle');if(sub)sub.textContent='CONDITION COMBINATION · SELECTED-AREA COUNT';
 $('legend-content').innerHTML=temp.innerHTML;
 $('legend-selection').innerHTML=currentLegendKey===null?'<p class="field-help">Highlighting a class does not change the area-wide summary or chart.</p>':M('legend_filter_status').text;
}
function selectLegend(key) {
 if(!snapshot)return;window.CHEI.selectLegend(key);currentLegendKey=window.__cheiActiveLegendKey??null;renderLegend(snapshot);
 if(currentLegendKey===null)updateScopeMask(snapshot.context);if(isCombined())updateMatchOutline();
}
function clearLegend(){window.CHEI.clearLegendFilter();currentLegendKey=null;if(snapshot){updateScopeMask(snapshot.context);renderLegend(snapshot);if(isCombined())updateMatchOutline();}}
function barChart(rows,unit='',color='#218D96') {
 const vals=rows.map(r=>r.value).filter(Number.isFinite),min=Math.min(0,...vals),max=Math.max(0,...vals),span=Math.max(max-min,1e-12),zero=100*(0-min)/span;
 return '<div class="bar-list">'+rows.map(r=>{
  const v=finite(r.value)?Number(r.value):0;
  const width=100*Math.abs(v)/span,left=100*(Math.min(v,0)-min)/span;
  return `<div class="bar-line"><span>${esc(r.label)}</span><div class="bar-track signed"><div class="zero-line" style="left:${zero}%"></div><div class="bar-fill" style="position:absolute;left:${left}%;width:${finite(r.value)?width:0}%;background:${r.color||color}"></div></div><em>${fmt(r.value,r.dec??0)}${unit==='%'?'%':''}</em></div>`;
 }).join('')+'</div>';
}
function histogram(s) {
 const a=s.stats.values;if(!a.length)return '<div class="empty-state">No valid numeric values are available for this selection.</div>';
 if(a.length===1||s.stats.min===s.stats.max)return barChart([{label:'Selected value',value:s.stats.median,dec:s.dec},{label:'County median',value:s.county.median,dec:s.dec,color:'#8FA9B8'}],s.unit);
 const n=10,min=s.stats.min,max=s.stats.max,width=(max-min)/n,counts=Array(n).fill(0);a.forEach(v=>counts[Math.min(n-1,Math.floor((v-min)/width))]++);
 const W=600,H=250,L=48,R=15,T=16,B=48,pw=W-L-R,ph=H-T-B,top=Math.max(...counts,1);
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribution of ${esc(s.meta.short)} across ${a.length} selected ${esc(s.features)}"><rect width="${W}" height="${H}" fill="white"/>`;
 for(let j=0;j<=4;j++){const y=T+ph*(1-j/4);svg+=`<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="#E3EBEF"/><text x="${L-9}" y="${y+4}" text-anchor="end" font-size="10" fill="#607987">${fmt(top*j/4)}</text>`;}
 counts.forEach((v,i)=>{const h=v/top*ph;svg+=`<rect x="${L+i*pw/n+2}" y="${T+ph-h}" width="${pw/n-4}" height="${h}" fill="#398F9A"><title>${fmt(min+i*width,s.dec)} to ${fmt(min+(i+1)*width,s.dec)}: ${v} features</title></rect>`;});
 for(let j=0;j<=4;j++){const x=L+pw*j/4;svg+=`<text x="${x}" y="${H-27}" text-anchor="middle" font-size="10" fill="#607987">${fmt(min+(max-min)*j/4,s.dec)}</text>`;}
 svg+=`<text x="${L+pw/2}" y="${H-5}" text-anchor="middle" font-size="11" fill="#406171">${esc(s.unit)}</text><text transform="translate(13 ${T+ph/2}) rotate(-90)" text-anchor="middle" font-size="10" fill="#406171">Features</text></svg>`;return svg;
}
function climateRows(codes) {
 const td=S('tract_source');
 if(layerId()==='pr_points'){
  const d=S('climate_source');return codes.map(code=>{const v=[];for(let i=0;i<d.gmt.length;i++)if(Math.abs(Number(d.gmt[i])-Number(code)/10)<1e-8&&withinPlace(Number(d.x[i]),Number(d.y[i])))v.push(d.precip[i]);return {label:`GMT +${(Number(code)/10).toFixed(1)}°C`,value:stats(v).median,dec:1,color:code===state.gmt?'#117E83':'#77AEBB'};});
 }
 return codes.map(code=>({label:`GMT +${(Number(code)/10).toFixed(1)}°C`,value:stats(scopeMembership().tract.map(i=>td['pr_'+code][i])).median,dec:1,color:code===state.gmt?'#117E83':'#77AEBB'}));
}
function comparisonChart(s) {
 const[a,b]=s.comparison;return barChart([{label:'2020 baseline',value:a.median,dec:s.dec,color:'#408EAB'},{label:'2050 projection',value:b.median,dec:s.dec,color:'#D99B30'}],s.levelUnit);
}
function landUseChart(s) {
 const d=S('parcel_source'),ids=s.indices,c0={},c1={};ids.forEach(i=>{const a=String(d.current_label[i]),b=String(d.future_label[i]);c0[a]=(c0[a]||0)+1;c1[b]=(c1[b]||0)+1;});
 const cats=Array.from(new Set([...Object.keys(c0),...Object.keys(c1)])).sort((a,b)=>(c1[b]||0)-(c1[a]||0));const max=Math.max(...Object.values(c0),...Object.values(c1),1);
 return '<div class="comparison-key"><span><i></i>2020</span><span><i class="future"></i>2050</span></div>'+cats.map(c=>`<div class="comparison-row"><span>${esc(c)}</span><div class="comparison-bars"><div><small>2020</small><i style="width:${100*(c0[c]||0)/max}%"></i><b>${fmt(c0[c]||0)}</b></div><div class="future"><small>2050</small><i style="width:${100*(c1[c]||0)/max}%"></i><b>${fmt(c1[c]||0)}</b></div></div></div>`).join('');
}
function renderCharts(s) {
 let title,html,note;
 if(!s.indices.length){title='No matching source features';html='<div class="empty-state">No source features of this type intersect the chosen area. This is a coverage result, not a zero value. Change the location or use a different representation.</div>';note='For climate, try the census-tract layer. For housing, the 1 km grid uses the full inventory.';}
 else if(state.period==='comparison'&&s.comparison){title=`2020 and 2050 · ${state.location==='tract'?'exact tract values':'tract medians'}`;html=comparisonChart(s);note=`Bars show the same indicator for the same set of tracts (${s.levelUnit}). The map shows supplied change. The median of individual tract changes may differ from the difference between these two medians.`;}
 else if(state.period==='profile'||state.indicator==='pr_change'){title=`Precipitation by warming threshold · ${state.location==='tract'&&layerId()!=='pr_points'?'tract values':'local feature medians'}`;html=barChart(climateRows(state.indicator==='pr_change'?['15','25']:['15','20','25','30']),'mm');note='Average extreme-event 3-day precipitation sum, in millimeters. Warming thresholds are relative to 1850–1899, not calendar years. Kriging views use tract values for this chart.';}
 else if(state.period==='comparison'&&state.indicator==='land_use'){title='Current and projected land-use categories';html=landUseChart(s);note='Counts refer to the same set of intersecting parcels with projected housing-unit changes. They are not counts of all parcels or all housing units in the selected place.';}
 else if(s.categorical){title=`Category counts · ${placeLabel()}`;html=barChart(Object.keys(s.context.labels||s.counts).map(k=>({label:s.context.labels?.[k]||k,value:s.counts[k]||0})));note=`Each bar counts ${s.features} in the selected geographic screen. It is not an area-weighted or population-weighted statistic.`;}
 else{title=s.stats.n===1?'Selected value in county context':`Distribution · ${fmt(s.stats.n)} selected features`;html=histogram(s);note=`Values for ${s.features} in ${placeLabel()}. ${s.unit==='source density unit'?'The source density denominator is not documented. ':''}Countywide quantile classes are retained on the map; histogram bins describe this local distribution.`;}
 $('chart-title').textContent=title;$('main-chart').innerHTML=html;$('chart-note').textContent=note;
}
function findingTexts(s) {
 if(!s.indices.length)return ['No source features of this type were found in the selected area. Do not interpret missing coverage as low or zero exposure.','Choose a different display or a larger area before drawing a planning conclusion.'];
 if(state.indicator==='hotspot')return [`${fmt(s.counts['All three high']||0)} of ${fmt(s.indices.length)} intersecting tracts meet all three fixed high-condition thresholds.`,`Diagonal lines identify precipitation hazard; vertical lines identify household growth; dots identify social vulnerability. Combinations reveal which conditions coincide.`,`High means the specified countywide 80th-percentile screening cutoff, not a natural boundary between safe and unsafe conditions.`];
 if(state.indicator==='overlap')return [`${fmt(s.counts['3']||0)} of ${fmt(s.indices.length)} tracts meet both selected high-value conditions.`,`The two factors are ${FACTOR_TEXT[state.factorA]} and ${FACTOR_TEXT[state.factorB]}. Each is compared with its own countywide ${state.percentile}th-percentile cutoff.`,`Changing the factors or percentile changes this exploratory screen, not the fixed three-factor hotspot layer.`];
 if(s.categorical){const top=Object.entries(s.counts).sort((a,b)=>b[1]-a[1])[0];return [`The most common displayed class is “${s.context.labels?.[top[0]]||top[0]},” containing ${fmt(top[1])} of ${fmt(s.indices.length)} selected ${s.features}.`,state.indicator==='housing_points'?'Displayed housing points are a preview or viewport-limited sample; their counts must not be interpreted as a complete housing inventory.':'Land-use colors identify categories, not a high-to-low ranking. These parcels are a changing-housing subset.',`Use the legend to locate a class, then verify local conditions before acting.`];}
 const exact=state.location==='tract'&&s.context.source===M('tract_source');
 const first=exact?`The selected tract’s ${s.meta.short} value is ${fmt(s.stats.median,s.dec)} ${s.unit}.`:`Across ${fmt(s.stats.n)} selected ${s.features}, the median ${s.meta.short} is ${fmt(s.stats.median,s.dec)} ${s.unit}, ranging from ${fmt(s.stats.min,s.dec)} to ${fmt(s.stats.max,s.dec)}.`;
 let second=`The countywide median of the same feature-level indicator is ${fmt(s.county.median,s.dec)} ${s.unit}. This is context, not a new official geographic aggregate.`;
 if(state.period==='comparison'&&s.comparison)second=`The 2020 ${exact?'value':'tract median'} is ${fmt(s.comparison[0].median,s.dec)}; the 2050 ${exact?'value':'tract median'} is ${fmt(s.comparison[1].median,s.dec)}. The supplied tract changes are summarized separately.`;
 let third=detail(s.meta,'interpretation');
 if(['pr_tract','pr_points','pr_kriging'].includes(state.indicator))third='A warming threshold is a climate condition. It does not specify when this condition occurs, and the precipitation value does not predict flood depth, loss, or a particular storm.';
 if(state.indicator==='pr_change')third='The map uses the supplied tract-level percentage-change field, not a percentage calculated from the two displayed medians.';
 return [first,second,third];
}
function renderFindings(s){$('findings').innerHTML=findingTexts(s).map(t=>`<p>${esc(t)}</p>`).join('');$('planning-use').textContent=state.indicator==='overlap'?'Identify places for a closer, coordinated review of two concerns. Test alternative thresholds and verify with local evidence before prioritizing investment.':detail(s.meta,'planning_use');}
function renderReference(s) {
 const m=s.meta;
 if(state.indicator==='overlap'){$('reference-content').innerHTML=`<div class="reference-body"><h3>Custom high–high overlap</h3><p>${esc(FACTOR_TEXT[state.factorA])} × ${esc(FACTOR_TEXT[state.factorB])}</p><div class="reference-notes"><section><h4>Geography</h4><p>Census tracts. Each factor retains its supplied reference period.</p></section><section><h4>Interpretation</h4><p>High means at or above each factor’s countywide ${state.percentile}th percentile. The legend reports the numerical cutoffs.</p></section><section><h4>Limitation</h4><p>Exploratory classification, not a causal, regulatory, or site-specific risk result. The fixed compound-hotspot layer remains unchanged.</p></section></div></div>`;return;}
 $('reference-content').innerHTML=`<div class="reference-body"><h3>${esc(m.label.split('•').pop().trim())}</h3><p>${esc(detail(m,'description'))}</p><div class="reference-facts"><div><span>Source layer</span><code>${esc(detail(m,'source_layer'))}</code></div><div><span>Geography &amp; reference</span><b>${esc(detail(m,'geography'))}<br>${esc(detail(m,'reference'))}</b></div><div><span>Measurement</span><b>${esc(detail(m,'measurement'))}</b></div></div><div class="reference-notes"><section><h4>How to interpret</h4><p>${esc(detail(m,'interpretation'))}</p></section><section><h4>Potential planning use</h4><p>${esc(detail(m,'planning_use'))}</p></section><section><h4>Important limitation</h4><p>${esc(detail(m,'limitation'))}</p></section></div></div>`;
}

// ---- Inspect a tract without silently changing a ZIP/precinct selection --
function inspectSelectedTract() {
 if(state.step!==4||state.applying||!snapshot)return;const sel=M('tract_source').selected.indices;if(!sel.length)return;
 const i=Number(sel[0]);state.inspected=i;const d=S('tract_source');$('tract-inspection').hidden=false;
 $('inspection-title').textContent=`Census tract ${d.GEOID[i]}${scopeMembership().tract.includes(i)?'':' · outside the selected location screen'}`;
 const out=nativeModel('guided_inspected_tract');out.data={xs:[d.xs[i]],ys:[d.ys[i]]};out.change.emit();
 let pairs=[];
 if(isCombined()){const r=snapshot.combination.allRows[i];pairs=snapshot.combination.thresholds.map(f=>[f.label,factorValue(f,r.values[f.id],true)+' · '+(r.flags[f.id]===null?'Missing value':r.flags[f.id]?'Condition met':'Condition not met')]);pairs.push(['Meets overlap rule',r.eligible?(r.matched?'Yes':'No'):'Missing data']);}
 else if(comparisonFields()){pairs=comparisonFields().map((f,j)=>[[2020,2050,'Supplied change'][j],fmt(d[f][i],snapshot.dec)+' '+snapshot.unit]);}
 else if(['pr_tract','pr_kriging','pr_points','pr_change'].includes(state.indicator)){pairs=[['GMT +1.5°C',fmt(d.pr_15[i],1)+' mm'],['GMT +2.5°C',fmt(d.pr_25[i],1)+' mm'],['Selected GMT',fmt(d['pr_'+state.gmt][i],1)+' mm']];if(state.indicator==='pr_change')pairs=[['GMT +1.5°C',fmt(d.pr_15[i],1)+' mm'],['GMT +2.5°C',fmt(d.pr_25[i],1)+' mm'],['Supplied change',fmt(d.sens_pct[i],1)+'%']];}
 else if(state.indicator==='hotspot'){pairs=[['Compound class',d.hotspot_combo[i]],['Precipitation, +2.5°C',fmt(d.pr_25[i],3)+' mm'],['Household growth',fmt(d.hh_chg[i])],['SVI, 2020',fmt(d.SVI[i],5)]];}
 else if(state.indicator==='overlap'){pairs=[[FACTOR_TEXT[state.factorA],fmt(d[state.factorA][i],state.factorA==='SVI'?5:2)],[FACTOR_TEXT[state.factorB],fmt(d[state.factorB][i],state.factorB==='SVI'?5:2)]];}
 else if(snapshot.context.source===M('tract_source'))pairs=[[snapshot.meta.short,fmt(d[snapshot.field][i],snapshot.dec)+' '+snapshot.unit]];
 else pairs=[['Single-family source records',fmt(d.n_single_f[i])],['Multi-family source records',fmt(d.n_multi_fa[i])],['Tract housing-unit change',fmt(d.parcel_hu_change[i])]];
 $('inspection-content').innerHTML='<div class="inspection-metrics">'+pairs.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')+'</div>'+(state.indicator==='pr_points'?'<p class="field-help">This inspection uses tract attributes, not a model-point value.</p>':'')+'<p class="field-help">The summary cards, chart, and report above still describe your selected place.</p>';
}
function closeInspection(){state.inspected=null;$('tract-inspection').hidden=true;M('tract_source').selected.indices=[];nativeModel('guided_inspected_tract').data={xs:[],ys:[]};}

// ---- Topic-specific print brief, entirely browser generated ---------------
function boundarySVG() {
 const b=boundaryData(),rings=collectRings(b.xs,b.ys),[x0,y0,x1,y1]=b.bounds,W=330,H=180,pad=10,scale=Math.min((W-2*pad)/(x1-x0||1),(H-2*pad)/(y1-y0||1)),ox=(W-(x1-x0)*scale)/2,oy=(H-(y1-y0)*scale)/2;
 const paths=rings.map(([x,y])=>Array.from(x,(xx,i)=>(i?'L':'M')+(ox+(xx-x0)*scale).toFixed(1)+' '+(H-oy-(y[i]-y0)*scale).toFixed(1)).join(' ')+'Z').join(' ');
 return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Selected geographic boundary"><rect width="${W}" height="${H}" fill="#F4F7F9"/><path d="${paths}" fill="#D9ECEC" stroke="#1A737D" stroke-width="1.4" fill-rule="evenodd"/></svg>`;
}
function generateReport() {
 if(isCombined()){generateCombinedReport();return;}
 if(!snapshot||state.step!==4)return;const s=snapshot,w=window.open('','_blank');
 if(!w){$('report-status').classList.add('error');$('report-status').textContent='The browser blocked the report window. Allow pop-ups for this dashboard, then select Print screening brief again.';return;}
 const highlighted=currentLegendKey!==null?`${s.context.labels?.[currentLegendKey]||currentLegendKey}: ${fmt(s.counts[currentLegendKey]||0)} ${s.features} highlighted.`:'No legend class highlighted.';
 const facts=findingTexts(s).slice(0,3);
 const rows=state.period==='comparison'&&s.comparison?[
  ['2020 value / tract median',fmt(s.comparison[0].median,s.dec)+' '+s.levelUnit],['2050 value / tract median',fmt(s.comparison[1].median,s.dec)+' '+s.levelUnit],[state.location==='tract'?'Supplied tract change':'Median of supplied tract changes',fmt(s.comparison[2].median,s.dec)+' '+s.unit],['Features in selected place',fmt(s.indices.length)+' '+s.features]
 ]:s.categorical?Object.entries(s.counts).map(([k,n])=>[s.context.labels?.[k]||k,fmt(n)+' '+s.features]).slice(0,10):[
  [state.location==='tract'&&s.context.source===M('tract_source')?'Selected tract value':'Selected-place median',fmt(s.stats.median,s.dec)+' '+s.unit],['Selected-place range',fmt(s.stats.min,s.dec)+' – '+fmt(s.stats.max,s.dec)],['Countywide feature median',fmt(s.county.median,s.dec)+' '+s.unit],['Features with valid values',fmt(s.stats.n)+' '+s.features]
 ];
 const date=new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(placeLabel())} — Climate-Housing Decision Brief</title><style>
 @page{size:letter portrait;margin:.4in}*{box-sizing:border-box}body{font:12px/1.45 'Segoe UI',Arial,sans-serif;color:#24404E;margin:0;background:#EAF0F3}.toolbar{max-width:800px;margin:12px auto;text-align:right}.toolbar button{border:0;background:#117E83;color:white;padding:10px 16px;cursor:pointer}article{background:#fff;max-width:800px;margin:0 auto;padding:24px}.head{border-top:5px solid #117E83;background:#153549;color:white;padding:17px 20px}.head small{letter-spacing:1px;font-size:9px;color:#B7DDDF}.head h1{font-size:24px;line-height:1.2;margin:5px 0}.head p{margin:3px 0 0;font-size:12px}.settings{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#CFDDE3;border:1px solid #CFDDE3;margin:14px 0}.settings>div{background:#F5F9FA;padding:9px 12px}.settings span{display:block;font-size:8px;letter-spacing:.8px;color:#637D89}.settings b{font-size:11px;font-weight:650}.grid{display:grid;grid-template-columns:44% 1fr;gap:16px}.card{border:1px solid #D6E3E7;padding:12px;margin-bottom:12px;break-inside:avoid}.card h2{font-size:13px;color:#153549;margin:0 0 9px}.map svg{width:100%;height:170px}.caption{font-size:9px;color:#6C8794;margin:4px 0}.note{background:#FFF5DE;border-left:3px solid #D28C24;padding:9px 12px;font-size:10px;margin:9px 0;line-height:1.45}.card p{font-size:11px;margin:0 0 8px}table{border-collapse:collapse;width:100%;font-size:10.5px}th,td{padding:7px 5px;border-bottom:1px solid #DEE8EC;text-align:left;vertical-align:top}th{width:55%;font-weight:600}td{color:#173D4D}.interpretation p{font-size:11px;line-height:1.5}.foot{font-size:9px;border-top:1px solid #D6E3E7;margin-top:12px;padding-top:8px;color:#5E7885;display:flex;justify-content:space-between;gap:15px}.foot a{color:#176E78}.tiny{font-size:9px;color:#5E7885;line-height:1.45}.printnote{max-width:800px;margin:7px auto;font-size:11px;color:#56717F}@media print{body{background:white;font-size:12px}.toolbar,.printnote{display:none}article{padding:0;max-width:none}.head{padding:12px 16px}.head h1{font-size:22px}.settings{margin:10px 0}.grid{gap:12px}.card{padding:10px;margin-bottom:10px}.map svg{height:140px}th,td{padding:5px 4px}.card p,.interpretation p{font-size:11.5px}.note{font-size:10.5px;padding:8px 10px}.foot,.tiny{font-size:9.5px}table{font-size:11.5px}.settings b{font-size:12px}.settings span{font-size:9px}.caption{font-size:10px}}@media(max-width:600px){article{padding:15px}.grid{grid-template-columns:1fr}}
 </style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div><p class="printnote">Letter or A4 · use default scale and turn off browser headers and footers.</p><article><header class="head"><small>CLIMATE–HOUSING EXPOSURE INDEX · HARRIS COUNTY, TEXAS</small><h1>${esc(placeLabel())}</h1><p>${esc(INDICATORS[state.indicator].name)} · Screening brief</p></header><div class="settings"><div><span>CLIMATE CONDITIONS (NOT A YEAR)</span><b>${esc(climateLabel())}</b></div><div><span>REFERENCE PERIOD / COMPARISON</span><b>${esc(periodLabel())}</b></div></div><div class="grid"><section><div class="card map"><h2>Selected place</h2>${boundarySVG()}<p class="caption">Simplified selected boundary; not a thematic risk map.</p></div><div class="card"><h2>Key values / category counts</h2><table>${rows.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table><p class="caption">${esc(highlighted)} Statistics describe the entire selected geographic screen, not just the highlighted class. ${state.period==='comparison'&&s.comparison&&state.location!=='tract'?'The median of tract changes can differ from the difference between the two year medians.':''}</p></div></section><section><div class="card interpretation"><h2>What the results suggest</h2>${facts.map(t=>`<p>${esc(t)}</p>`).join('')}<h2>Potential planning use</h2><p>${esc($('planning-use').textContent)}</p></div><div class="note">${esc(locationCaveat(s))}</div><div class="note"><b>Interpretation limit.</b> ${esc(state.indicator==='overlap'?'Exploratory two-factor screen, not a causal or regulatory classification.':detail(s.meta,'limitation'))} Validate with authoritative local evidence before a specific policy, investment, or site decision.</div></section></div><p class="tiny"><b>Source:</b> Supplied Harris County dashboard package; source organizations include Texas Tech University Climate Center, H-GAC, HCAD, and CDC/ATSDR. No new climate or demographic projections were generated by this workflow. ${state.indicator==='hotspot'?'Fixed high conditions: precipitation ≥203.603 mm at GMT +2.5°C; household growth ≥746; SVI ≥0.88386.':''}</p><footer class="foot"><span>Prepared ${esc(date)} · ${esc(DATA.release)}<br>Research, education, and exploratory planning only.</span><span>Kaifa Lu · CECREH<br><a href="mailto:Kaifa.Lu@ttu.edu">Kaifa.Lu@ttu.edu</a></span></footer></article></body></html>`;
 w.document.open();w.document.write(html);w.document.close();$('report-status').classList.remove('error');$('report-status').textContent=`Brief opened for ${placeLabel()}. Use Print / Save as PDF in its new tab.`;
}

/*COMBINED_VIEW*/

// Background tiles are optional. The embedded map has no network dependency.
function setBasemap(mode){
 const plot=M('map_plot'),renderer=M('basemap_renderer');
 const hosted=['http:','https:'].includes(window.location.protocol);
 const online=mode==='streets'&&hosted;
 if(renderer&&plot){
  const remaining=Array.from(plot.renderers||[]).filter(r=>r!==renderer);
  renderer.visible=online;
  plot.renderers=online?[renderer,...remaining]:remaining;
 }
 $('basemap-style').value=online?'streets':'embedded';
 $('street-attribution').hidden=!online;
 $('basemap-help').textContent=online?'Street tiles need an internet connection and may be unavailable. If they do not load, choose Embedded boundaries; your analytical layers remain available.':hosted?'The default map uses the embedded boundaries and analytical layers, with no API key or tile request. You can optionally add online street tiles.':'The local HTML uses the embedded boundaries and analytical layers without an API key or network request. The optional street background is available when this file is served over HTTP or HTTPS.';
}
function wireBasemap(){
 const option=$('basemap-style').querySelector('option[value="streets"]');
 option.disabled=!['http:','https:'].includes(window.location.protocol);
 $('basemap-style').addEventListener('change',e=>setBasemap(e.target.value));
 setBasemap('embedded');
}

// ---- Event binding and startup -----------------------------------------
function wire() {
 document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
 document.querySelectorAll('[data-open-help]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();showPage('help');}));
 $('home-link').addEventListener('click',e=>{e.preventDefault();showPage('explorer');});
 document.querySelectorAll('.steps button').forEach(b=>b.addEventListener('click',()=>{const n=Number(b.dataset.step);if(n<=state.furthest)gotoStep(n);}));
 document.querySelectorAll('[data-location]').forEach(b=>b.addEventListener('click',()=>setLocationType(b.dataset.location)));
 $('place-input').addEventListener('input',e=>{state.code=e.target.value.trim();invalidateAfter(0);updatePlaceStatus();});
 $('place-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&validStep(0)){e.preventDefault();gotoStep(1);}});
 $('precinct-input').addEventListener('change',e=>{state.code=e.target.value;invalidateAfter(0);updatePlaceStatus();});
 document.querySelectorAll('[data-climate]').forEach(b=>b.addEventListener('click',()=>setClimate(b.dataset.climate)));
 $('warming-input').addEventListener('change',e=>{state.gmt=e.target.value;invalidateAfter(1);refreshNavigation();});
 $('indicator-input').addEventListener('change',e=>{state.indicator=e.target.value;state.period='';invalidateAfter(2);updateIndicatorExplanation();});
 $('period-input').addEventListener('change',e=>{state.period=e.target.value;invalidateAfter(3);updatePeriodExplanation();});
 $('display-input').addEventListener('change',e=>{state.housing=e.target.value;state.applied=false;});
 for(const [id,prop] of [['factor-a','factorA'],['factor-b','factorB']]){$(id).innerHTML=FACTORS.map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('');$(id).value=state[prop];$(id).addEventListener('change',e=>{state[prop]=e.target.value;refreshNavigation();$('wizard-error').hidden=state.factorA!==state.factorB;$('wizard-error').textContent='Choose two different factors for an informative comparison.';});}
 $('overlap-percentile').addEventListener('change',e=>{state.percentile=Number(e.target.value);});
 $('next-button').addEventListener('click',()=>{if(validStep(state.step))gotoStep(state.step+1);});
 $('back-button').addEventListener('click',()=>gotoStep(Math.max(0,state.step-1)));
 $('edit-selections').addEventListener('click',()=>gotoStep(2));
 $('restart-button').addEventListener('click',()=>{state=initial();snapshot=null;currentLegendKey=null;document.querySelectorAll('.choice').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});$('show-zips').checked=false;$('show-precincts').checked=false;M('all_zip_renderer').visible=false;M('all_precinct_renderer').visible=false;$('map-opacity').value='82';silent('opacity_slider','value',.82);$('place-field').hidden=true;$('place-status').textContent='';$('warming-field').hidden=true;$('climate-explanation').textContent='Choose a rainfall view, or continue without precipitation. Population and housing years are selected separately in Step 4.';$('report-status').textContent='';$('factor-search').value='';$('result-table-filter').value='matched';setBasemap('embedded');activeCombination=null;nativeModel('guided_screen_matches').data={xs:[],ys:[]};gotoStep(0);});
 $('fit-location').addEventListener('click',fitPlace);
 $('show-zips').addEventListener('change',e=>{M('all_zip_renderer').visible=e.target.checked;});
 $('show-precincts').addEventListener('change',e=>{M('all_precinct_renderer').visible=e.target.checked;});
 $('map-opacity').addEventListener('input',e=>{silent('opacity_slider','value',Number(e.target.value)/100);if(isCombined())applyCombinedMap();else window.CHEI.updateLayer();});
 $('legend-content').addEventListener('click',e=>{const b=e.target.closest('button[data-legend-key]');if(b&&!b.disabled)selectLegend(b.dataset.legendKey);});
 $('legend-selection').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.textContent.toLowerCase().includes('clear')){e.preventDefault();clearLegend();}});
 $('report-button').addEventListener('click',generateReport);
 $('close-inspection').addEventListener('click',closeInspection);
 $('use-inspected-tract').addEventListener('click',()=>{if(state.inspected===null)return;const code=String(S('tract_source').GEOID[state.inspected]);state.location='tract';state.code=code;setLocationType('tract');gotoStep(4);});
 window.addEventListener('chei:layer-ready',()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshResults,45);});
 window.addEventListener('chei:tract-selected',()=>{if(!state.applying)inspectSelectedTract();});
 new ResizeObserver(()=>resizeMap()).observe($('map-host'));
 $('layer-reference').addEventListener('toggle',()=>{});
 wireCombinedControls();wireBasemap();$('warming-input').value=state.gmt;refreshNavigation();
}
let tries=0;
function boot() {
 try{
  if(window.Bokeh?.documents?.length){doc=Bokeh.documents[0];if(!window.CHEI){const cb=M('update_callback');if(cb)cb.execute(M('map_plot'));}
   if(window.CHEI&&M('tract_source')){M('tract_source').selected.indices=[];wire();$('loading-message').hidden=true;$('setup-grid').hidden=false;
    window.GUIDE={getState:()=>({...state}),getSnapshot:()=>snapshot,getScope:()=>currentMembers.slice(),getCombination:()=>snapshot?.combination||null,gotoStep,showPage,selectLegend,clearLegend,generateReport,applyResults,scopeForContext,DATA};
    return;
   }
  }
 }catch(e){console.error('Guided dashboard initialization',e);}
 tries++;if(tries<180)setTimeout(boot,100);else{$('loading-message').textContent='The embedded dashboard could not initialize. Reload the complete HTML file in a current browser; JavaScript must be enabled.';$('loading-message').setAttribute('role','alert');}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
})();
