"""Refresh public Amarr catalog options; manual maintenance, never a release network dependency."""
import concurrent.futures
import hashlib
import html
import json
import pathlib
import re
import urllib.parse
import urllib.request
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
data = json.loads((ROOT / 'door-design-data.js').read_text().split('=', 1)[1].rstrip(';\n'))
out = ROOT / 'assets' / 'door-options'
out.mkdir(exist_ok=True)
assets = {}

def read(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()

def image(url, source):
    if not url:
        return ''
    url = urllib.parse.urljoin(source, html.unescape(url))
    key = hashlib.sha256(url.encode()).hexdigest()[:16]
    ext = pathlib.Path(urllib.parse.urlparse(url).path).suffix.lower()
    if ext not in ['.jpg', '.png', '.webp', '.jpeg']:
        ext = '.jpg'
    name = key + ext
    assets[url] = name
    return '/assets/door-options/' + name

def collection(f):
    source = f['source'].replace('/designer-s-choice', '/designers-choice')
    page = read(source).decode()
    match = re.search(r'data-product-details-api-url="([^"]+)"', page)
    if not match:
        return f['id'], None
    api = urllib.parse.urljoin(source, html.unescape(match.group(1)))
    rows = json.loads(read(api))
    panels = {}
    def panel_key(name):
        return name.replace('long-panel','lp').replace('long-bead','lp-bead').replace('panel','').replace('-','')
    for row in rows:
        panel = next((p for p in f['panels'] if panel_key(p['id']) == panel_key(row.get('panelName',''))), None)
        if row.get('unavailable') or not panel:
            continue
        colors = [{'id':c['value'], 'label':c['colorTitle'], 'hex':c.get('hexCode', ''),
                   'image':image(c.get('colorImage'), source)} for c in row.get('colors', []) if not c.get('unavailable')]
        windows = [{'id':w['windowOption'], 'label':w['windowOptionTitle'],
                    'placement':w.get('doorDesignerWindowPlacementCode', ''),
                    'image':image(w.get('windowOptionImage'), source)} for w in row.get('windows', []) if not w.get('unavailable')]
        panels[panel['id']] = {'colors':colors, 'windows':windows}
    hardware = []
    glasses = []
    for tag in re.findall(r'<img\b[^>]+>', page):
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', tag))
        url = attrs.get('data-src') or attrs.get('src', '')
        label = html.unescape(attrs.get('alt', '')).strip()
        if not label:
            continue
        target = hardware if 'dec-hardware-' in url else glasses if '/glass-color-options/' in url else None
        if target is not None and not any(x['label']==label for x in target):
            target.append({'id':re.sub('[^a-z0-9]+','-',label.lower()).strip('-'), 'label':label, 'image':image(url,source)})
    return f['id'], {'source':source,'api':api,'verifiedAt':str(date.today()),'panels':panels,'hardware':hardware,'glass':glasses}

families = [f for f in data['families'].values() if f['manufacturer']=='Amarr' and f['panels'] and not any(p.get('illustrative') for p in f['panels'])]
result = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for key, value in pool.map(collection, families):
        if value:
            result[key] = value
            print(key, len(value['panels']), 'panels', flush=True)

def download(item):
    url, name = item
    path = out / name
    if not path.exists():
        path.write_bytes(read(url))
    if path.stat().st_size < 100:
        raise ValueError('Empty image: '+url)

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(download, assets.items()))
(ROOT / 'door-config-options.js').write_text('window.DOOR_CONFIG_OPTIONS='+json.dumps(result,separators=(',',':'))+';\n')
print('Saved',len(result),'collections and',len(assets),'catalog thumbnails')
