#!/usr/bin/env bash
# ALICE 3D Studio – einmalige Einrichtung (läuft automatisch beim Erstellen des Codespace).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== Python-Pakete (Blender 5.2 als Modul + Geo/Mesh-Tools)"
pip install -q bpy==5.2.2 numpy scipy pillow trimesh lxml mapbox_earcut pyproj opencv-python-headless matplotlib
echo "== Blender-Add-ons: VRM (saturday06 v4.10.2) + MPFB 2.0.18"
python3 - <<'PY'
import bpy, os, subprocess, shutil
addons = bpy.utils.user_resource('SCRIPTS', path='addons', create=True)
if not os.path.exists(os.path.join(addons, 'io_scene_vrm')):
    subprocess.run(['git', 'clone', '-q', '--depth', '1', '-b', 'v4.10.2', 'https://github.com/saturday06/VRM-Addon-for-Blender', '/tmp/vrm_addon'], check=True)
    shutil.copytree('/tmp/vrm_addon/src/io_scene_vrm', os.path.join(addons, 'io_scene_vrm'))
bpy.ops.wm.read_factory_settings(use_empty=True)
print('MPFB', bpy.ops.extensions.package_install_files(filepath=os.path.abspath('studio/vendor/mpfb-2.0.18.zip'), repo='user_default', enable_on_install=True))
bpy.ops.wm.save_userpref()
print('MPFB_DATA', os.path.join(bpy.utils.user_resource('EXTENSIONS'), '.user', 'user_default', 'mpfb', 'data'))
PY
MPFB_DATA=$(python3 -c "import bpy,os;print(os.path.join(bpy.utils.user_resource('EXTENSIONS'),'.user','user_default','mpfb','data'))")
echo "== MakeHuman CC0-Assets (System + Skins, ~380 MB) nach $MPFB_DATA"
mkdir -p "$MPFB_DATA" /tmp/alice_dl
for p in makehuman_system_assets/makehuman_system_assets_cc0.zip skins01/skins01_cc0.zip; do
  f=/tmp/alice_dl/$(basename $p); [ -f "$f" ] || curl -sSL -o "$f" "https://files2.makehumancommunity.org/asset_packs/$p"
  unzip -qo "$f" -d "$MPFB_DATA"
done
echo "== ARKit-Faceunits + Visemes (CC0)"
for z in studio/vendor/func/*.zip; do d=studio/vendor/func/$(basename $z .zip); [ -d "$d" ] || unzip -qo "$z" -d "$d"; done
echo "== Node: three.js, three-vrm, Playwright-Chromium, glTF-Validator"
(cd studio/viewer && npm install --silent && npx playwright install --with-deps chromium >/dev/null)
grep -q MPFB_DATA ~/.bashrc 2>/dev/null || echo "export MPFB_DATA=\"$MPFB_DATA\"" >> ~/.bashrc
echo "FERTIG. Neues Terminal öffnen, dann: make -C studio help"
