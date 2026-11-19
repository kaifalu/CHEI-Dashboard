#!/usr/bin/env python3
"""Test the optional FastAPI endpoints; requires httpx in addition to runtime dependencies."""
from pathlib import Path
import sys, json
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from fastapi.testclient import TestClient
from server import app

def main():
 with TestClient(app) as client:
  response=client.get('/');assert response.status_code==200
  assert 'window.CHEI_API_ENABLED=true;' in response.text
  assert 'window.CHEI_API_ENABLED=false;' not in response.text
  health=client.get('/api/health').json();assert health['status']=='ok'
  assert health['single_family_points']==1093063
  assert health['multi_family_points']==11572
  assert client.get('/api/metadata').status_code==200
  assert client.get('/advanced_explorer.html').status_code==200
  args={'xmin':-1.1e7,'xmax':-1e7,'ymin':3e6,'ymax':4e6,'max_points':100}
  r=client.get('/api/housing-points',params=args);assert r.status_code==200
  points=r.json();assert 0<len(points['x'])<=100
  assert len(points['x'])==len(points['y'])==len(points['kind'])
  assert points['n_total']==1093063+11572
  bad=client.get('/api/housing-points',params={**args,'xmin':args['xmax']+1})
  assert bad.status_code==422
  empty=client.get('/api/housing-points',params={**args,'xmin':0,'xmax':1,'ymin':0,'ymax':1}).json()
  assert empty['n_returned']==0
 result={'passed':True,'health':health,'capped_point_response_count':points['n_returned'],
         'source_points_in_test_extent':points['n_total'],'invalid_bounds_rejected':True,'empty_viewport_handled':True,
         'served_view_api_enabled':True,'advanced_view_served':True}
 (ROOT/'qa').mkdir(exist_ok=True)
 (ROOT/'qa/server_validation.json').write_text(json.dumps(result,indent=2))
 print(json.dumps(result,indent=2))
if __name__=='__main__':main()
