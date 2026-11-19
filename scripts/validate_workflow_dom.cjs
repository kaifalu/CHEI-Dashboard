#!/usr/bin/env node
/* Native UI behavior tests using real application code and source attributes.
 * This is DOM/state validation, NOT browser/canvas or responsive visual QA.
 * Install jsdom separately: npm install --prefix <qa-dir> jsdom
 * Run: CHEI_JSDOM_PATH=<qa-dir>/node_modules/jsdom node scripts/validate_workflow_dom.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const {JSDOM, VirtualConsole} = require(process.env.CHEI_JSDOM_PATH || 'jsdom');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'qa', 'dom_workflow');
fs.mkdirSync(OUT, {recursive:true});
const checks=[], errors=[], calls=[], reports=[], downloads=[];
const check=(condition, name, evidence={})=>{assert(condition,name+' '+JSON.stringify(evidence));checks.push({name,...evidence});};
const text=(file)=>fs.readFileSync(path.join(ROOT,file),'utf8');
const sourceFiles=['index.html','web/guided.html','web/guided.js','web/factor_catalog.js','web/combined_view.js','web/overlap.js','data/expanded_indicator_fields.json'];
const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,file))).digest('hex')]));
const embedded=text('index.html');
const meta=JSON.parse(embedded.match(/<script id="guided-metadata" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const expanded=JSON.parse(text('data/expanded_indicator_fields.json'));
const FACTOR_IDS=['precipitation','svi','housing','population','chei','hotspot','pop_density','sf_tract','mf_tract','housing_density','housing_points','households','employment','land_use','pr_points','pr_kriging','pr_change'];
const html=text('web/guided.html').replace('<!--BOOT_DATA-->', '<script id="guided-metadata" type="application/json">'+JSON.stringify(meta).replaceAll('</','<\\/')+'</script>');
const vc=new VirtualConsole();
vc.on('jsdomError', e=>errors.push(String(e.stack||e)));
vc.on('error', (...e)=>errors.push(e.map(String).join(' ')));
const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://local-dashboard.invalid/',pretendToBeVisual:true,virtualConsole:vc});
const win=dom.window, doc=win.document;
win.scrollTo=()=>{};
win.HTMLElement.prototype.scrollIntoView=()=>{};
win.ResizeObserver=class{observe(){} disconnect(){}};
win.Blob=global.Blob;
win.URL.createObjectURL=blob=>{downloads.push({blob});return 'blob:local-test-'+downloads.length;};
win.URL.revokeObjectURL=()=>{};
const anchorClick=win.HTMLAnchorElement.prototype.click;
win.HTMLAnchorElement.prototype.click=function(){if(this.download){downloads[downloads.length-1].filename=this.download;return;}return anchorClick.call(this);};
win.open=()=>{const report={html:'',document:{open(){},write(s){report.html+=s;},close(){}}};reports.push(report);return report;};

function columns(file){
 const features=JSON.parse(text('data/'+file)).features;
 const keys=[...new Set(features.flatMap(f=>Object.keys(f.properties)))];
 const data=Object.fromEntries(keys.map(k=>[k,features.map(f=>f.properties[k]??null)]));
 data.xs=[];data.ys=[];
 for(const f of features){const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;data.xs.push(polys.map(p=>p.map(r=>r.map(v=>v[0]))));data.ys.push(polys.map(p=>p.map(r=>r.map(v=>v[1]))));}
 return data;
}
const tract=columns('tracts_web.geojson');
Object.assign(tract,expanded.columns);
const count=tract.GEOID.length;
tract.hazard_high=tract.pr_25.map(v=>Number(Math.round(v*1000)/1000>=203.603));
tract.growth_high=tract.hh_chg.map(v=>Number(v>=746));
tract.svi_high=tract.SVI.map(v=>Number(v>=.88386));
tract.hotspot_combo=tract.GEOID.map((_,i)=>{const h=tract.hazard_high[i],g=tract.growth_high[i],s=tract.svi_high[i];return h&&g&&s?'All three high':h&&g?'Hazard + growth':h&&s?'Hazard + SVI':g&&s?'Growth + SVI':h?'Hazard only':g?'Growth only':s?'SVI only':'None high';});
const valuesOriginal=JSON.parse(JSON.stringify(tract));
const models=new Map();
function model(name,data={}){const o={name,data,value:'',text:'',active:false,visible:false,change:{emit(){}},selected:{indices:[]},glyph:{fill_alpha:.82},nonselection_glyph:{fill_alpha:.82},setv(p){Object.assign(this,p);}};models.set(name,o);return o;}
for(const name of Object.values(meta.names))if(!models.has(name))model(name);
const M=k=>models.get(meta.names[k]||k);
M('tract_source').data=tract;
M('county_source').data=columns('county_web.geojson');
M('zipcode_source').data=columns('zipcodes_web.geojson');
M('precinct_source').data=columns('commissioner_precincts_web.geojson');
M('parcel_source').data=columns('parcels_web.geojson');
M('grid_source').data=columns('housing_grid.geojson');
M('opacity_slider').value=.82;
M('gmt_select').value='25';
M('point_status').text='Static source preview';
M('map_plot').x_range={setv(p){Object.assign(this,p);}};
M('map_plot').y_range={setv(p){Object.assign(this,p);}};
M('map_plot').renderers=[M('tract_renderer')];
M('basemap_renderer').visible=false;
for(const n of ['guided_scope_mask','guided_scope_boundary','guided_inspected_tract','guided_screen_matches'])model(n,{xs:[],ys:[]});
win.Bokeh={documents:[{get_model_by_name(n){if(!models.has(n))throw new Error('Unexpected model reference: '+n);return models.get(n);}}]};

function q(values,p){const a=values.filter(v=>typeof v==='number'&&Number.isFinite(v)).sort((a,b)=>a-b),pos=(a.length-1)*p,lo=Math.floor(pos),hi=Math.ceil(pos);return a[lo]+(a[hi]-a[lo])*(pos-lo);}
function expected(scope,fields,percentile,rule,minimum){
 const indices=meta.scope[scope[0]][scope[1]].tract;
 const cuts=Object.fromEntries(fields.map(f=>[f,q(valuesOriginal[f],percentile/100)]));
 const eligible=indices.filter(i=>fields.every(f=>Number.isFinite(valuesOriginal[f][i])));
 const required=rule==='all'?fields.length:rule==='any'?1:minimum;
 return {eligible,matched:eligible.filter(i=>fields.filter(f=>valuesOriginal[f][i]>=cuts[f]).length>=required),cuts};
}

/* Minimal Bokeh-facing bridge. The native guide and overlap calculations below
 * are production code. Canvas rendering, real model validation and tiles are
 * explicitly outside this harness; they require actual browser testing. */
