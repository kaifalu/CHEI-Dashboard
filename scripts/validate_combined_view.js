/* Focused presentation/export checks using the real screening engine.
 * Full browser layout and Bokeh interaction are validated separately.
 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),overlap=require(path.join(root,'web/overlap.js'));
const fields=JSON.parse(fs.readFileSync(path.join(root,'data/expanded_indicator_fields.json'),'utf8')).metadata.fields;
const specialCategory='Residential <mixed>';
const metadata={...fields,parcel_future_lu_mode:{...fields.parcel_future_lu_mode,categories:[specialCategory,'Multiple'],defaultValues:[specialCategory]}};
const source={GEOID:['001','002','003'],NAME:['One','Two','Three'],SVI:[.2,.8,.9],parcel_future_lu_mode:[specialCategory,'Multiple',null],hotspot_combo:['All three high','None high','All three high'],hp_2020:[10,20,30],hh_2020:[3,6,8],j_2020:[2,5,8],CHEI_2020:[.1,.5,.8],xs:[[],[],[]],ys:[[],[],[]]};
const specs=[{id:'svi'},{id:'land_use',period:'2050',allowedValues:[specialCategory]},{id:'hotspot',allowedValues:['All three high']}];
const screen=overlap.screen(source,{factors:specs,metadata,percentile:50,rule:'any'});
assert(screen.ok,screen.error);
const checks=[];
function check(condition,label){assert(condition,label);checks.push(label);}
function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function fmt(value,decimals=0){if(value===null||value===undefined)return 'No data';assert.strictEqual(typeof value,'number','Category labels must not be passed to numeric formatting');return Number(value).toFixed(decimals);}
const nodes={};
function makeNode(id){return nodes[id]={innerHTML:'',textContent:'',value:id==='result-table-filter'?'all':'',hidden:false,disabled:false,events:{},classList:{add(){},remove(){}},addEventListener(type,handler){this.events[type]=handler;},scrollIntoView(){}};}
['wizard-error','combined-input-summary','factor-map-tabs','combined-table-section','results-title','results-subtitle','result-context','result-caveat','summary-metrics','map-title','map-subtitle','map-status','legend-scope','report-button','chart-title','main-chart','chart-note','findings','planning-use','reference-content','result-table-filter','result-table-status','combined-results-table','report-status','factor-catalog','select-core-factors','combine-rule','minimum-count','minimum-count-field','combined-percentile','download-screen','tract-inspection'].forEach(makeNode);
const models={tract_source:{data:{...source},change:{emit(){}},selected:{indices:[]}},guided_screen_matches:{data:{},change:{emit(){}}},opacity_slider:{value:.8},tract_renderer:{glyph:{},nonselection_glyph:{}},legend_div:{text:''}};
let downloadedBlob,downloadName,reportHTML='',catalogCalls=0,selectedCall=null;
const state={location:'county',code:'county',factors:specs.map(s=>s.id),climate:'none',step:4,applied:true,applying:false,mapFactor:'combined',minCount:1,rule:'any',percentile:50};
const context={console,state,DATA:{release:'Fixture'},snapshot:null,currentLegendKey:null,currentMembers:[],$:id=>nodes[id]||null,esc,fmt,
 factorValue:(f,value,withUnit=false)=>value===null?'No data':f.kind==='category'?value:fmt(value,f.decimals)+(withUnit?' '+f.unit:''),
 conditionHTML:f=>f.kind==='category'?'Category is '+f.allowedValues.map(esc).join(' or '):'High at ≥ '+esc(f.cutoff)+' '+esc(f.unit),
 ruleText:()=>state.rule==='any'?'Any selected condition met':`All ${state.factors.length} conditions met`,
 placeLabel:()=> 'Test <area>',climateLabel:()=> 'No precipitation input',isCombined:()=>true,
 stats:values=>({n:values.length}),metric:(value,label,note)=>'<div>'+esc(value)+' '+esc(label)+' '+esc(note)+'</div>',
 barChart:rows=>{context.lastChartRows=rows;return rows.map(r=>'<p>'+esc(r.label)+': '+r.value+'</p>').join('');},
 M:name=>models[name],S:name=>models[name].data,nativeModel:name=>models[name],silent(){},scopeMembership:()=>({tract:[0,1,2]}),updateScopeMask(){},renderLegend(){},boundarySVG:()=>'<svg></svg>',
 document:{querySelectorAll:()=>[],createElement:()=>({click(){downloadName=this.download;},remove(){}}),body:{append(){}}},
 URL:{createObjectURL:blob=>{downloadedBlob=blob;return 'blob:test';},revokeObjectURL(){}},Blob,setTimeout:fn=>fn(),
 setFactorSelected:(id,checked)=>{selectedCall={id,checked};},wireFactorCatalog:()=>catalogCalls++,normalizeFactorSelections(){},invalidateAfter(){},renderFactorChecklist(){},refreshNavigation(){},updatePeriodExplanation(){},renderCutoffPreview(){},setViewMode(){},gotoStep(){},inspectSelectedTract(){},
 window:{open:()=>({document:{open(){},write(html){reportHTML=html;},close(){}}}),CHEI:{updateLayer(){},setLegendContext(ctx){context.window.__cheiLegendContext=ctx;}}},
 testScreen:screen};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'web/combined_view.js'),'utf8'),context);
vm.runInContext('activeCombination=testScreen;applyCombinedMap();',context);
check(nodes['combined-results-table'].innerHTML.includes('Residential &lt;mixed&gt;'),'Categorical table values remain readable and escaped');
check(nodes['combined-results-table'].innerHTML.includes('Condition met')&&!nodes['combined-results-table'].innerHTML.includes('NaN'),'Table uses generic condition labels without numeric category conversion');
check(nodes['combined-input-summary'].innerHTML.includes('Interpretation notes')&&nodes['combined-input-summary'].innerHTML.includes('fixed hotspot category'),'Engine warnings are visible beside the selected inputs');
check(!nodes['combined-input-summary'].innerHTML.includes('<details'),'Small selections retain open input cards');
check(nodes['chart-title'].textContent.includes('conditions are met'),'Chart describes numeric and category conditions together');
check(nodes['reference-content'].innerHTML.includes('Category is Residential &lt;mixed&gt;'),'Reference panel preserves the category condition');
state.mapFactor='land_use';
vm.runInContext('applyCombinedMap();',context);
check(models.tract_source.data.display_value[0].startsWith(specialCategory),'Individual map tooltip retains the raw category label');
check(models.legend_div.text.includes('Category is Residential &lt;mixed&gt;'),'Individual map legend explains the selected category');

function parseCSVLine(line){const cells=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const char=line[i];if(char==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(char===','&&!quoted){cells.push(value);value='';}else value+=char;}cells.push(value);return cells;}
async function main(){
 vm.runInContext('downloadCombinationCSV();',context);
 const csv=await downloadedBlob.text(),rows=csv.replace(/^\uFEFF/,'').split('\r\n').map(parseCSVLine),headers=rows[0];
 const value=(row,name)=>row[headers.indexOf(name)];
 check(downloadName==='CHEI_screen_county_county.csv','CSV uses the selected geographic scope');
 check(value(rows[1],'parcel_future_lu_mode_value')===specialCategory,'CSV preserves raw category text rather than HTML or numeric formatting');
 check(value(rows[1],'parcel_future_lu_mode_criterion_kind')==='category'&&value(rows[1],'SVI_criterion_kind')==='numeric','CSV identifies category and numeric criteria');
 check(value(rows[1],'parcel_future_lu_mode_selected_categories')===JSON.stringify([specialCategory]),'CSV records exact selected category labels as an array');
 check(value(rows[1],'parcel_future_lu_mode_numeric_cutoff')===''&&value(rows[1],'SVI_numeric_cutoff')==='0.8','CSV leaves category cutoffs blank and exports exact numeric cutoffs');
 check(value(rows[1],'parcel_future_lu_mode_period')===fields.parcel_future_lu_mode.period,'CSV keeps each source period');
 check(value(rows[3],'condition_count')===''&&value(rows[3],'meets_rule')===''&&value(rows[3],'parcel_future_lu_mode_condition_met')==='','Incomplete rows do not receive fabricated combined results');
 check(value(rows[3],'missing_indicator_ids')==='["land_use"]','CSV identifies the missing selected indicator');
 check(headers.includes('minimum_conditions_met')&&!headers.some(h=>h.includes('is_high')||h.includes('high_condition')),'CSV match columns apply to every criterion kind');
 vm.runInContext('generateCombinedReport();',context);
 check(reportHTML.includes('Category is Residential &lt;mixed&gt;')&&!reportHTML.includes('NaN'),'Printed report retains categorical conditions without numeric conversion');
 check(reportHTML.includes('Sources and representation notes')&&reportHTML.includes('fixed hotspot category'),'Printed report includes sources and engine interpretation warnings');
 check(reportHTML.includes('thead{display:table-header-group}')&&/table\{[^}]*break-inside:auto/.test(reportHTML),'Printed tables can span pages and repeat their headings');
 check(reportHTML.includes('Test &lt;area&gt;'),'Report escapes the selected place label');
 const wideSpecs=specs.concat([{id:'population',period:'2020'},{id:'households',period:'2020'},{id:'employment',period:'2020'},{id:'chei',period:'2020'}]);
 const wide=overlap.screen(source,{factors:wideSpecs,metadata,percentile:50,rule:'any'});assert(wide.ok,wide.error);
 context.testScreen=wide;state.factors=wideSpecs.map(f=>f.id);state.mapFactor='combined';
 vm.runInContext('activeCombination=testScreen;applyCombinedMap();',context);
 check(/<details id="combined-input-details" class="more-factors">/.test(nodes['combined-input-summary'].innerHTML),'Selections above six factors start with collapsed input cards');
 check(nodes['combined-input-summary'].innerHTML.includes('Review 7 selected inputs, periods, and conditions'),'Large selection disclosure names the number of inputs');
 check(context.lastChartRows.every(row=>row.value>0)&&context.lastChartRows.length<wide.countDistribution.length,'Large selection charts omit empty count classes');
 check(nodes['main-chart'].innerHTML.includes('Empty count classes omitted')&&models.legend_div.text.includes('Empty count classes omitted'),'Compact chart and legend disclose the omitted empty bins');
 nodes['combined-input-details']={open:true};
 vm.runInContext('refreshCombinedResults();',context);
 check(/<details id="combined-input-details" class="more-factors" open>/.test(nodes['combined-input-summary'].innerHTML),'An opened input disclosure stays open after a map refresh');
 vm.runInContext('wireCombinedControls();',context);
 nodes['factor-catalog'].events.change({target:{closest:()=>({dataset:{factor:'land_use'},checked:true})}});
 check(catalogCalls===1&&selectedCall.id==='land_use'&&selectedCall.checked,'Re-rendered factor checkboxes use delegated catalog handlers');
 const report={status:'passed',check_count:checks.length,checks,scope:'Focused mixed-category/numeric rendering, CSV, printable report and catalog delegation. Browser layout and Bokeh interactions require separate browser validation.'};
 fs.mkdirSync(path.join(root,'qa'),{recursive:true});fs.writeFileSync(path.join(root,'qa/combined_view_validation.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:'passed',check_count:checks.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
