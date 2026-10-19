#!/usr/bin/env bash
set -euo pipefail
# Install Debian Blender and pinned official VRM addon v4.10.2.
if ! command -v blender >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1; then
    sudo apt-get update
    sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends blender git ca-certificates
  elif [ "$(id -u)" = 0 ]; then
    apt-get update
    env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends blender git ca-certificates
  else
    echo 'Missing Blender and no installation privileges' >&2; exit 2
  fi
fi
REPO='https://github.com/saturday06/VRM-Addon-for-Blender.git'
TAG='v4.10.2'
COMMIT='REPLACE_WITH_VERIFIED_V4102_COMMIT_SHA'
DIR="$HOME/.local/share/alice-tools/VRM-Addon-for-Blender"
mkdir -p "$(dirname "$DIR")"
if [ ! -d "$DIR/.git" ]; then
  [ ! -e "$DIR" ] || { echo 'Existing non-git add-on; aborting' >&2; exit 3; }
  git clone --depth 1 --branch "$TAG" "$REPO" "$DIR"
fi
[ "$(git -C "$DIR" remote get-url origin)" = "$REPO" ] || exit 4
git -C "$DIR" fetch --depth 1 origin "$COMMIT"
git -C "$DIR" checkout --detach "$COMMIT"
[ "$(git -C "$DIR" rev-parse HEAD)" = "$COMMIT" ] || exit 4
VER="$(blender -b --factory-startup --python-expr "import bpy; print('ALICE_VER='+'.'.join(map(str,bpy.app.version[:2])))" 2>&1 | sed -n 's/^ALICE_VER=//p' | tail -1)"
[[ "$VER" =~ ^[0-9]+\.[0-9]+$ ]] || exit 5
MAJOR="$(echo "$VER" | cut -d. -f1)"
MINOR="$(echo "$VER" | cut -d. -f2)"
if [ "$MAJOR" -gt 4 ] || { [ "$MAJOR" -eq 4 ] && [ "$MINOR" -ge 2 ]; }; then
  DEST="$HOME/.config/blender/$VER/extensions/user_default/vrm"
  MODULE='bl_ext.user_default.vrm'
else
  DEST="$HOME/.config/blender/$VER/scripts/addons/io_scene_vrm"
  MODULE='io_scene_vrm'
fi
mkdir -p "$(dirname "$DEST")"
if [ -L "$DEST" ]; then
  [ "$(readlink "$DEST")" = "$DIR/src/io_scene_vrm" ] || exit 6
elif [ -e "$DEST" ]; then
  echo 'Another VRM add-on already exists. No overwrite.' >&2; exit 6
else
  ln -s "$DIR/src/io_scene_vrm" "$DEST"
fi
ALICE_VRM_MODULE="$MODULE" blender -b --python-expr "import bpy,os; m=os.environ['ALICE_VRM_MODULE']; bpy.ops.preferences.addon_enable(module=m); print('ALICE_VRM_READY='+m); bpy.ops.wm.save_userpref()"
echo "ALICE_VRM_COMMIT=$(git -C "$DIR" rev-parse HEAD)"