win.CHEI={
 setLegendContext(ctx){win.__cheiLegendContext=ctx;},
 clearLegendFilter(){win.__cheiActiveLegendKey=null;if(win.__cheiLegendContext)win.__cheiLegendContext.matches=[];},
 selectLegend(key){const c=win.__cheiLegendContext;c.matches=win.__guidedScopeForContext(c).filter(i=>String(c.classes[i])===String(key));win.__cheiActiveLegendKey=key;M('legend_filter_status').text='<b>'+c.matches.length+' matching tracts</b><button>Clear highlight</button>';},
 updateLayer(){
  const layer=M('layer_select').value||'svi',info=meta.layers[layer];
  calls.push({layer,gmt:M('gmt_select').value});
  if(!info)throw new Error('Unknown layer '+layer);
  const source=layer.startsWith('parcel_')?M('parcel_source'):layer==='housing_density'?M('grid_source'):M('tract_source');
  const data=source.data;
  const field=['pr_tract','pr_kriging'].includes(layer)?'pr_'+M('gmt_select').value:info.field;
  const raw=data[field];
  if(!raw)throw new Error('No mocked source data for '+layer+'/'+field);
  let classes,labels={};
  if(info.kind.startsWith('cat_')){classes=raw.map(String);for(const c of [...new Set(classes)])labels[c]=c;}
  else{const cuts=[.2,.4,.6,.8].map(p=>q(raw,p));classes=raw.map(v=>cuts.filter(c=>v>=c).length);for(let i=0;i<5;i++)labels[i]='Class '+i;}
  M('legend_div').text=Object.keys(labels).map(k=>'<button class="legend-button" data-legend-key="'+k+'"><span></span><b>'+labels[k]+'</b><em>0</em></button>').join('');
  win.__cheiLegendContext={layerId:layer,source,geometry:'polygon',classes,labels,baseAlpha:.82};
 }
};
win.eval(text('web/overlap.js'));
win.eval(text('web/guided.js').replace('/*FACTOR_CATALOG*/',text('web/factor_catalog.js')).replace('/*COMBINED_VIEW*/',text('web/combined_view.js')));
const tick=ms=>new Promise(r=>setTimeout(r,ms));
const $=s=>{const el=doc.querySelector(s);assert(el,'Missing selector '+s);return el;};
const click=s=>{const el=$(s);assert(!el.disabled,'Disabled control '+s);el.click();};
const change=(s,value,type='change')=>{const el=$(s);el.value=value;el.dispatchEvent(new win.Event(type,{bubbles:true}));};
const setChecked=(id,wanted)=>{const el=$('[data-factor="'+id+'"]');if(el.checked!==wanted){assert(!el.disabled,'Cannot change disabled factor '+id);el.checked=wanted;el.dispatchEvent(new win.Event('change',{bubbles:true}));}};
function onePanel(){check([...doc.querySelectorAll('.step-panel')].filter(x=>!x.hidden).length===1,'One editable step open');}
function begin(location='county',code='all',climate='threshold',gmt='25'){
 win.GUIDE.gotoStep(0,false);click('[data-location="'+location+'"]');
 if(['zip','tract'].includes(location))change('#place-input',code,'input');
 if(location==='precinct')change('#precinct-input',code);
 click('#next-button');onePanel();click('[data-climate="'+climate+'"]');
 if(climate==='threshold')change('#warming-input',gmt);
 click('#next-button');onePanel();
}
function chooseFactors(ids){
 click('[data-view-mode="combine"]');
 click('#clear-factors');
 for(const id of ids)setChecked(id,true);
}
function combine({location='county',code='all',climate='threshold',gmt='25',factors=['precipitation','svi','housing','population'],rule='all',percentile=80,minimum=2,population='change'}={}){
 begin(location,code,climate,gmt);chooseFactors(factors);click('#next-button');onePanel();
 if(factors.includes('population'))change('#population-period',population);
 for(const id of ['households','employment'])if(factors.includes(id))change('#'+id+'-period','change');
 change('#combine-rule',rule);if(rule==='atleast')change('#minimum-count',String(minimum));change('#combined-percentile',String(percentile));
 click('#next-button');
 const r=win.GUIDE.getCombination();assert(r?.ok,'Combination should be available');
 const fields=factors.map(f=>f==='precipitation'?(climate==='compare'?'sens_pct':'pr_'+gmt):f==='population'?{2020:'hp_2020',2050:'hp_2050',change:'pop_chg'}[population]:{svi:'SVI',housing:'parcel_hu_change',households:'hh_chg',employment:'job_chg'}[f]);
 const exp=expected([location,code],fields,percentile,rule,minimum);
 check(JSON.stringify(r.matchedIndices)===JSON.stringify(exp.matched),'Exact source-based combination membership',{location,code,fields,percentile,rule,matches:r.matchedCount});
 check(r.eligibleCount===exp.eligible.length,'Valid-data denominator matches independent source calculation');
 check(!$('#results').hidden&&$('#setup-grid').hidden,'Only result screen open after applying');
 check(!$('#report-button').disabled,'Report enabled only after applied result');
 check(models.get('guided_screen_matches').data.xs.length===r.matchedCount,'Match outline receives all matching tract geometries');
 return r;
}
function single(indicator,climate='none',period='2020',gmt='25'){
 begin('zip','77007',climate,gmt);click('[data-view-mode="single"]');change('#indicator-input',indicator);click('#next-button');change('#period-input',period);click('#next-button');return win.GUIDE.getSnapshot();
}

