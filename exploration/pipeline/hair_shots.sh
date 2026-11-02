#!/bin/bash
# Haar-Testschleife: Export (hair_export.py = export_vrm.py + Collider-Fix) + Viewer-Shots.
# Aufruf: mh/hair_shots.sh TAG [shots=head,head34,headback,headside,full,q34,back,bust] [extra-query]
cd "$(dirname "$0")/.."
TAG=${1:-r1}; SHOTS=${2:-head,head34,headback,headside,full,q34,back,bust}; EXTRA=${3:-"pose=relaxed"}
mkdir -p out/mh/h
python3 mh/hair_export.py --out out/mh/hair_test.vrm --parts out/mh/hair.blend 2>&1 | grep -E "export\]|Error|Traceback|error" | tail -8
mh/lock.sh node viewer/shot.mjs out/mh/hair_test.vrm out/mh/h/$TAG "$SHOTS" "$EXTRA" 2>&1 | grep -E "SHOT|error" 
