"""Hilfsskript: JSON-Teil eines VRM/GLB lesen. python3 mh/hair_gltfinfo.py X.vrm [materials|springs|nodes|mesh]"""
import sys, json, struct
def load(p):
    b = open(p, 'rb').read()
    ln = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + ln]), b
if __name__ == '__main__':
    j, b = load(sys.argv[1]); what = sys.argv[2] if len(sys.argv) > 2 else 'materials'
    if what == 'materials':
        for i, m in enumerate(j['materials']):
            if m['name'].startswith('Hair'): print(i, json.dumps(m)[:600])
    elif what == 'springs':
        ex = j['extensions']
        print(json.dumps(ex.get('VRMC_springBone'), indent=0)[:4000])
    elif what == 'nodes':
        for i, n in enumerate(j['nodes']):
            if 'hair' in n.get('name', '') or n.get('name') in ('head', 'ht_01'): print(i, json.dumps(n))