/* This mapping is deliberately independent of CHEIOverlap.factor(). The DOM
 * scenarios below compare the selected source fields, category flags, full
 * scope membership and complete-case denominator with raw prepared values. */
const PERIOD_FIELDS={population:{2020:'hp_2020',2050:'hp_2050',change:'pop_chg'},households:{2020:'hh_2020',2050:'hh_2050',change:'hh_chg'},employment:{2020:'j_2020',2050:'j_2050',change:'job_chg'},chei:{2020:'CHEI_2020',2050:'CHEI_2050',change:'adapt_gap'},land_use:{2020:'parcel_current_lu_mode',2050:'parcel_future_lu_mode'}};
const DEFAULT_PERIODS={population:'2050',households:'change',employment:'change',chei:'2050',land_use:'2050'};
function independentSpecs(options){
 return options.factors.map(id=>{
  const period=options.periods?.[id]||DEFAULT_PERIODS[id],housing=options.housingTypes?.[id]||'combined';
  const fixed={svi:'SVI',housing:'parcel_hu_change',pop_density:'pop_den',sf_tract:'n_single_f',mf_tract:'n_multi_fa',hotspot:'hotspot_combo',pr_change:'sens_pct'};
  const field=PERIOD_FIELDS[id]?.[period]||fixed[id]||(id==='precipitation'?(options.climate==='compare'?'sens_pct':'pr_'+options.gmt):id==='pr_points'?'point_pr_'+options.gmt:id==='pr_kriging'?'pr_'+options.gmt:id==='housing_density'?{combined:'grid_total_median',single:'grid_sf_median',multi:'grid_mf_median'}[housing]:id==='housing_points'?{combined:'housing_total_records',single:'n_single_f',multi:'n_multi_fa'}[housing]:null);
  assert(field,'Independent expected field missing for '+id);
  const kind=['hotspot','land_use'].includes(id)?'category':'numeric';
  const allowed=options.categories?.[id]||({hotspot:['All three high'],land_use:['Residential']})[id];
  return {id,field,kind,allowed,cutoff:kind==='numeric'?q(valuesOriginal[field],options.percentile/100):null};
 });
}
function assertExpandedResult(r,options){
 const specs=independentSpecs(options),indices=meta.scope[options.location][options.code].tract;
 const needed=options.rule==='all'?specs.length:options.rule==='any'?1:options.minimum;
 const records=indices.map(i=>{
  const flags=specs.map(f=>{
   const v=valuesOriginal[f.field][i];
   return f.kind==='category'?(typeof v==='string'&&v.trim()?f.allowed.includes(v):null):(typeof v==='number'&&Number.isFinite(v)?v>=f.cutoff:null);
  });
  const eligible=flags.every(v=>v!==null),conditionCount=flags.filter(Boolean).length;
  return {i,flags,eligible,conditionCount,matched:eligible&&conditionCount>=needed};
 });
 const eligible=records.filter(x=>x.eligible),matched=records.filter(x=>x.matched);
 check(r.ok&&r.factorCount===specs.length,'Expanded combination accepts all selected compatible inputs',{factors:options.factors});
 check(JSON.stringify(r.thresholds.map(f=>f.field))===JSON.stringify(specs.map(f=>f.field)),'Expanded controls select the independently expected source fields',{fields:specs.map(f=>f.field)});
 check(JSON.stringify(r.matchedIndices)===JSON.stringify(matched.map(x=>x.i)),'Expanded numeric/category matches equal independent source calculation',{scope:options.location+'/'+options.code,rule:options.rule,matches:r.matchedCount});
 check(r.eligibleCount===eligible.length&&r.missingCount===records.length-eligible.length,'Expanded screen uses complete-case denominator for the selected scope',{eligible:r.eligibleCount,missing:r.missingCount});
 check(records.every((record,i)=>specs.every((f,j)=>r.rows[i].flags[f.id]===record.flags[j])),'Every scoped numeric/category condition flag matches source-based expectation');
 check(r.share===(eligible.length?matched.length/eligible.length:null),'Empty coverage and valid zero-match shares remain distinct');
 check(specs.every((f,i)=>f.kind==='category'?r.thresholds[i].cutoff===null:Math.abs(r.thresholds[i].cutoff-f.cutoff)<1e-10),'Numeric cutoffs and categorical absence of cutoffs are correct');
 return r;
}
function setCategories(id,selected){
 const inputs=Array.from(doc.querySelectorAll('[data-factor-category="'+id+'"]'));
 assert(inputs.length,'Category controls missing for '+id);
 for(const value of selected)assert(inputs.some(el=>el.value===value),'Category not offered: '+value);
 for(const el of inputs){const wanted=selected.includes(el.value);if(el.checked!==wanted){el.checked=wanted;el.dispatchEvent(new win.Event('change',{bubbles:true}));}}
}
function expandedCombine(input={}){
 const options={location:'county',code:'all',climate:'threshold',gmt:'25',factors:['svi','chei'],rule:'all',percentile:80,minimum:2,...input};
 begin(options.location,options.code,options.climate,options.gmt);chooseFactors(options.factors);click('#next-button');onePanel();
 for(const id of options.factors){
  if(PERIOD_FIELDS[id])change('#'+id+'-period',options.periods?.[id]||DEFAULT_PERIODS[id]);
  if(['housing_density','housing_points'].includes(id))change('#'+id+'-housing',options.housingTypes?.[id]||'combined');
 }
 for(const id of options.factors.filter(id=>['hotspot','land_use'].includes(id)))setCategories(id,options.categories?.[id]||({hotspot:['All three high'],land_use:['Residential']})[id]);
 change('#combine-rule',options.rule);if(options.rule==='atleast')change('#minimum-count',String(options.minimum));
 if(!$('#combined-percentile').disabled)change('#combined-percentile',String(options.percentile));
 click('#next-button');const r=win.GUIDE.getCombination();assert(r?.ok,'Expanded combination should be available');
 assertExpandedResult(r,options);return {r,options};
}
function parseCSV(source){
 const rows=[],text=source.replace(/^\uFEFF/,''),row=[];let cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row.splice(0));cell='';}
  else cell+=c;
 }
 row.push(cell);rows.push(row);
 const headers=rows.shift();return {headers,rows:rows.map(cells=>Object.fromEntries(headers.map((h,i)=>[h,cells[i]])))};
}
async function exportCurrent(){click('#download-screen');return parseCSV(await downloads.at(-1).blob.text());}
function reportCurrent(){click('#report-button');const html=reports.at(-1).html,report=new JSDOM(html);return {html,dom:report,document:report.window.document};}

