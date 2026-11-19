/* Included inside guided.js by guided_builder.py. Shares the guide's place,
 * Bokeh model bridge and formatting functions; calculations live in overlap.js.
 */
let activeCombination=null;
const COMBINATION_COLORS=['#eef2f4','#d3e5e8','#a6ced4','#70acbb','#3c869e','#235c7b','#163b59'];
function combinationColor(count,total){
 if(count===0)return COMBINATION_COLORS[0];
 const position=count/total*6;
 if(total<=6)return COMBINATION_COLORS[Math.round(position)];
 const low=Math.floor(position),high=Math.min(low+1,6),weight=position-low;
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 const a=rgb(COMBINATION_COLORS[low]),b=rgb(COMBINATION_COLORS[high]);
 return '#'+a.map((value,i)=>Math.round(value+(b[i]-value)*weight).toString(16).padStart(2,'0')).join('');
}
function conditionStatus(flag){return flag===null?'Missing':flag?'Condition met':'Condition not met';}
function combinationWarningsHTML(r){
 return r.warnings?.length?'<section class="context-note" aria-label="Interpretation notes"><b>Interpretation notes</b><ul>'+r.warnings.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></section>':'';
}
function combinationMethodText(r){
 const numeric=r.thresholds.some(f=>f.kind!=='category'),categorical=r.thresholds.some(f=>f.kind==='category');
 return (numeric?'Numeric conditions use their own countywide cutoffs. Comparisons use original unrounded values and include ties. ':'')+(categorical?'Category conditions match the selected labels; labels have no numeric ranking.':'');
}
function applyCombinedResults(){
 activeCombination=combinationScreen();
 if(!activeCombination.ok){state.applying=false;state.applied=false;gotoStep(3);$('wizard-error').hidden=false;$('wizard-error').textContent=activeCombination.error;return;}
 applyCombinedMap();state.applying=false;refreshCombinedResults();resizeMap();fitPlace();
 setTimeout(()=>{resizeMap();fitPlace();},80);
}
function updateMatchOutline(){
 const out=nativeModel('guided_screen_matches'),d=S('tract_source');
 if(!activeCombination||!isCombined()){out.data={xs:[],ys:[]};out.change.emit();return;}
 let ids=activeCombination.matchedIndices;
 if(currentLegendKey!==null){const ctx=window.__cheiLegendContext;ids=ids.filter(i=>String(ctx.classes[i])===String(currentLegendKey));}
 out.data={xs:ids.map(i=>d.xs[i]),ys:ids.map(i=>d.ys[i])};out.change.emit();
}
function applyCombinedMap(){
 const r=activeCombination;if(!r?.ok)return;
 const wasApplying=state.applying;state.applying=true;currentLegendKey=null;
 silent('layer_select','value','svi');silent('overlap_toggle','active',false);window.CHEI.updateLayer();
 const d=S('tract_source'),f=r.thresholds.find(x=>x.id===state.mapFactor),opacity=M('opacity_slider').value;
 if(state.mapFactor!=='combined'&&!f)state.mapFactor='combined';
 const isOverview=state.mapFactor==='combined',classes=[],colors=[],values=[],labels={},palette={};
 if(isOverview){for(let n=0;n<=r.factorCount;n++){labels[String(n)]=`${n} of ${r.factorCount} conditions met`;palette[String(n)]=combinationColor(n,r.factorCount);}}
 else{labels['below']='Condition not met';labels['high']='Condition met';palette.below='#e7eef0';palette.high='#1c8295';}
 labels.missing='Missing selected data';palette.missing='#d6d6dc';
 r.allRows.forEach(row=>{
  const key=isOverview?row.classKey:row.flags[f.id]===null?'missing':row.flags[f.id]?'high':'below';classes.push(key);colors.push(palette[key]);
  values.push(isOverview?(row.eligible?`${row.matchCount} of ${r.factorCount} conditions met · ${row.matched?'meets':'does not meet'} rule`:'Missing selected data'):(row.values[f.id]===null?'No data':factorValue(f,row.values[f.id],true)+' · '+conditionStatus(row.flags[f.id])));
 });
 d.fill_color=colors;d.display_value=values;d.display_label=Array(r.allRows.length).fill(isOverview?'Selected indicator overlap':f.label);M('tract_source').change.emit();
 M('tract_renderer').glyph.fill_alpha=opacity;M('tract_renderer').nonselection_glyph.fill_alpha=opacity;
 const ctx={layerId:'combined',source:M('tract_source'),geometry:'polygon',classes,labels,baseAlpha:opacity,featureLabel:'census tracts',mapFactor:state.mapFactor};
 const selectedClasses=new Set(r.rows.map(row=>String(row.classKey))),compactLegend=isOverview&&r.factorCount>6;
 const legendKeys=Object.keys(labels).filter(k=>k==='missing'?classes.includes('missing'):!compactLegend||selectedClasses.has(k));
 const items=legendKeys.map(k=>`<button class="legend-button" data-legend-key="${k}" aria-pressed="false"><span style="background:${palette[k]}"></span><b>${esc(labels[k])}</b><em>0</em></button>`).join('');
 const omittedClasses=compactLegend&&legendKeys.filter(k=>k!=='missing').length<r.factorCount+1?'<p class="field-help">Empty count classes omitted.</p>':'';
 M('legend_div').text=(isOverview?'<p class="field-help">Darker fill = more selected conditions met in the same tract.</p>':`<p class="field-help">${esc(f.label)}<br>${conditionHTML(f)}</p>`)+items+omittedClasses+'<p class="match-outline-key"><i></i> Gold outline: meets your overlap rule</p>';
 window.CHEI.setLegendContext(ctx);currentMembers=scopeMembership().tract;updateScopeMask(ctx);updateMatchOutline();
 state.applying=wasApplying;
 if(!state.applying)refreshCombinedResults();
}
function combinedSnapshot(ctx){
 const r=activeCombination,counts={};r.indices.forEach(i=>{const key=String(ctx.classes[i]);counts[key]=(counts[key]||0)+1;});
 return {meta:{kind:'combined',label:'Flexible indicator overlap',short:'Selected conditions met',unit:'census tracts',decimals:0},field:null,indices:r.indices,data:S('tract_source'),values:r.rows.map(x=>x.matchCount),stats:stats(r.rows.filter(x=>x.eligible).map(x=>x.matchCount)),county:stats([]),counts,context:ctx,categorical:true,unit:'census tracts',dec:0,features:'census tracts',combination:r};
}
function combinationCaveat(){
 return (state.location==='tract'?'The selected census tract is the screening unit.':state.location==='county'?'Countywide tract screening. Each tract counts equally.':`Whole census tracts intersecting ${placeLabel()} are retained, including boundary touches. They are not clipped or area-weighted; these are not official ZIP or precinct totals.`)+' A warming condition is not a calendar year. This custom screen does not recalculate CHEI or the fixed hotspot layer.';
}
function refreshCombinedResults(){
 if(!activeCombination?.ok||state.step!==4||state.applying||!state.applied)return;
 const ctx=window.__cheiLegendContext;if(ctx?.layerId!=='combined')return;
 snapshot=combinedSnapshot(ctx);currentMembers=scopeMembership().tract;const s=snapshot,r=s.combination;
 ['combined-input-summary','factor-map-tabs','combined-table-section'].forEach(id=>$(id).hidden=false);
 $('results-title').textContent=placeLabel();$('results-subtitle').textContent=`${r.factorCount} indicators together · ${ruleText()}`;
 $('result-context').innerHTML=[['LOCATION',placeLabel()],['PRECIPITATION USED',climateLabel()],['MATCHING RULE',ruleText()]].map(([k,v])=>`<div><span>${k}</span><b>${esc(v)}</b></div>`).join('');
 $('result-caveat').textContent=combinationCaveat();
 $('summary-metrics').innerHTML=metric(fmt(r.matchedCount),'Tracts meeting your rule',ruleText())+metric(r.share===null?'No valid data':fmt(r.share*100,1)+'%','Share of complete-data tracts',`${fmt(r.eligibleCount)} tracts in the denominator`)+metric(fmt(r.scopeCount),'Tracts in selected place','Whole-tract geographic screen')+metric(fmt(r.missingCount),'Tracts with missing data','Excluded from every matching rule');
 const inputCards='<div class="input-summary-grid">'+r.factorSummaries.map(f=>`<article><span class="input-tag">${esc(f.short)}</span><b>${esc(f.label)}</b><p>${esc(f.period)}</p><div>${conditionHTML(f)}</div><small>${fmt(f.conditionCount??f.highCount)} of ${fmt(f.validCount)} tracts with data meet this condition${f.missingCount?' · '+fmt(f.missingCount)+' missing':''}.</small></article>`).join('')+'</div>';
 const keepInputsOpen=$('combined-input-details')?.open;
 $('combined-input-summary').innerHTML=(r.factorCount>6?`<details id="combined-input-details" class="more-factors"${keepInputsOpen?' open':''}><summary>Review ${r.factorCount} selected inputs, periods, and conditions</summary>${inputCards}</details><p class="field-help">${fmt(r.eligibleCount)} tracts have every selected value; ${fmt(r.missingCount)} have missing selected data and are excluded from the matching share.</p>`:'<div class="section-intro"><p class="eyebrow">YOUR SELECTED INPUTS</p><h3>Each indicator keeps its own period and condition</h3></div>'+inputCards)+combinationWarningsHTML(r);
 $('factor-map-tabs').innerHTML='<span>Map view</span><button data-map-factor="combined" class="'+(state.mapFactor==='combined'?'active':'')+'" aria-pressed="'+(state.mapFactor==='combined')+'">Combined overlap</button>'+r.thresholds.map(f=>`<button data-map-factor="${f.id}" class="${state.mapFactor===f.id?'active':''}" aria-pressed="${state.mapFactor===f.id}">${esc(f.short)}</button>`).join('');
 const input=r.thresholds.find(f=>f.id===state.mapFactor);
 $('map-title').textContent=input?input.label:`Number of conditions met · ${r.factorCount} selected indicators`;
 $('map-subtitle').textContent=input?'Input map only; your full combination and its results stay selected.':`Gold outlines: ${ruleText().toLowerCase()}. Darker fill: more conditions met.`;
 $('map-status').textContent='Click a tract to see all selected indicator values together. Pan and zoom do not change your selected location or summary.';
 $('legend-scope').textContent=`Class counts refer to ${placeLabel()}. Click a class to locate its tracts. Gold outlines always use the full selected overlap rule.`;
 renderLegend(s);renderCombinationCharts(r);renderCombinationFindings(r);renderCombinationReference(r);renderCombinationTable(r);$('report-button').disabled=false;
}
function renderCombinationCharts(r){
 $('chart-title').textContent='How many selected conditions are met in the same tract?';
 const bins=r.factorCount>6?r.countDistribution.filter(x=>x.n>0):r.countDistribution;
 $('main-chart').innerHTML=(bins.length?barChart(bins.map(x=>({label:`${x.count} of ${r.factorCount} met`,value:x.n,color:combinationColor(x.count,r.factorCount)}))):'<p class="field-help">No complete-data tracts are available to chart.</p>')+(bins.length<r.countDistribution.length?'<p class="field-help">Empty count classes omitted.</p>':'')+(r.missingCount?`<p class="field-help">${fmt(r.missingCount)} tracts have incomplete selected data and are not counted in these bars.</p>`:'');
 $('chart-note').textContent=`Counts describe ${fmt(r.eligibleCount)} complete-data tracts in the selected place. A count is not a new risk score. ${combinationMethodText(r)}`;
}
function combinationFindings(r){
 return [r.eligibleCount?`${fmt(r.matchedCount)} of ${fmt(r.eligibleCount)} complete-data tracts (${fmt(100*r.share,1)}%) meet the rule: ${ruleText().toLowerCase()}.`:'No tract has a complete set of selected values, so a matching share cannot be calculated.',
 r.eligibleCount===0?'No complete records are available, so this combination cannot be evaluated. Choose a different location or a set of indicators with overlapping data coverage.':r.matchedCount===0?'No tracts meet this particular combination. This does not mean no exposure or vulnerability is present. Inspect the individual inputs, try “at least” or “any,” or adjust selected categories or numeric percentiles in Step 4. Your current rule has not been changed.':`The map brings ${r.thresholds.map(f=>f.short.toLowerCase()).join(', ')} into the same tract-based screen. The gold outline identifies the matches; each input tab lets you inspect one part of that combination.`,
 (r.thresholds.some(f=>f.kind!=='category')?'A numeric high-value condition is relative to the selected measure in Harris County. A larger population or more growth is not automatically a harmful condition. ':'')+(r.thresholds.some(f=>f.kind==='category')?'A category condition means membership in your selected labels, not a high or low rank. ':'')+'This screen identifies co-occurrence, not cause, flood depth, loss, or a new CHEI. Related indicators may describe the same underlying conditions.'];
}
function renderCombinationFindings(r){
 $('findings').innerHTML=combinationFindings(r).map(t=>`<p>${esc(t)}</p>`).join('')+(r.matchedCount===0?'<button class="button secondary" id="adjust-overlap-rule">Adjust periods or overlap rule</button>':'');
 $('adjust-overlap-rule')?.addEventListener('click',()=>gotoStep(3));
 $('planning-use').textContent='Use the selected combination to organize a joint review of the selected conditions and community needs. Compare alternative assumptions, then add local drainage, infrastructure, housing, and stakeholder evidence before prioritizing an action.';
}
function renderCombinationReference(r){
 $('reference-content').innerHTML='<div class="reference-body"><h3>Flexible overlap screening</h3><p>A transparent comparison of selected indicators on a common census-tract geography. The screen does not recalculate the supplied CHEI or fixed three-factor hotspots, even when those layers are selected as inputs.</p><div class="reference-notes">'+r.thresholds.map(f=>`<section><h4>${esc(f.label)}</h4><p><b>Source:</b> ${esc(f.source)}<br><b>Field:</b> <code>${esc(f.field)}</code><br><b>Reference:</b> ${esc(f.period)}<br><b>Condition:</b> ${conditionHTML(f)}${f.note?'<br>'+esc(f.note):''}</p></section>`).join('')+'</div><div class="context-note"><b>How a match is calculated.</b> '+(r.thresholds.some(f=>f.kind!=='category')?esc(r.methods.quantile)+' ':'')+esc(r.methods.comparison)+' '+esc(r.methods.missing)+'</div><p>'+esc(r.methods.geography)+'</p><p class="field-help">The fixed hotspot uses household growth, +2.5°C precipitation rounded to three decimals, and its original supplied thresholds. A custom screen can use different factors, periods, selected categories, and unrounded percentile cutoffs, so it need not reproduce the fixed hotspot count.</p></div>';
}
function renderCombinationTable(r){
 const matchedOnly=$('result-table-filter').value==='matched',rows=(matchedOnly?r.rows.filter(x=>x.matched):r.rows).slice().sort((a,b)=>Number(b.matched)-Number(a.matched)||Number(b.eligible)-Number(a.eligible)||b.matchCount-a.matchCount||a.geoid.localeCompare(b.geoid));
 $('result-table-status').textContent=`${fmt(rows.length)} ${matchedOnly?'matching':'selected'} tracts. The CSV always includes all ${fmt(r.scopeCount)} selected tracts.`;
 if(!rows.length){$('combined-results-table').innerHTML='<div class="empty-state">'+(r.eligibleCount===0?'No complete records are available to evaluate this rule.':'No tracts meet the current rule.')+'  Choose “All in the selected place” to inspect the input values, or adjust the overlap rule.</div>';return;}
 $('combined-results-table').innerHTML='<table class="screen-table"><caption class="sr-only">Selected indicator values and overlap results for '+esc(placeLabel())+'</caption><thead><tr><th scope="col">Census tract</th>'+r.thresholds.map(f=>`<th scope="col">${esc(f.label)}<small>${esc(f.unit)}</small></th>`).join('')+'<th scope="col">Conditions met</th><th scope="col">Meets rule</th></tr></thead><tbody>'+rows.map(row=>`<tr><th scope="row"><button class="table-tract-button" data-inspect-tract="${row.index}">${esc(row.geoid)}</button></th>${r.thresholds.map(f=>`<td><span title="Exact value: ${esc(row.values[f.id]??'No data')}">${esc(factorValue(f,row.values[f.id]))}</span><small class="${row.flags[f.id]?'is-high':'not-high'}">${conditionStatus(row.flags[f.id])}</small></td>`).join('')}<td>${row.eligible?row.matchCount+' of '+r.factorCount:'Incomplete'}</td><td><span class="match-badge ${row.matched?'yes':''}">${row.eligible?(row.matched?'Yes':'No'):'Missing data'}</span></td></tr>`).join('')+'</tbody></table>';
}
function downloadCombinationCSV(){
 const r=snapshot?.combination;if(!r?.ok)return;
 const headers=['location_type','location_id','location_label','precipitation_setting','rule','minimum_conditions_met','numeric_percentile','tract_geoid','complete_selected_data','condition_count','meets_rule','missing_indicator_ids'];
 r.thresholds.forEach(f=>headers.push(f.field+'_value',f.field+'_unit',f.field+'_period',f.field+'_criterion_kind',f.field+'_criterion_method',f.field+'_selected_categories',f.field+'_numeric_cutoff',f.field+'_numeric_percentile',f.field+'_condition_met'));
 const lines=[headers];r.rows.forEach(row=>{const cells=[state.location,state.code,placeLabel(),climateLabel(),r.rule,r.minCount,r.thresholds.some(f=>f.kind!=='category')?r.percentile:null,row.geoid,row.eligible,row.eligible?row.matchCount:null,row.eligible?row.matched:null,JSON.stringify(row.missing)];r.thresholds.forEach(f=>cells.push(row.values[f.id],f.unit,f.period,f.kind||'numeric',f.method,f.kind==='category'?JSON.stringify(f.allowedValues):null,f.kind==='category'?null:f.cutoff,f.kind==='category'?null:f.percentile,row.flags[f.id]));lines.push(cells);});
 const csvCell=v=>{if(v===null||v===undefined)return '';let text=String(v);if(typeof v==='string'&&(/^[\t\r\n]/.test(text)||/^\s*[=+@-]/.test(text)))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const csv='\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`CHEI_screen_${state.location}_${state.code}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function generateCombinedReport(){
 const r=snapshot?.combination;if(!r?.ok||!state.applied||state.step!==4)return;
 const w=window.open('','_blank');if(!w){$('report-status').classList.add('error');$('report-status').textContent='The browser blocked the report window. Allow pop-ups, then try opening the selection report again.';return;}
 const date=new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
 const cutoffNote=r.thresholds.some(f=>f.kind!=='category')?'Numeric cutoffs are displayed rounded; comparisons use original unrounded values with ≥ and include ties. ':'';
 const methodLabel=r.thresholds.some(f=>f.method==='percentile')?`Countywide ${r.percentile}th-percentile numeric cutoffs`:'Selected category conditions';
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(placeLabel())} — Indicator overlap report</title>
 <style>
 @page{size:letter portrait;margin:.4in}*{box-sizing:border-box}body{font:11px/1.4 Arial,sans-serif;color:#183c4b;margin:0;background:#eaf0f3}article{max-width:800px;margin:auto;background:white;padding:24px}.toolbar{max-width:800px;margin:12px auto;text-align:right}.toolbar button{padding:10px 15px;background:#117e83;color:white;border:0}header{background:#153549;color:white;padding:17px 20px;border-top:5px solid #117e83}header small{letter-spacing:1px;color:#b8dddd}h1{font-size:24px;margin:6px 0}h2{font-size:14px;margin:15px 0 7px;break-after:avoid;page-break-after:avoid}p{margin:7px 0}.settings,.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.settings>div,.stats>div{background:#f0f6f7;padding:10px;break-inside:avoid}.settings span{display:block;font-size:9px;color:#607c87}.settings small{display:block;margin-top:3px}.stats{grid-template-columns:repeat(4,1fr)}.stats b{display:block;font-size:23px}.stats span{font-size:10px;display:block}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px;break-inside:auto;page-break-inside:auto}thead{display:table-header-group}tfoot{display:table-footer-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{text-align:left;vertical-align:top;padding:7px 6px;border-bottom:1px solid #d9e6e9;overflow-wrap:anywhere}th{background:#eaf2f4}td small{display:block;color:#607782;margin-top:2px}.bottom{display:grid;grid-template-columns:200px 1fr;gap:15px;margin:13px 0}.boundary svg{width:100%;height:130px}.boundary p{font-size:9px}.note,.context-note{background:#fff4dc;border-left:3px solid #ce932b;padding:9px 12px;font-size:10px;margin-top:10px}.context-note ul{padding-left:18px;margin:6px 0}.context-note li{margin:5px 0;break-inside:avoid}.fine{font-size:9px;color:#5e7884}.source-list p{break-inside:avoid;page-break-inside:avoid}.source-list code{font-size:9px;overflow-wrap:anywhere}footer{border-top:1px solid #cddfe3;padding-top:8px;margin-top:12px;display:flex;justify-content:space-between;font-size:9px;break-inside:avoid}@media print{body{background:white}.toolbar{display:none}article{padding:0}.stats b{font-size:21px}.bottom{margin:8px 0}th,td{padding:5px}.note{font-size:10px}}
 </style></head><body>
 <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div><article>
 <header><small>HARRIS COUNTY · CLIMATE–HOUSING EXPOSURE DASHBOARD</small><h1>${esc(placeLabel())}</h1><p>${r.factorCount} indicators together · Exploratory overlap report</p></header>
 <div class="settings"><div><span>PRECIPITATION USED</span><b>${esc(climateLabel())}</b></div><div><span>MATCHING RULE</span><b>${esc(ruleText())}</b><small>${esc(methodLabel)}</small></div></div>
 <div class="stats"><div><b>${fmt(r.matchedCount)}</b><span>Tracts meeting rule</span></div><div><b>${r.share===null?'N/A':fmt(100*r.share,1)+'%'}</b><span>Share of complete data</span></div><div><b>${fmt(r.eligibleCount)}</b><span>Complete-data tracts</span></div><div><b>${fmt(r.missingCount)}</b><span>Missing selected data</span></div></div>
 <h2>Inputs, periods, and selected conditions</h2>
 <table><colgroup><col style="width:31%"><col style="width:25%"><col style="width:29%"><col style="width:15%"></colgroup><thead><tr><th scope="col">Selected indicator / source field</th><th scope="col">Reference period</th><th scope="col">Condition to meet</th><th scope="col">Meets condition / valid tracts</th></tr></thead><tbody>${r.factorSummaries.map(f=>`<tr><td><b>${esc(f.label)}</b><small>${esc(f.field)}</small></td><td>${esc(f.period)}</td><td>${conditionHTML(f)}</td><td>${fmt(f.conditionCount??f.highCount)} / ${fmt(f.validCount)}</td></tr>`).join('')}</tbody></table>
 <p class="fine">${esc(cutoffNote)}Category conditions use the selected text labels without assigning them a numeric order. Individual-indicator counts use that indicator's valid values. The combined rule excludes tracts missing any selected value.</p>
 <div class="bottom"><section class="boundary"><h2>Selected place</h2>${boundarySVG()}<p>Simplified location boundary, not a thematic risk map.</p></section><section><h2>Interpretation</h2><p>${esc(combinationFindings(r)[0])}</p><p>${esc(r.eligibleCount===0?'No complete records are available, so the rule cannot be evaluated. Review data coverage or choose a different selection.':r.matchedCount===0?'No tract meets this particular combination. This is not evidence of no exposure. Compare individual inputs and test alternative rules without assuming any result is a safety standard.':'The matching tracts meet the selected conditions in the same place. Use the input maps and tract values to investigate which concerns coincide before choosing an action.')}</p><p>${esc(combinationFindings(r)[2])}</p></section></div>
 ${combinationWarningsHTML(r)}
 <div class="note">${esc(combinationCaveat())}${state.factors.includes('housing')?' Housing-unit growth covers the supplied changing parcels allocated to tracts; it is not a full housing inventory.':''}</div>
 <h2>Sources and representation notes</h2><div class="source-list">${r.thresholds.map(f=>`<p><b>${esc(f.label)}</b> · <code>${esc(f.field)}</code><br>${esc(f.source)}${f.note?'<br>'+esc(f.note):''}</p>`).join('')}</div>
 <p class="fine">${esc(combinationMethodText(r))} ${esc(r.methods.missing)} ${esc(r.methods.geography)}</p>
 <p class="fine"><b>Source:</b> Supplied Harris County dashboard data, with climate, H-GAC growth, HCAD housing, and CDC/ATSDR SVI provenance as documented in the package. No new projections were generated. Export the screening CSV for exact values, selected categories, criterion types, periods, and full numeric precision. This report describes the selected place and rule; a map tab or legend highlight does not change its scope.</p>
 <footer><span>${esc(date)} · ${esc(DATA.release)}<br>Research, education, and planning exploration</span><span>Kaifa Lu · CECREH<br>Kaifa.Lu@ttu.edu</span></footer>
 </article></body></html>`;
 w.document.open();w.document.write(html);w.document.close();$('report-status').classList.remove('error');$('report-status').textContent=`Selection report opened for ${placeLabel()}. Choose Print / Save as PDF in the new tab. Long selections continue across pages.`;
}
function wireCombinedControls(){
 document.querySelectorAll('[data-view-mode]').forEach(b=>b.addEventListener('click',()=>setViewMode(b.dataset.viewMode)));
 $('factor-catalog').addEventListener('change',e=>{const el=e.target.closest('[data-factor]');if(el)setFactorSelected(el.dataset.factor,el.checked);});
 wireFactorCatalog();
 $('select-core-factors').addEventListener('click',()=>{state.factors=(state.climate==='none'?[]:['precipitation']).concat(['svi','housing','population']);state.minCount=2;normalizeFactorSelections();invalidateAfter(2);renderFactorChecklist();refreshNavigation();});
 $('combine-rule').addEventListener('change',e=>{state.rule=e.target.value;invalidateAfter(3);$('minimum-count-field').hidden=state.rule!=='atleast';updatePeriodExplanation();});
 $('minimum-count').addEventListener('change',e=>{state.minCount=Number(e.target.value);invalidateAfter(3);updatePeriodExplanation();});
 $('combined-percentile').addEventListener('change',e=>{state.percentile=Number(e.target.value);invalidateAfter(3);renderCutoffPreview();updatePeriodExplanation();});
 $('factor-map-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-map-factor]');if(!b)return;state.mapFactor=b.dataset.mapFactor;applyCombinedMap();});
 $('result-table-filter').addEventListener('change',()=>{if(snapshot?.combination)renderCombinationTable(snapshot.combination);});
 $('download-screen').addEventListener('click',downloadCombinationCSV);
 $('combined-results-table').addEventListener('click',e=>{const b=e.target.closest('[data-inspect-tract]');if(!b)return;M('tract_source').selected.indices=[Number(b.dataset.inspectTract)];inspectSelectedTract();$('tract-inspection').scrollIntoView({block:'nearest',behavior:'smooth'});});
}
