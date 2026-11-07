#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
UPSTREAM="533f940c86e353b5504d34d62ab5107894271d3b"
DIST="$PWD/dist"
mkdir -p "$DIST/runtime" "$DIST/assets"
git clone --quiet --filter=blob:none --sparse --no-checkout https://github.com/piper-tts/piper-tts.github.io.git upstream
git -C upstream sparse-checkout set vendor piper-browser.js
git -C upstream fetch --quiet --depth=1 origin "$UPSTREAM"
git -C upstream checkout --quiet --detach "$UPSTREAM"
test "$(git -C upstream rev-parse HEAD)" = "$UPSTREAM"
cp upstream/piper-browser.js "$DIST/runtime/"
cp -R upstream/vendor "$DIST/runtime/"
python - <<'PY'
from pathlib import Path
from hashlib import sha256
p=Path("dist/runtime")
required = ['piper-browser.js','vendor/ort/ort.wasm.min.js','vendor/phonemize/piper_phonemize.js']
for x in required:
    q=p/x
    assert q.is_file() and q.stat().st_size>1000, x
    print(x,q.stat().st_size,sha256(q.read_bytes()).hexdigest())
assert list(p.rglob("*.wasm")), "WASM missing"
PY
python -m pip install -r requirements.txt
python probe.py
cp de_DE-glados-medium.onnx de_DE-glados-medium.onnx.json "$DIST/assets/"
cp proof/glados-de-proof.wav proof/evidence.json "$DIST/"
python - <<'PY'
from pathlib import Path
import hashlib,json
base=Path("dist")
files={}
for p in base.rglob("*"):
    if p.is_file():
        rel=str(p.relative_to(base))
        files[rel]={"size":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()}
(base/"manifest.json").write_text(json.dumps({"source":"https://github.com/piper-tts/piper-tts.github.io","source_commit":"533f940c86e353b5504d34d62ab5107894271d3b","files":files},indent=2))
print("Assets",len(files),"total bytes",sum(v["size"] for v in files.values()))
PY