async function checkLocalBasemap(){
 const localErrors=[],localVC=new VirtualConsole();localVC.on('jsdomError',e=>localErrors.push(String(e)));localVC.on('error',(...e)=>localErrors.push(e.map(String).join(' ')));
 const local=new JSDOM(html,{runScripts:'outside-only',url:'file:///CHEI/index.html',pretendToBeVisual:true,virtualConsole:localVC}),w=local.window;
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.ResizeObserver=class{observe(){} disconnect(){}};
 const localModels=new Map([...models].map(([name,source])=>[name,{...source,selected:{indices:[]},change:{emit(){}},setv(p){Object.assign(this,p);}}]));
 const lm=key=>localModels.get(meta.names[key]||key);lm('map_plot').renderers=[lm('tract_renderer')];lm('basemap_renderer').visible=false;
 w.Bokeh={documents:[{get_model_by_name(name){assert(localModels.has(name),'Unknown local-file model '+name);return localModels.get(name);}}]};
 w.CHEI={};
 w.eval(text('web/overlap.js'));w.eval(text('web/guided.js').replace('/*FACTOR_CATALOG*/',text('web/factor_catalog.js')).replace('/*COMBINED_VIEW*/',text('web/combined_view.js')));
 await tick(100);
 check(!!w.GUIDE,'Local-file native workflow boots without an online map');
 const select=w.document.getElementById('basemap-style');
 check(select.querySelector('option[value="streets"]').disabled,'Local-file street option is disabled');
 check(select.value==='embedded'&&!lm('basemap_renderer').visible&&!lm('map_plot').renderers.includes(lm('basemap_renderer')),'Local-file default has no attached tile renderer');
 select.value='streets';select.dispatchEvent(new w.Event('change',{bubbles:true}));
 check(select.value==='embedded'&&!lm('basemap_renderer').visible&&!lm('map_plot').renderers.includes(lm('basemap_renderer')),'Local-file guard rejects a programmatic online-street change');
 check(w.document.getElementById('street-attribution').hidden&&w.document.getElementById('basemap-help').textContent.includes('local HTML'),'Local-file map notice explains embedded operation');
 check(localErrors.length===0,'No local-file DOM initialization errors',{errors:localErrors});local.window.close();
}

