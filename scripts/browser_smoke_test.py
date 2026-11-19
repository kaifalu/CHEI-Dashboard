#!/usr/bin/env python3
"""Reproducible Chromium interaction tests; Playwright is an optional QA dependency."""
from pathlib import Path
import json,time,os,shutil,argparse,math
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description="Exercise guided dashboard paths using embedded assets with external requests blocked.")
parser.add_argument('--output-dir',type=Path,default=ROOT/'qa'/'browser')
opts=parser.parse_args()
OUT=opts.output_dir;OUT.mkdir(parents=True,exist_ok=True)
executable=os.environ.get('CHEI_CHROMIUM_PATH') or shutil.which('chromium')
launch_kwargs={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
if executable:launch_kwargs['executable_path']=executable
results=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(**launch_kwargs)
 ctx=b.new_context(viewport={'width':1440,'height':1050})
 p=ctx.new_page();errors=[];requests=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.on('request',lambda r:requests.append(r.url))
 p.route('https://**',lambda r:r.abort())
 p.set_content((ROOT/'index.html').read_text(),wait_until='load',timeout=60000)
 p.wait_for_function('!!window.GUIDE',timeout=30000)
 p.screenshot(path=str(OUT/'01_start.png'),full_page=True)
 assert p.locator('.step-panel:visible').count()==1
 assert p.locator('#next-button').is_disabled()
 # Invalid ZIP, then valid ZIP; context and period options.
 p.locator('[data-location="zip"]').click();p.locator('#place-input').fill('99999');assert p.locator('#next-button').is_disabled()
 p.locator('#place-input').fill('77007');assert p.locator('#next-button').is_enabled();p.locator('#next-button').click()
 p.locator('[data-climate="threshold"]').click();p.locator('#warming-input').select_option('20')
 p.screenshot(path=str(OUT/'02_climate.png'),full_page=True)
 p.locator('#next-button').click();opts=p.locator('#indicator-input option').evaluate_all('(els)=>els.map(e=>e.value)');assert set(opts)=={'','pr_tract','pr_points','pr_kriging'}
 p.locator('#indicator-input').select_option('pr_tract');p.locator('#next-button').click()
 assert '2050' not in p.locator('#period-input').inner_text();p.locator('#period-input').select_option('profile');p.locator('#next-button').click();p.wait_for_timeout(500)
 assert p.evaluate('GUIDE.getSnapshot().field')=='pr_20'
 assert p.evaluate('GUIDE.getSnapshot().indices.length')==23
 p.screenshot(path=str(OUT/'03_precipitation_results.png'),full_page=True)
 # scoped legend and matching count, inspection preserves ZIP
 key=p.locator('#legend-content button:enabled').first.get_attribute('data-legend-key');p.locator('#legend-content button:enabled').first.click()
 assert p.evaluate('window.__cheiLegendContext.matches.every(i=>GUIDE.getScope().includes(i))')
 n=p.evaluate('window.__cheiLegendContext.matches.length');assert n>0
 p.evaluate('GUIDE.clearLegend()')
 p.evaluate("Bokeh.documents[0].get_model_by_name('tract_source').selected.indices=[GUIDE.getScope()[0]]")
 p.wait_for_timeout(150);assert p.locator('#tract-inspection').is_visible();assert p.evaluate('GUIDE.getState().location')=='zip'
 p.locator('#close-inspection').click()
 results.append({'scenario':'ZIP 77007 / +2.0°C / tract precipitation profile','features':23,'scoped_legend_matches':n})
 def start(loc,code,climate,indicator,period=None,gmt='25',housing=None):
  p.evaluate('GUIDE.gotoStep(0,false)');p.locator(f'[data-location="{loc}"]').click()
  if loc in ['zip','tract']:p.locator('#place-input').fill(code)
  if loc=='precinct':p.locator('#precinct-input').select_option(code)
  p.locator('#next-button').click();p.locator(f'[data-climate="{climate}"]').click()
  if climate=='threshold':p.locator('#warming-input').select_option(gmt)
  p.locator('#next-button').click();p.locator('#indicator-input').select_option(indicator)
  p.locator('#next-button').click()
  if period:p.locator('#period-input').select_option(period)
  if housing:p.locator('#display-input').select_option(housing)
  assert p.locator('#next-button').is_enabled(),(loc,indicator,period)
  p.locator('#next-button').click();p.wait_for_timeout(300)
  p.wait_for_function('GUIDE.getSnapshot()!==null')
  snap=p.evaluate('s=GUIDE.getSnapshot();({field:s.field,n:s.indices.length,median:s.stats.median,categorical:s.categorical,counts:s.counts,unit:s.unit,levelUnit:s.levelUnit})')
  results.append({'scenario':f'{loc} {code}/{climate}/{indicator}/{period}',**snap})
  assert p.locator('.step-panel:visible').count()==0
  assert p.locator('#results').is_visible()
  return snap
 # Compound patterns and reports.
 snap=start('county','all','composite','hotspot')
 assert snap['counts']['All three high']==5
 assert p.locator('#legend-content button').count()==8
 p.locator('#legend-content [data-legend-key="All three high"]').click();assert p.evaluate('window.__cheiLegendContext.matches.length')==5
 p.screenshot(path=str(OUT/'04_hotspots.png'),full_page=True)
 with ctx.expect_page() as info:p.locator('#report-button').click()
 report=info.value;report.wait_for_load_state();report.pdf(path=str(OUT/'hotspot_brief.pdf'),print_background=True,prefer_css_page_size=True);report.screenshot(path=str(OUT/'hotspot_brief.png'),full_page=True);report.close()
 # Regional summaries and baseline data.
 snap=start('precinct','2','community','population','comparison')
 assert snap['n']>100
 p.screenshot(path=str(OUT/'05_precinct_comparison.png'),full_page=True)
 with ctx.expect_page() as info:p.locator('#report-button').click()
 report=info.value;report.wait_for_load_state();report.pdf(path=str(OUT/'precinct_population_brief.pdf'),print_background=True,prefer_css_page_size=True);report.close()
 snap=start('tract','48201342001','community','population','2020');assert snap['field']=='hp_2020';assert snap['n']==1
 # Other topic/representation paths.
 cases=[
 ('zip','77007','composite','chei','comparison','25',None),
 ('precinct','3','community','svi',None,'25',None),
 ('zip','77007','community','households','2050','25',None),
 ('zip','77007','community','employment','2020','25',None),
 ('zip','77007','community','sf_tract',None,'25',None),
 ('zip','77007','community','mf_tract',None,'25',None),
 ('zip','77007','community','housing_density',None,'25','multi'),
 ('zip','77007','community','housing_points',None,'25','combined'),
 ('zip','77007','community','parcel_hu_change',None,'25',None),
 ('zip','77007','community','land_use','comparison','25',None),
 ('zip','77007','community','pop_density',None,'25',None),
 ('zip','77007','threshold','pr_kriging','threshold','30',None),
 ('zip','77007','threshold','pr_points','profile','15',None),
 ('tract','48201342001','threshold','pr_points','threshold','20',None),
 ('zip','77007','compare','pr_change',None,'25',None),
 ('precinct','1','composite','overlap',None,'25',None),
 ]
 for case in cases:
  snap=start(*case)
  if case[3]=='housing_points': assert snap['n']<41572
  if case[3]=='pr_kriging': assert snap['field']=='pr_30'
  if case[3]=='chei': assert snap['levelUnit']=='index'
  if case[3]=='svi': assert p.evaluate('GUIDE.getState().period')=='2020'
 # Boundary toggles & responsive views.
 p.locator('.map-display summary').click();p.locator('#show-zips').check();p.locator('#show-precincts').check()
 assert p.evaluate("Bokeh.documents[0].get_model_by_name(GUIDE.DATA.names.all_zip_renderer).visible")
 assert p.evaluate("Bokeh.documents[0].get_model_by_name(GUIDE.DATA.names.all_precinct_renderer).visible")
 for section in ['methods','terms','help']:
  p.locator(f'.top-nav [data-page="{section}"]').click();assert p.locator(f'#page-{section}').is_visible();p.screenshot(path=str(OUT/f'{section}.png'),full_page=True)
  assert p.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'),section
 p.locator('.top-nav [data-page="explorer"]').click()
 for width,height in [(1920,1080),(1024,768),(768,1024),(390,844)]:
  p.set_viewport_size({'width':width,'height':height});p.wait_for_timeout(150)
  assert p.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'),width
  p.screenshot(path=str(OUT/f'responsive_{width}.png'),full_page=True)
 p.locator('#restart-button').click();assert p.locator('.step-panel:visible').count()==1;assert not p.locator('#show-zips').is_checked()
 p.screenshot(path=str(OUT/'mobile_start.png'),full_page=True)
 # Verify every secondary page at narrow width without horizontal overflow.
 for section in ['methods','terms','help']:
  p.locator(f'.top-nav [data-page="{section}"]').click()
  assert p.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'),('mobile',section)
  p.screenshot(path=str(OUT/f'mobile_{section}.png'),full_page=True)
 p.locator('.top-nav [data-page="explorer"]').click()
 # Ensure GitHub Pages has made no backend requests.
 assert not any('/api/' in u for u in requests),[u for u in requests if '/api/' in u]
 print('BROWSER ERRORS',errors);assert not errors,errors
 b.close()
def safe(obj):
 if isinstance(obj,float) and not math.isfinite(obj):return None
 if isinstance(obj,dict):return {k:safe(v) for k,v in obj.items()}
 if isinstance(obj,list):return [safe(v) for v in obj]
 return obj
(OUT/'scenarios.json').write_text(json.dumps(safe({'passed':True,'case_count':len(results),'cases':results,'javascript_errors':errors,'static_api_requests':0,'viewport_widths':[1920,1024,768,390],'secondary_pages_mobile_overflow':False}),indent=2,allow_nan=False))
print(json.dumps(results,indent=2))
