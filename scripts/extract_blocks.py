"""Extract the literal 3x3 block definitions; fail closed on new C++ syntax.

Usage: python scripts/extract_blocks.py [path/to/games/long_night]
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r'D:\code\lgtbot\games\long_night')
raw = (SOURCE / 'map.h').read_text(encoding='utf-8')
source = re.sub(r'//[^\n]*', '', raw)
walls = {'EMPTY': 0, 'NORMAL': 1, 'HEDGE': 2, 'DOOR': 3, 'DOOROPEN': 4}
blocks = []
for entry in re.finditer(r'\{((?:Map|Exit)\w*)\(\),\s*"([^"]+)",\s*"([^"]+)"[^\n]*', source):
    function, ident, name = entry.groups()
    if function.startswith('Exit'):
        ident = 'E' + ident
    body = re.search(r'static vector<vector<Grid>> ' + function + r'\(\)\s*\{(.*?)return map;\s*\}', source, re.S).group(1)
    body = body.replace('auto map = InitializeMapTemplate();', '').strip()
    cells = [dict(type='EMPTY', attach='EMPTY', walls=[0]*4, portal=None, grow=False, label='', buttons=[]) for _ in range(9)]
    for statement in body.split(';'):
        if not statement.strip():
            continue
        match = re.fullmatch(r'\s*map\[(\d)\]\[(\d)\](.*?)\s*', statement, re.S)
        if not match:
            raise ValueError(f'Unsupported statement in {function}: {statement}')
        row, col, chain = match.groups()
        cell = cells[int(row)*3+int(col)]
        calls = list(re.finditer(r'\.([A-Za-z]+)\(([^()]*)\)', chain, re.S))
        # A label in S4 contains parentheses. Parse that quoted label first.
        content = re.search(r'\.SetContent\("([^"]*)"\)', chain)
        if content:
            cell['label'] = content.group(1)
            chain = chain.replace(content.group(0), '')
            calls = list(re.finditer(r'\.([A-Za-z]+)\(([^()]*)\)', chain, re.S))
        remainder = re.sub(r'\.([A-Za-z]+)\(([^()]*)\)', '', chain, flags=re.S)
        if remainder.strip():
            raise ValueError(f'Unparsed setter in {function}: {remainder}')
        for call in calls:
            method, value = call.groups()
            if method == 'SetType': cell['type'] = value.split('::')[1]
            elif method == 'SetAttach': cell['attach'] = value.split('::')[1]
            elif method == 'SetWall':
                cell['walls'] = [walls[w] for w in re.findall(r'Wall::(\w+)', value)]
                assert len(cell['walls']) == 4
            elif method == 'SetPortal': cell['portal'] = [int(x.strip()) for x in value.split(',')]
            elif method == 'SetGrowable': cell['grow'] = value == 'true'
            elif method == 'SetButton':
                cell['buttons'] = [[int(a), int(b), d] for a,b,d in re.findall(r'\{\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*Direct::(\w+)\s*\}', value)]
                assert cell['buttons']
            elif method == 'SetWallContent': pass
            else: raise ValueError(f'Unsupported setter {method}')
    for i, cell in enumerate(cells):
        if cell['portal']:
            r, c = i//3 + cell['portal'][0], i%3 + cell['portal'][1]
            assert 0 <= r < 3 and 0 <= c < 3
    blocks.append(dict(id=ident, name=name, cells=cells))

assert len(blocks) == 71, f'Expected 71 current block definitions, found {len(blocks)}'
assert len({b['id'] for b in blocks}) == len(blocks)
modes = {'CLASSIC': [str(i) for i in range(1,13)] + ['E'+str(i) for i in range(1,5)]}
for cpp, mode in [('twist','TWIST'),('button','BUTTON'),('trap','TRAP'),('open','OPEN'),('silent','SILENT')]:
    modes[mode] = re.findall(r'"([^"]+)"', re.search(cpp+r'_mode_ids = \{(.*?)\};', source, re.S).group(1))
modes['WILD'] = [b['id'] for b in blocks if not b['id'].startswith('S')]
modes['CRAZY'] = [b['id'] for b in blocks]
data = {'source': str(SOURCE), 'sha256': hashlib.sha256(raw.encode()).hexdigest(), 'blocks': blocks, 'modes': modes}
(ROOT/'blocks.js').write_text('/* Generated from lgtbot map.h; see 交流/NOTICE-数据来源与版权.md. */\n(function longNightModule(root){ (root.LongNightSources ||= {})["blocks.js"]=longNightModule.toString(); const data = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+'; if(typeof module!=="undefined") module.exports=data; else root.LongNightData=data; })(globalThis);\n', encoding='utf-8')
print(f'Extracted {len(blocks)} blocks; SHA256 {data["sha256"]}')