async function main(){
 await tick(100);
 check(!!win.GUIDE,'Real native UI boots with documented model bridge');onePanel();
 check(meta.release==='Expanded indicators 3.1','Generated page carries the expanded release identity');
 check(meta.expanded?.metadata?.indicator_family_count===17&&meta.expanded.metadata.covered_layer_count===26,'Generated page declares 17 families covering 26 original layer keys');
 check(JSON.stringify(meta.expanded.metadata.fields)===JSON.stringify(expanded.metadata.fields),'Generated metadata agrees with the prepared expanded-field definitions');
 check(Boolean(meta.names.basemap_renderer),'Generated bridge exposes the optional basemap renderer');
 check($('#basemap-style').value==='embedded'&&!M('basemap_renderer').visible&&!M('map_plot').renderers.includes(M('basemap_renderer')),'Hosted native workflow starts with no attached tile renderer');
 check(!$('#basemap-style option[value="streets"]').disabled&&$('#street-attribution').hidden,'Hosted streets are available only as an unselected optional background');
 check($('#next-button').disabled,'Location required before advancing');
 click('[data-location="zip"]');change('#place-input','99999','input');check($('#next-button').disabled,'Invalid ZIP rejected');change('#place-input','77007','input');check(!$('#next-button').disabled,'Known ZIP accepted');click('#next-button');
 check([...doc.querySelectorAll('[data-climate]')].map(x=>x.dataset.climate).sort().join(',')==='compare,none,threshold','Climate step is precipitation-specific');
 click('[data-climate="threshold"]');click('#next-button');chooseFactors(['precipitation']);check($('#next-button').disabled,'Combination requires at least two factors');

 const core=combine();
 for(const f of ['precipitation','svi','housing','population','combined']){
  click('[data-map-factor="'+f+'"]');
  check(JSON.stringify(win.GUIDE.getCombination().matchedIndices)===JSON.stringify(core.matchedIndices),'Map tab preserves combination results',{factor:f});
  check(win.__cheiLegendContext.mapFactor===f,'Map tab updates map context',{factor:f});
 }
 const key=doc.querySelector('#legend-content button:not(:disabled)').dataset.legendKey;
 click('#legend-content button[data-legend-key="'+key+'"]');
 check(win.__cheiLegendContext.matches.every(i=>meta.scope.county.all.tract.includes(i)),'Legend membership remains in selected scope');
 win.GUIDE.clearLegend();
 change('#result-table-filter','all');check(doc.querySelectorAll('#combined-results-table tbody tr').length===1115,'Table can show all selected tracts');
 change('#result-table-filter','matched');check(doc.querySelectorAll('#combined-results-table tbody tr').length===core.matchedCount,'Table filters matching tracts');
 click('#download-screen');check(downloads.length===1&&downloads[0].filename==='CHEI_screen_county_all.csv','CSV download requested with selected geography');
 const csv=await downloads[0].blob.text();
 check(csv.includes('pr_25_numeric_cutoff')&&csv.includes('SVI_period')&&csv.includes('parcel_hu_change_value'),'CSV preserves exact value, unit, period and cutoff columns');
 check(csv.split(/\r?\n/).length===1116,'CSV includes every selected tract irrespective of table filter');
 click('#report-button');check(reports.length===1&&reports[0].html.includes('Inputs, periods, and selected conditions'),'Combination brief includes every input and condition');
 const reportDom=new JSDOM(reports[0].html);
 check(reportDom.window.document.querySelectorAll('tbody tr').length===4,'Combination brief contains four selected inputs');reportDom.window.close();

 combine({rule:'any'});combine({rule:'atleast',minimum:2});
 for(const gmt of ['15','20','25','30'])combine({gmt,factors:['precipitation','svi'],percentile:90});
 combine({climate:'compare',factors:['precipitation','svi','housing']});
 for(const population of ['2020','2050','change'])combine({climate:'none',factors:['svi','population'],population});
 for(const [location,code]of [['zip','77007'],['precinct','1'],['precinct','4'],['tract','48201342001']])combine({location,code});
 combine({factors:['precipitation','svi','housing','population','households','employment'],rule:'atleast',minimum:3});
 const zero=combine({location:'tract',code:'48201342001',factors:['precipitation','svi'],percentile:95});
 check(zero.matchedCount===0,'Zero-match source case reached');
 check($('#findings').textContent.includes('does not mean no exposure'),'Zero matches are not labeled no exposure');
 check(!!doc.querySelector('#adjust-overlap-rule'),'Zero-match results offer explicit adjustment');
 click('#adjust-overlap-rule');check(win.GUIDE.getState().step===3,'Adjustment opens periods and rules without silently changing rule');

 combine({location:'zip',code:'77007'});
 change('#result-table-filter','all');const inspect=$('#combined-results-table [data-inspect-tract]');const inspected=Number(inspect.dataset.inspectTract);inspect.click();
 check(win.GUIDE.getState().location==='zip'&&!$('#tract-inspection').hidden,'Table inspection keeps selected ZIP');
 check($('#inspection-content').textContent.includes('Meets overlap rule'),'Tract inspection includes all input flags and rule');
 click('#use-inspected-tract');check(win.GUIDE.getState().location==='tract'&&win.GUIDE.getState().code===String(tract.GEOID[inspected]),'Tract adoption explicitly updates location');
 check(win.GUIDE.getCombination().scopeCount===1,'Adopted tract has one-tract result scope');

 combine();win.GUIDE.gotoStep(1,false);change('#warming-input','30');
 check($('#report-button').disabled&&win.GUIDE.getSnapshot()===null,'Changing warming invalidates old report and result snapshot');
 check([...doc.querySelectorAll('.steps button')].slice(2).every(b=>b.disabled),'Changing warming locks downstream steps until reviewed');
 click('[data-climate="none"]');click('#next-button');
 check($('[data-factor="precipitation"]').disabled&&!$('[data-factor="precipitation"]').checked,'No precipitation removes and disables precipitation input');
 check(win.GUIDE.getState().factors.includes('svi'),'Compatible nonclimate factors persist');

 let s=single('population','threshold','comparison','30');
 check(s.field==='pop_chg'&&s.comparison[0].n===23,'Population keeps demographic comparison after selecting a warming condition');
 check($('#chart-title').textContent.includes('2020 and 2050')&&!$('#main-chart').textContent.includes('GMT'),'Population chart is not replaced by climate chart');
 check($('#result-context').textContent.includes('Precipitation not used'),'Unused climate selection is explained for single-layer population');
 s=single('svi','none','2020');check(s.field==='SVI','SVI retains baseline field');
 s=single('chei','threshold','2050','15');check(s.field==='CHEI_2050','CHEI retains supplied source field');
 check($('#result-context').textContent.includes('not recalculated'),'CHEI climate assumptions clearly remain supplied');
 s=single('hotspot','none','hotspot_2050');check(Object.keys(s.counts).length>1,'Fixed hotspot categories remain available');
 s=single('pr_change','compare','warming_comparison');check(s.field==='sens_pct','Warming comparison keeps supplied percentage-change field');
 check($('#main-chart').textContent.includes('+1.5')&&$('#main-chart').textContent.includes('+2.5'),'Warming comparison shows its two underlying conditions');
 s=single('pr_tract','threshold','profile','20');check(s.field==='pr_20','Single precipitation view uses chosen warming field');
 check($('#main-chart').textContent.includes('+3.0'),'Four-condition chart remains available');

 // Catalogue, prerequisites, progressive disclosure, and hidden selections.
 begin('county','all','threshold','25');chooseFactors(['svi','sf_tract','employment']);
 check(JSON.stringify(Array.from(doc.querySelectorAll('[data-factor]'),el=>el.dataset.factor))===JSON.stringify(FACTOR_IDS),'Catalogue exposes all 17 families in grouped order');
 check(Array.from(doc.querySelectorAll('[data-factor]')).every(el=>!el.disabled),'Single warming condition enables every catalogue family');
 check(doc.querySelectorAll('[data-factor-group]').length===5,'Catalogue is organized into five topic groups');
 change('#factor-search','precipitation','input');
 const visibleCards=Array.from(doc.querySelectorAll('.factor-card')).filter(el=>!el.hidden);
 check(visibleCards.length>0&&visibleCards.length<17&&visibleCards.every(el=>el.textContent.toLowerCase().includes('precipitation')),'Search shows matching indicator cards');
 check($('[data-factor="svi"]').checked&&$('[data-factor="svi"]').closest('label').hidden&&win.GUIDE.getState().factors.includes('svi'),'Search retains a checked indicator hidden by the query');
 check(doc.querySelectorAll('[data-remove-factor]').length===3,'Selected chips retain inputs across filtered groups');
 click('[data-remove-factor="employment"]');check(!win.GUIDE.getState().factors.includes('employment')&&!$('[data-factor="employment"]').checked,'A hidden selected input can be removed with its chip');
 change('#factor-search','zz-no-matching-indicator','input');check($('#factor-catalog').textContent.includes('No indicators match'),'Unmatched catalogue search explains its empty result');
 click('#expand-factor-groups');
 check($('#factor-search').value===''&&Array.from(doc.querySelectorAll('.factor-card')).every(el=>!el.hidden),'Show all indicators clears the active search');
 check(Array.from(doc.querySelectorAll('[data-factor-group]')).every(el=>el.open&&!el.hidden),'Show all indicators opens every topic group');
 click('#collapse-factor-groups');check(Array.from(doc.querySelectorAll('[data-factor-group]')).every(el=>!el.open),'Collapse groups hides choices without clearing selected state');
 check(win.GUIDE.getState().factors.join(',')==='svi,sf_tract','Collapsing groups preserves selected inputs');
 click('#clear-factors');check(win.GUIDE.getState().factors.length===0&&$('#next-button').disabled,'Clear selections resets the catalogue and blocks an empty combination');
 for(const climate of ['compare','none']){
  begin('county','all',climate);
  for(const id of FACTOR_IDS){const unavailable=['pr_points','pr_kriging'].includes(id)||(id==='precipitation'&&climate==='none');check($('[data-factor="'+id+'"]').disabled===unavailable,'Catalogue prerequisite matches the precipitation path',{climate,id,unavailable});}
 }

 // Exact source aliases cannot enter a completed screen twice.
 begin('county','all','threshold','25');chooseFactors(['precipitation','pr_kriging','svi']);
 check($('#next-button').disabled&&$('#factor-selection-status').textContent.includes('same underlying'),'Tract and surface precipitation aliases are rejected in indicator selection');
 setChecked('precipitation',false);check(!$('#next-button').disabled,'Removing an exact precipitation alias restores continuation');
 expandedCombine({factors:['pr_kriging','svi'],gmt:'20'});
 begin('county','all','compare');chooseFactors(['precipitation','pr_change','svi']);
 check($('#next-button').disabled&&$('#factor-selection-status').textContent.includes('same underlying'),'Duplicate warming-change aliases are rejected');
 const fixedChange=expandedCombine({climate:'none',factors:['pr_change','svi']});
 check(fixedChange.r.thresholds[0].field==='sens_pct'&&$('#result-context').textContent.includes('+2.5°C'),'Dedicated fixed precipitation comparison works independently of Step 2');

 // Numeric families keep their own periods and housing types.
 for(const period of ['2020','2050','change']){
  const selected=expandedCombine({climate:'none',factors:['svi','chei','households','employment'],periods:{chei:period,households:period,employment:period},rule:'any'});
  check(selected.r.thresholds.slice(1).every(f=>f.period.includes(period==='change'?'2050':period)),'CHEI, household, and employment references follow per-input periods',{period});
 }
 for(const housing of ['single','multi','combined']){
  expandedCombine({climate:'none',factors:['svi','housing_density','housing_points'],housingTypes:{housing_density:housing,housing_points:housing},rule:'any'});
  check($('#reference-content').textContent.includes('whole')&&$('#reference-content').textContent.includes('sampled'),'Grid and housing-location notes retain full-cell and complete-count support',{housing});
 }
 // A configurable duplicate must allow users to reach the type control, while
 // Step 4 must prevent applying it until they select a non-duplicate field.
 begin('county','all','none');chooseFactors(['svi','sf_tract','housing_points']);click('#next-button');
 change('#housing_points-housing','single');
 check($('#next-button').disabled&&$('#cutoff-preview').textContent.includes('same source field'),'Housing-type change blocks duplicate source fields at the result gate');
 click('#back-button');
 check(!$('#next-button').disabled&&$('#factor-selection-status').textContent.includes('same measure')&&$('#factor-selection-status').textContent.includes('Step 4'),'Configurable housing alias keeps its Step 4 resolution reachable',{message:$('#factor-selection-status').textContent});
 click('#next-button');change('#housing_points-housing','multi');check(!$('#next-button').disabled,'Choosing a distinct housing type resolves the duplicate');
 click('#next-button');assertExpandedResult(win.GUIDE.getCombination(),{location:'county',code:'all',climate:'none',gmt:'25',factors:['svi','sf_tract','housing_points'],housingTypes:{housing_points:'multi'},rule:win.GUIDE.getState().rule,minimum:win.GUIDE.getState().minCount,percentile:win.GUIDE.getState().percentile});
 // Restore the default before a broad screen includes both SF and MF records.
 expandedCombine({climate:'none',factors:['svi','housing_points'],housingTypes:{housing_points:'combined'}});

 // Named categories, period-dependent choices, and empty-selection feedback.
 begin('county','all','none');chooseFactors(['hotspot','land_use']);click('#next-button');
 check($('#numeric-rule-field').hidden&&$('#combined-percentile').disabled,'Category-only combinations hide numeric percentile controls');
 check(doc.querySelectorAll('[data-factor-category="hotspot"]').length===8,'All eight fixed hotspot names are available');
 setCategories('hotspot',[]);
 check($('#next-button').disabled&&$('#cutoff-preview').textContent.includes('at least one category'),'Empty hotspot category set blocks results with an explanation');
 setCategories('hotspot',['None high']);
 change('#land_use-period','2020');
 check(JSON.stringify(Array.from(doc.querySelectorAll('[data-factor-category="land_use"]'),el=>el.value))===JSON.stringify(expanded.metadata.fields.parcel_current_lu_mode.categories),'Current land-use choices match source category names');
 setCategories('land_use',['Commercial']);change('#land_use-period','2050');
 check(Array.from(doc.querySelectorAll('[data-factor-category="land_use"]')).every(el=>!el.checked),'Changing land-use period removes unsupported previous categories');
 check($('#next-button').disabled&&$('#cutoff-preview').textContent.includes('at least one category'),'Period change requires a valid new category instead of silently substituting one');
 check(JSON.stringify(Array.from(doc.querySelectorAll('[data-factor-category="land_use"]'),el=>el.value))===JSON.stringify(expanded.metadata.fields.parcel_future_lu_mode.categories),'Future land-use options remain limited to supplied names');
 setCategories('land_use',['Residential']);check(!$('#next-button').disabled,'A supported named category restores continuation');
 const categorical=expandedCombine({climate:'none',factors:['hotspot','land_use'],categories:{hotspot:['None high','Hazard only'],land_use:['Residential','Commercial']},periods:{land_use:'2020'},rule:'all'});
 check(categorical.r.numericFactorCount===0&&categorical.r.categoryFactorCount===2,'A category-only screen uses membership conditions without numeric factors');
 check(categorical.r.rows.some(row=>row.values.hotspot==='None high'&&row.flags.hotspot===true),'A valid None high hotspot category can meet an explicit named condition');
 const categoryCSV=await exportCurrent();
 check(categoryCSV.rows.every(row=>row.numeric_percentile===''&&row.hotspot_combo_numeric_cutoff===''&&row.parcel_current_lu_mode_numeric_percentile===''),'Category-only CSV does not invent numeric cutoffs or percentiles');
 check(categoryCSV.rows.every(row=>row.hotspot_combo_criterion_kind==='category'&&row.hotspot_combo_criterion_method==='category'),'CSV identifies categorical criterion types and methods');
 check(JSON.parse(categoryCSV.rows[0].hotspot_combo_selected_categories).join('|')==='None high|Hazard only','CSV preserves all selected hotspot category names');
 const categoryReport=reportCurrent();
 check(categoryReport.document.querySelectorAll('tbody tr').length===2&&categoryReport.document.body.textContent.includes('Selected category conditions'),'Category-only brief retains its two named conditions');
 check(!Array.from(categoryReport.document.querySelectorAll('tbody td')).some(el=>el.textContent.includes('High at')),'Category brief does not label categories as numeric high values');categoryReport.dom.window.close();

 // More than six factors, related inputs, compact views, and complete exports.
 const wideOptions={factors:FACTOR_IDS.filter(id=>id!=='pr_kriging'),rule:'atleast',minimum:3,percentile:75,categories:{hotspot:['All three high','Hazard + SVI','None high'],land_use:['Residential','Multiple']}};
 const wide=expandedCombine(wideOptions);
 check(wide.r.factorCount===16&&wide.r.categoryFactorCount===2,'Sixteen compatible families combine beyond the earlier six-input limit');
 check($('#combined-input-details')&&!$('#combined-input-details').open&&$('#combined-input-details').textContent.includes('16'),'Large combinations present input details in a compact expandable section');
 check(doc.querySelectorAll('[data-map-factor]').length===17,'Large screen offers every selected input map plus the combined map');
 check($('#main-chart').textContent.includes('Empty count classes omitted'),'Large-screen chart omits empty condition-count classes');
 check(wide.r.warnings.some(w=>w.includes('related precipitation'))&&wide.r.warnings.some(w=>w.includes('housing-stock'))&&wide.r.warnings.some(w=>w.includes('CHEI')),'Related precipitation, housing, and composite inputs carry interpretation warnings');
 check($('#combined-input-summary').textContent.includes('independent evidence'),'Dependence warning is visible with the input summary');
 change('#result-table-filter','matched');
 const wideCSV=await exportCurrent();
 check(wideCSV.rows.length===count,'Large-combination CSV preserves all selected tracts despite the table filter');
 check(wide.r.thresholds.every(f=>wideCSV.headers.includes(f.field+'_criterion_kind')&&wideCSV.headers.includes(f.field+'_condition_met')),'CSV includes every selected input and its criterion metadata');
 check(wideCSV.rows.some(row=>row.complete_selected_data==='false'&&row.condition_count===''&&row.meets_rule===''),'Incomplete CSV rows retain missing combination results rather than false zero scores');
 check(wideCSV.rows.every(row=>row.parcel_future_lu_mode_numeric_cutoff===''&&JSON.parse(row.parcel_future_lu_mode_selected_categories).sort().join('|')==='Multiple|Residential'),'Mixed CSV preserves named categories without a numeric category cutoff');
 const wideReport=reportCurrent();
 check(wideReport.document.querySelectorAll('tbody tr').length===16,'Screening brief retains every input when more than six are selected');
 check(wide.r.thresholds.every(f=>wideReport.document.body.textContent.includes(f.field)),'Large brief retains all underlying source field identities');
 check(wideReport.document.body.textContent.includes('related precipitation')&&wideReport.html.includes('display:table-header-group'),'Large brief carries dependency notes and supports repeated print table headers');
 check($('#report-status').textContent.includes('continue across pages')&&$('#report-button').textContent==='Print screening brief','Print action describes a screening brief without promising one page');wideReport.dom.window.close();

 // Model-point missingness, legitimate numeric zeros, and all three rules.
 for(const rule of ['all','any','atleast'])expandedCombine({factors:['pr_points','svi','land_use'],rule,minimum:2});
 const missingIndex=valuesOriginal.point_pr_25.findIndex((v,i)=>v===null&&Number.isFinite(valuesOriginal.SVI[i]));
 const missing=expandedCombine({location:'tract',code:String(tract.GEOID[missingIndex]),factors:['pr_points','svi'],rule:'any'});
 check(missing.r.eligibleCount===0&&missing.r.missingCount===1&&missing.r.share===null,'No model point remains missing even under the Any rule');
 check($('#findings').textContent.includes('cannot be evaluated')&&$('#summary-metrics').textContent.includes('No valid data'),'Zero complete records have an explicit unavailable-result explanation');
 const zeroRecordIndex=valuesOriginal.n_multi_fa.findIndex((v,i)=>v===0&&Number.isFinite(valuesOriginal.SVI[i]));
 const zeroRecords=expandedCombine({location:'tract',code:String(tract.GEOID[zeroRecordIndex]),climate:'none',factors:['mf_tract','svi'],rule:'any'});
 check(zeroRecords.r.eligibleCount===1&&zeroRecords.r.rows[0].values.mf_tract===0&&zeroRecords.r.rows[0].flags.mf_tract!==null,'A valid zero housing-record count remains an evaluated value');

 // Input tabs, legend highlights, CSVs and reports preserve a ZIP screen.
 const scoped=expandedCombine({location:'zip',code:'77007',factors:['precipitation','svi','land_use','housing_density'],categories:{land_use:['Residential','Multiple']},rule:'any'});
 const scopedMatches=JSON.stringify(scoped.r.matchedIndices),scopedSummary=$('#summary-metrics').textContent;
 for(const id of ['land_use','housing_density','combined']){
  click('[data-map-factor="'+id+'"]');
  check(JSON.stringify(win.GUIDE.getCombination().matchedIndices)===scopedMatches&&$('#summary-metrics').textContent===scopedSummary,'Mixed input tab preserves combined matches and summary',{id});
  check(win.GUIDE.getState().location==='zip'&&win.GUIDE.getState().code==='77007','Input tab keeps the selected ZIP',{id});
 }
 const scopedLegend=doc.querySelector('#legend-content button:not(:disabled)');
 scopedLegend.click();
 check(win.__cheiLegendContext.matches.every(i=>meta.scope.zip['77007'].tract.includes(i)),'Mixed legend highlight stays within the chosen ZIP');
 check(JSON.stringify(win.GUIDE.getCombination().matchedIndices)===scopedMatches,'Legend highlight does not recalculate combination membership');
 const scopedCSV=await exportCurrent();
 check(scopedCSV.rows.length===meta.scope.zip['77007'].tract.length&&scopedCSV.rows.every(row=>row.location_type==='zip'&&row.location_id==='77007'),'CSV scope stays at the selected ZIP after map and legend changes');
 const scopedReport=reportCurrent();
 check(scopedReport.document.querySelector('h1').textContent==='ZIP 77007'&&scopedReport.document.querySelectorAll('tbody tr').length===4,'Screening brief retains selected ZIP and all inputs after highlighting');scopedReport.dom.window.close();
 win.GUIDE.clearLegend();

 // Native control wiring for optional tiles; no real tile requests are made by
 // this mock. validate_basemap.py separately inspects actual serialized models.
 const screenBeforeBasemap=JSON.stringify(win.GUIDE.getCombination().matchedIndices),baseRenderers=M('map_plot').renderers.slice();
 change('#basemap-style','streets');
 check(M('basemap_renderer').visible&&M('map_plot').renderers[0]===M('basemap_renderer'),'Explicit hosted street selection attaches the optional renderer as an underlay');
 check(!$('#street-attribution').hidden&&$('#street-attribution a').href==='https://www.openstreetmap.org/copyright','Online street choice exposes linked OpenStreetMap attribution');
 change('#basemap-style','streets');check(M('map_plot').renderers.filter(r=>r===M('basemap_renderer')).length===1,'Repeated street selection does not attach duplicate renderers');
 change('#basemap-style','embedded');
 check(!M('basemap_renderer').visible&&JSON.stringify(M('map_plot').renderers.map(r=>r.name))===JSON.stringify(baseRenderers.map(r=>r.name)),'Returning to embedded boundaries detaches the tile renderer and retains analytical renderers');
 check($('#street-attribution').hidden&&JSON.stringify(win.GUIDE.getCombination().matchedIndices)===screenBeforeBasemap,'Background changes retain the selected analytical screen');
 await checkLocalBasemap();

 click('#restart-button');check(win.GUIDE.getState().step===0&&win.GUIDE.getState().factors.length===0,'Restart clears workflow state');onePanel();
 for(const page of ['methods','terms','help','explorer']){click('.top-nav [data-page="'+page+'"]');check(!$('#page-'+page).hidden,'Navigation opens requested page',{page});}
 await tick(150);
 check(errors.length===0,'No native application DOM execution errors',{errors});
 const coreFields=['pr_15','pr_20','pr_25','pr_30','SVI','parcel_hu_change','hp_2020','hp_2050','pop_chg','hh_chg','job_chg','CHEI_2020','CHEI_2050',...Object.keys(expanded.columns)];
 check(coreFields.every(f=>JSON.stringify(tract[f])===JSON.stringify(valuesOriginal[f])),'All tested native workflows preserve source analytical arrays');
 return {release:meta.release,status:'passed',check_count:checks.length,checks,engine_calls:calls.length,errors,source_sha256:sourceHashes,limitations:['Uses jsdom with a documented Bokeh-facing bridge mock, not a graphical browser.','No canvas/tile rendering, CSS geometry, actual Bokeh model validation, print pagination or responsive visual claims.','Source JavaScript is evaluated with the generated page metadata; this does not prove that every final HTML byte is identical to the tested source.'],source:'Production web/guided.js, web/factor_catalog.js, web/combined_view.js, web/overlap.js, original GeoJSON data, and expanded_indicator_fields.json'};
}
main().then(result=>{fs.writeFileSync(path.join(OUT,'validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,check_count:result.check_count,report:path.join(OUT,'validation.json')}));dom.window.close();}).catch(err=>{const result={status:'failed',check_count:checks.length,checks,errors,error:String(err.stack||err),limitations:['DOM/state test with Bokeh bridge mock; no graphical browser claims.']};fs.writeFileSync(path.join(OUT,'validation.json'),JSON.stringify(result,null,2));console.error(err.stack||err);dom.window.close();process.exitCode=1;});
