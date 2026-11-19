#!/usr/bin/env python3
"""Exercise the flexible five-step workflow against independent source calculations.

Optional QA dependencies: playwright, numpy. Set CHEI_CHROMIUM_PATH when needed.
External network requests are blocked: the test exercises the self-contained data.
Browser launch restrictions are reported as NOT RUN, never as a passing test.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
from pathlib import Path
import shutil
import sys

import numpy as np
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html', type=Path, default=ROOT / 'index.html')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'qa' / 'flexible_workflow')
    parser.add_argument('--chromium', default=os.environ.get('CHEI_CHROMIUM_PATH') or shutil.which('chromium'))
    args = parser.parse_args()
    out = args.output_dir
    out.mkdir(parents=True, exist_ok=True)
    properties = [f['properties'] for f in json.loads((ROOT / 'data' / 'tracts_web.geojson').read_text())['features']]
    memberships = json.loads((ROOT / 'data' / 'guided_scope_membership.json').read_text())
    records, errors, requests = [], [], []

    def check(condition, name, **evidence):
        if not condition:
            raise AssertionError(name + ': ' + json.dumps(evidence))
        records.append({'check': name, **evidence})

    def source_expected(location, code, fields, percentile, rule, minimum=2):
        # Independent NumPy implementation, not the browser's screening module.
        arrays = {k: np.asarray([r.get(k, np.nan) if r.get(k) is not None else np.nan for r in properties], dtype=float) for k in fields}
        cuts = {k: float(np.quantile(v[np.isfinite(v)], percentile / 100, method='linear')) for k, v in arrays.items()}
        indices = memberships[location][code]['tract']
        eligible = [i for i in indices if all(np.isfinite(arrays[k][i]) for k in fields)]
        counts = {i: sum(arrays[k][i] >= cuts[k] for k in fields) for i in eligible}
        minimum = len(fields) if rule == 'all' else 1 if rule == 'any' else minimum
        return {'matched': [i for i in eligible if counts[i] >= minimum], 'eligible': eligible, 'thresholds': cuts}

    with sync_playwright() as pw:
        launch = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
        if args.chromium:
            launch['executable_path'] = args.chromium
        try:
            browser = pw.chromium.launch(**launch)
        except Exception as exc:
            result = {'status': 'not_run', 'reason': 'Browser could not launch in this execution environment.',
                      'error': str(exc), 'checks_passed': 0, 'external_network_blocked': True}
            (out / 'validation.json').write_text(json.dumps(result, indent=2))
            print(json.dumps({'status': 'not_run', 'reason': result['reason'], 'report': str(out / 'validation.json')}))
            return 2
        context = browser.new_context(viewport={'width': 1440, 'height': 1050}, accept_downloads=True)
        page = context.new_page()
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.on('request', lambda req: requests.append(req.url))
        page.route('http://**', lambda route: route.abort())
        page.route('https://**', lambda route: route.abort())
        page.set_content(args.html.read_text(), wait_until='load', timeout=60000)
        page.wait_for_function('!!window.GUIDE', timeout=30000)

        def one_panel():
            check(page.locator('.step-panel:visible').count() == 1, 'Exactly one editable step is visible')

        def begin(location='county', code='all', climate='threshold', warming='25'):
            page.evaluate('GUIDE.gotoStep(0,false)')
            page.locator(f'[data-location="{location}"]').click()
            if location in ('zip', 'tract'):
                page.locator('#place-input').fill(code)
            elif location == 'precinct':
                page.locator('#precinct-input').select_option(code)
            page.locator('#next-button').click()
            one_panel()
            page.locator(f'[data-climate="{climate}"]').click()
            if climate == 'threshold':
                page.locator('#warming-input').select_option(warming)
            page.locator('#next-button').click()
            one_panel()

        def choose_factors(ids):
            page.locator('[data-view-mode="combine"]').click()
            page.locator('#clear-factors').click()
            page.locator('#expand-factor-groups').click()
            check(page.locator('input[data-factor]').count() == 17, 'All 17 indicator families are present')
            for key in ids:
                control = page.locator(f'input[data-factor="{key}"]')
                check(control.is_enabled(), 'Requested factor is available', factor=key)
                control.set_checked(True)
            check(page.locator('#next-button').is_enabled() == (len(ids) >= 2), 'At least two factors required for a combination', selected=ids)

        def combination(location='county', code='all', climate='threshold', warming='25', ids=None,
                        percentile=80, rule='all', minimum=2, population_period='change'):
            ids = ids or ['precipitation', 'svi', 'housing', 'population']
            begin(location, code, climate, warming)
            choose_factors(ids)
            page.locator('#next-button').click()
            one_panel()
            if 'population' in ids:
                page.locator('#population-period').select_option(population_period)
            page.locator('#combined-percentile').select_option(str(percentile))
            page.locator('#combine-rule').select_option(rule)
            if rule == 'atleast':
                page.locator('#minimum-count').select_option(str(minimum))
            page.locator('#next-button').click()
            page.wait_for_function('GUIDE.getSnapshot()?.combination != null')
            check(page.locator('#results').is_visible(), 'Results screen opens')
            check(page.locator('.step-panel:visible').count() == 0, 'Editable steps close on Results')
            fields = []
            for key in ids:
                if key == 'precipitation':
                    fields.append('sens_pct' if climate == 'compare' else 'pr_' + warming)
                elif key == 'svi': fields.append('SVI')
                elif key == 'housing': fields.append('parcel_hu_change')
                elif key == 'population': fields.append({'2020': 'hp_2020', '2050': 'hp_2050', 'change': 'pop_chg'}[population_period])
                elif key == 'households': fields.append('hh_chg')
                elif key == 'employment': fields.append('job_chg')
            expected = source_expected(location, code, fields, percentile, rule, minimum)
            actual = page.evaluate('GUIDE.getSnapshot().combination')
            check(sorted(actual['matchedIndices']) == sorted(expected['matched']),
                  'Combination matches independently calculated source tracts',
                  place=f'{location}/{code}', fields=fields, rule=rule, percentile=percentile,
                  expected_matches=len(expected['matched']), actual_matches=len(actual['matchedIndices']))
            check(sorted(actual['eligibleIndices']) == sorted(expected['eligible']), 'Complete-data denominator matches source')
            return actual

        one_panel()
        page.locator('[data-location="zip"]').click()
        page.locator('#place-input').fill('99999')
        check(page.locator('#next-button').is_disabled(), 'Unknown ZIP is rejected')
        page.locator('#place-input').fill('77007')
        check(page.locator('#next-button').is_enabled(), 'Known ZIP is accepted')
        page.locator('#next-button').click()
        modes = page.locator('[data-climate]').evaluate_all('(els)=>els.map(el=>el.dataset.climate)')
        check(set(modes) == {'threshold', 'compare', 'none'}, 'Climate step contains only precipitation settings and omission')
        check(page.get_by_text('Explore combined exposure', exact=True).count() == 0, 'Topic categories removed from Climate')
        page.screenshot(path=str(out / 'climate_step.png'), full_page=True)

        main_result = combination()
        page.screenshot(path=str(out / 'four_factor_result.png'), full_page=True)
        for key in ['precipitation', 'svi', 'housing', 'population', 'combined']:
            page.locator(f'[data-map-factor="{key}"]').click()
            page.wait_for_timeout(120)
            check(page.evaluate('GUIDE.getSnapshot().combination.matchedIndices') == main_result['matchedIndices'],
                  'Component map does not change combination membership', component=key)
        with page.expect_download() as event:
            page.locator('#download-screen').click()
        download = event.value
        destination = out / 'screen_export.csv'
        download.save_as(str(destination))
        csv_rows = list(csv.DictReader(io.StringIO(destination.read_text(encoding='utf-8-sig'))))
        check(bool(csv_rows), 'CSV export contains tract rows', rows=len(csv_rows))

        combination(rule='any')
        combination(rule='atleast', minimum=2)
        combination(location='zip', code='77007', percentile=90, warming='20')
        for warming in ['15', '30']:
            combination(warming=warming, ids=['precipitation', 'svi'])
        combination(climate='compare', ids=['precipitation', 'svi', 'housing'])
        combination(climate='none', ids=['svi', 'population'], population_period='2020')
        combination(location='precinct', code='3', population_period='2050')
        combination(location='tract', code='48201342001', ids=['precipitation', 'svi'])

        # Retained single-indicator paths: source-specific periods are enforced.
        for indicator, climate, period, expected_field in [
            ('pr_tract', 'threshold', 'threshold', 'pr_25'),
            ('pr_change', 'compare', 'warming_comparison', 'sens_pct'),
            ('population', 'none', '2020', 'hp_2020'),
            ('svi', 'none', '2020', 'SVI'),
            ('chei', 'none', '2050', 'CHEI_2050'),
        ]:
            begin('zip', '77007', climate)
            page.locator('[data-view-mode="single"]').click()
            page.locator('#indicator-input').select_option(indicator)
            page.locator('#next-button').click()
            page.locator('#period-input').select_option(period)
            page.locator('#next-button').click()
            page.wait_for_function('GUIDE.getSnapshot() !== null')
            check(page.evaluate('GUIDE.getSnapshot().field') == expected_field, 'Single indicator retains source field', indicator=indicator)

        # Responsive boundaries and all public information panels.
        for width, height in [(1920, 1080), (1024, 768), (768, 1024), (390, 844)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_timeout(200)
            check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
                  'Results has no horizontal overflow', viewport=width)
            page.screenshot(path=str(out / f'results_{width}.png'), full_page=True)
            for section in ['methods', 'terms', 'help']:
                page.locator(f'.top-nav [data-page="{section}"]').click()
                check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
                      'Information page has no horizontal overflow', page=section, viewport=width)
            page.locator('.top-nav [data-page="explorer"]').click()

        check(not errors, 'No uncaught JavaScript errors', errors=errors)
        check(not any('/api/' in url for url in requests), 'Self-contained edition makes no backend API requests')
        browser.close()

    result = {'status': 'passed', 'checks_passed': len(records), 'checks': records,
              'javascript_errors': errors, 'external_network_blocked': True,
              'html': args.html.name, 'source_expected_method': 'Independent NumPy linear quantiles and raw GeoJSON attributes'}
    (out / 'validation.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({'status': result['status'], 'checks_passed': len(records), 'report': str(out / 'validation.json')}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
