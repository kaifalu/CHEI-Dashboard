/* Native checklist and per-indicator controls, included inside guided.js.
 * All source descriptors and calculations are supplied by CHEIOverlap.
 */
const FACTOR_GROUPS=[
 {id:'core',label:'Start with the main indicators',note:'Precipitation, vulnerability, housing growth, and population.'},
 {id:'exposure',label:'Exposure indices & population density',note:'Supplied indices keep their original definitions.'},
 {id:'housing',label:'Housing stock & concentration',note:'Choose record counts or a summary of the 1 km housing grid.'},
 {id:'community',label:'Households, employment & land use',note:'Set reference periods and land-use categories in the next step.'},
 {id:'climate',label:'More precipitation representations',note:'Use climate-model points, the surface’s tract context, or the fixed warming comparison.'}
];
const FACTOR_CATALOG=[
 {id:'precipitation',group:'core',label:'Extreme precipitation',description:'Use the rainfall condition chosen in Step 2: a warming threshold or the supplied percentage change.',climate:'chosen'},
 {id:'svi',group:'core',label:'Social vulnerability',description:'2020 SVI: the supplied relative social vulnerability of each census tract.'},
 {id:'housing',group:'core',label:'Housing-unit growth',description:'Projected 2020–2050 housing-unit change, summed from the supplied changing parcels to tracts.'},
 {id:'population',group:'core',label:'Population',description:'Choose the 2020 count, 2050 projection, or projected population change.',periods:true},
 {id:'chei',group:'exposure',label:'Climate-Housing Exposure Index (CHEI)',description:'Choose the supplied 2020 index, 2050 index, or change. The original climate assumptions remain in place.',periods:true},
 {id:'hotspot',group:'exposure',label:'Fixed compound hotspots',description:'Choose named categories such as “All three high.” The fixed rainfall, household-growth, and SVI definition is retained.',category:true},
 {id:'pop_density',group:'exposure',label:'Population density',description:'2020 tract population density. The source density unit is retained because its denominator is not documented.'},
 {id:'sf_tract',group:'housing',label:'Single-family housing records',description:'Complete supplied 2020 single-family housing-record counts by tract.'},
 {id:'mf_tract',group:'housing',label:'Multi-family housing records',description:'Complete supplied 2020 multi-family housing-record counts by tract. A record is not a verified dwelling-unit total.'},
 {id:'housing_density',group:'housing',label:'Housing concentration · 1 km grid',description:'Median full-count housing-grid cell value among cells intersecting each tract. Choose single-family, multi-family, or both.',housing:true},
 {id:'housing_points',group:'housing',label:'Housing locations · tract summary',description:'Use complete tract housing-record counts for combinations. The sampled point display is not used to estimate totals.',housing:true},
 {id:'households',group:'community',label:'Households',description:'Choose 2020 households, the 2050 projection, or projected household change.',periods:true},
 {id:'employment',group:'community',label:'Employment',description:'Choose 2020 jobs, the 2050 projection, or projected employment change.',periods:true},
 {id:'land_use',group:'community',label:'Land use · changed parcels',description:'Choose current or projected dominant land-use categories among changing parcels assigned to each tract. Not all county parcels.',periods:true,category:true},
 {id:'pr_points',group:'climate',label:'Precipitation · model-point mean',description:'Mean of model points inside each tract at the Step 2 warming threshold. Tracts without points remain missing.',climate:'threshold'},
 {id:'pr_kriging',group:'climate',label:'Precipitation · surface tract context',description:'Use the supplied tract precipitation values associated with the interpolated display. No raster pixels are extracted.',climate:'threshold'},
 {id:'pr_change',group:'climate',label:'Precipitation change · +2.5°C vs +1.5°C',description:'The supplied percentage-change layer uses this fixed warming comparison, independently of the Step 2 selection.'}
];
const FACTOR_BY_ID=Object.fromEntries(FACTOR_CATALOG.map(f=>[f.id,f]));
function factorUnavailable(id){
 const f=FACTOR_BY_ID[id];
 if(f?.climate==='chosen'&&!['threshold','compare'].includes(state.climate))return 'Choose a precipitation condition in Step 2 to enable this input.';
 if(f?.climate==='threshold'&&state.climate!=='threshold')return 'Choose a single warming threshold in Step 2 to enable this representation.';
 return '';
}
function normalizeFactorSelections(){
 state.factors=[...new Set(state.factors)].filter(id=>FACTOR_BY_ID[id]&&!factorUnavailable(id));
 state.minCount=Math.min(Math.max(Number(state.minCount)||1,1),Math.max(state.factors.length,1));
 for(const id of state.factors){
  if(!FACTOR_BY_ID[id].category)continue;
  const descriptor=window.CHEIOverlap.factor({id,period:state[id+'Period']},{metadata:DATA.expanded?.metadata?.fields||{},climate:state.climate,gmt:state.gmt});
  const choices=descriptor.categories||[];
  if(!Object.prototype.hasOwnProperty.call(state.categoryValues,id))state.categoryValues[id]=Array.from(descriptor.defaultValues||choices.slice(0,1));
  else state.categoryValues[id]=state.categoryValues[id].filter(v=>choices.includes(v));
 }
}
function setFactorSelected(id,selected){
 if(!FACTOR_BY_ID[id]||factorUnavailable(id))return;
 if(selected){if(!state.factors.includes(id))state.factors.push(id);}else state.factors=state.factors.filter(x=>x!==id);
 normalizeFactorSelections();invalidateAfter(2);renderFactorChecklist();refreshNavigation();
}
function factorValue(f,value,withUnit=false){
 if(value===null||value===undefined||value==='')return 'No data';
 return f.kind==='category'?String(value):fmt(value,f.decimals||0)+(withUnit&&f.unit?' '+f.unit:'');
}
function conditionHTML(f){return f.kind==='category'?`Category is ${f.allowedValues.map(v=>`<b>${esc(v)}</b>`).join(' or ')}`:`High at ≥ ${exactCutoff(f)}`;}
function conditionSummary(){
 const descriptors=factorDescriptors(),numeric=descriptors.filter(f=>f.kind!=='category').length,categorical=descriptors.length-numeric;
 return (numeric?`${state.percentile}th percentile for numeric values`:'')+(numeric&&categorical?' · ':'')+(categorical?'chosen categories':'');
}
function duplicateFactorPair(){
 const descriptors=factorDescriptors(),duplicate=descriptors.find((f,i)=>descriptors.findIndex(other=>other.field===f.field)!==i);
 return duplicate?[descriptors.find(f=>f.field===duplicate.field),duplicate]:null;
}
function factorValidationError(selectionOnly=false){
 if(state.factors.length<2)return 'Select at least two indicators to combine.';
 const unavailable=state.factors.map(factorUnavailable).find(Boolean);if(unavailable)return unavailable;
 if(selectionOnly){
  const pair=duplicateFactorPair();if(!pair)return '';
  if(pair.some(f=>FACTOR_BY_ID[f.id]?.housing))return ''; // Step 4 can resolve this choice.
  return `${pair[0].label} and ${pair[1].label} use the same underlying measure. Uncheck one representation so it is not counted twice.`;
 }
 const result=combinationScreen();
 return result.ok?'':result.error.replace(/\s*\([^()]*source field[^()]*\)/g,'').replace(/\s*\((?:pr_\d+|sens_pct|n_single_f|n_multi_fa|parcel_hu_change)\)/g,'');
}
function renderFactorChecklist(){
 normalizeFactorSelections();
 const focusId=document.activeElement?.id,query=state.factorSearch.trim().toLowerCase();let visibleCount=0;
 $('factor-catalog').innerHTML=FACTOR_GROUPS.map(group=>{
  const items=FACTOR_CATALOG.filter(f=>f.group===group.id),visible=items.filter(f=>!query||`${f.label} ${f.description}`.toLowerCase().includes(query)),selected=items.filter(f=>state.factors.includes(f.id)).length;
  visibleCount+=visible.length;
  return `<details class="factor-group" data-factor-group="${group.id}" ${query||state.openFactorGroups[group.id]?'open':''} ${visible.length?'':'hidden'}><summary><span>${esc(group.label)}<small>${esc(group.note)}</small></span><b>${selected?selected+' selected':items.length+' options'}</b></summary><div class="factor-grid">${items.map(f=>{
   const checked=state.factors.includes(f.id),reason=factorUnavailable(f.id),isVisible=visible.includes(f),tag=f.category?'Choose categories':f.housing?'Choose housing type':f.periods?'Choose period':f.climate?'Uses Step 2':'Source definition';
   return `<label class="factor-card ${checked?'checked':''} ${reason?'unavailable':''}" for="factor-${f.id}" ${isVisible?'':'hidden'}><input id="factor-${f.id}" type="checkbox" data-factor="${f.id}" ${checked?'checked':''} ${reason?'disabled':''} aria-describedby="factor-help-${f.id}"><span><b>${esc(f.label)}</b><small id="factor-help-${f.id}">${esc(reason||f.description)}</small><em class="factor-tag">${esc(reason?'Step 2 choice needed':tag)}</em></span></label>`;
  }).join('')}</div></details>`;
 }).join('')+(visibleCount?'':'<p class="empty-state">No indicators match that search. Try a shorter name, or clear the search.</p>');
 document.querySelectorAll('[data-factor-group]').forEach(group=>group.addEventListener('toggle',()=>{if(!state.factorSearch.trim())state.openFactorGroups[group.dataset.factorGroup]=group.open;}));
 $('selected-factor-chips').innerHTML=state.factors.length?'<span class="field-help">Selected:</span>'+state.factors.map(id=>`<button type="button" class="factor-chip" data-remove-factor="${id}" aria-label="Remove ${esc(FACTOR_BY_ID[id].label)}">${esc(FACTOR_BY_ID[id].label)} <span aria-hidden="true">×</span></button>`).join(''):'';
 const error=state.factors.length>=2?factorValidationError(true):'';
 const pair=state.factors.length>=2?duplicateFactorPair():null;
 const nextStepNotice=pair&&!error?' Two housing choices currently use the same measure. Continue to Step 4 and choose a different housing type before showing results.':'';
 $('factor-selection-status').textContent=error||`${state.factors.length} ${state.factors.length===1?'indicator':'indicators'} selected. `+(state.factors.length>=2?'Next, set periods, housing types, and the conditions that count as a match.':'Choose at least two, or use Explore one layer.')+nextStepNotice;
 $('factor-selection-status').classList.toggle('error',Boolean(error));
 $('select-core-factors').textContent=state.climate==='none'?'Select vulnerability, housing growth, and population':'Select the four main indicators';
 if(focusId?.startsWith('factor-'))document.getElementById(focusId)?.focus({preventScroll:true});
}
function renderCombinedPeriodOptions(){
 normalizeFactorSelections();
 $('factor-periods').innerHTML=factorDescriptors().map(f=>{
  const cfg=FACTOR_BY_ID[f.id],periods=cfg.periods?(f.id==='land_use'?[['2020','2020 · current land use'],['2050','2050 · projected land use']]:[['2020','2020 · baseline'],['2050','2050 · projection'],['change',f.id==='chei'?'Change · 2050 minus 2020':'Growth · 2050 minus 2020']]):[];
  const selection=periods.length?`<label for="${f.id}-period">Reference period<select id="${f.id}-period" data-factor-period="${f.id}">${periods.map(([value,label])=>`<option value="${value}" ${value===state[f.id+'Period']?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`:cfg.housing?`<label for="${f.id}-housing">Housing type<select id="${f.id}-housing" data-factor-housing="${f.id}">${[['combined','Single-family + multi-family'],['single','Single-family'],['multi','Multi-family']].map(([value,label])=>`<option value="${value}" ${value===state.factorHousing[f.id]?'selected':''}>${label}</option>`).join('')}</select></label>`:`<span class="fixed-period">${esc(f.period)}</span>`;
  const categories=f.kind==='category'?`<fieldset class="category-options"><legend>Which categories should meet this condition?</legend>${(f.categories||[]).map((value,i)=>`<label class="category-choice"><input type="checkbox" data-factor-category="${f.id}" value="${esc(value)}" ${f.allowedValues.includes(value)?'checked':''}><span>${esc(value)}</span></label>`).join('')}<p class="field-help">Choose one or more. A tract matches when its category is one of your choices; categories are not ranked by percentile.</p></fieldset>`:'';
  return `<article class="factor-period-row ${f.kind==='category'?'with-categories':''}"><div class="factor-period-title"><b>${esc(cfg.label)}</b><p>${esc(f.note||cfg.description)}</p></div><div class="factor-period-control">${selection}</div>${categories}</article>`;
 }).join('');
 const hasNumeric=factorDescriptors().some(f=>f.kind!=='category');
 $('combined-percentile').disabled=!hasNumeric;
 $('numeric-rule-field').hidden=!hasNumeric;
 state.minCount=Math.min(Math.max(state.minCount,1),Math.max(state.factors.length,1));
 $('combine-rule').value=state.rule;$('combined-percentile').value=String(state.percentile);
 $('minimum-count').innerHTML=range(state.factors.length).map(i=>`<option value="${i+1}">${i+1} of ${state.factors.length} conditions</option>`).join('');$('minimum-count').value=String(state.minCount);
 $('minimum-count-field').hidden=state.rule!=='atleast';renderCutoffPreview();updatePeriodExplanation();
}
function renderCutoffPreview(){
 const r=combinationScreen();
 $('cutoff-preview').classList.toggle('error',!r.ok);
 if(!r.ok){$('cutoff-preview').textContent=r.error;return;}
 $('cutoff-preview').innerHTML='<h4>These are the conditions your screen will use</h4><dl>'+r.thresholds.map(f=>`<dt>${esc(f.label)}</dt><dd>${conditionHTML(f)}<small>${fmt(f.countyValidCount)} of ${fmt(S('tract_source').GEOID.length)} county tracts have this value.</small></dd>`).join('')+'</dl><p class="field-help">'+(r.numericFactorCount?'Each numeric cutoff is calculated from valid countywide values, including ties. Shown cutoffs are rounded; screening uses full precision. ':'')+(r.categoryFactorCount?'Named categories match your choices without a numeric cutoff. ':'')+'A match is an exploratory condition, not a safety standard. Missing values are excluded from every rule.</p>';
}
function wireFactorCatalog(){
 $('factor-search').addEventListener('input',e=>{state.factorSearch=e.target.value;renderFactorChecklist();});
 $('expand-factor-groups').addEventListener('click',()=>{state.factorSearch='';$('factor-search').value='';FACTOR_GROUPS.forEach(g=>state.openFactorGroups[g.id]=true);renderFactorChecklist();});
 $('collapse-factor-groups').addEventListener('click',()=>{state.factorSearch='';$('factor-search').value='';FACTOR_GROUPS.forEach(g=>state.openFactorGroups[g.id]=false);renderFactorChecklist();});
 $('clear-factors').addEventListener('click',()=>{state.factors=[];invalidateAfter(2);renderFactorChecklist();refreshNavigation();});
 $('selected-factor-chips').addEventListener('click',e=>{const b=e.target.closest('[data-remove-factor]');if(b)setFactorSelected(b.dataset.removeFactor,false);});
 $('factor-periods').addEventListener('change',e=>{
  const el=e.target;
  if(el.dataset.factorPeriod){state[el.dataset.factorPeriod+'Period']=el.value;invalidateAfter(3);renderCombinedPeriodOptions();document.getElementById(el.id)?.focus({preventScroll:true});}
  else if(el.dataset.factorHousing){state.factorHousing[el.dataset.factorHousing]=el.value;invalidateAfter(3);renderCombinedPeriodOptions();document.getElementById(el.id)?.focus({preventScroll:true});}
  else if(el.dataset.factorCategory){const id=el.dataset.factorCategory;state.categoryValues[id]=Array.from($('factor-periods').querySelectorAll(`[data-factor-category="${id}"]:checked`)).map(input=>input.value);invalidateAfter(3);renderCutoffPreview();updatePeriodExplanation();}
 });
}
