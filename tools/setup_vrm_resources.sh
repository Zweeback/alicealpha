#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/.alice-tools"
mkdir -p "$TOOLS"
echo "[alice-vrm] Blender executable:"
command -v blender
blender --version | head -n 2
echo "[alice-vrm] Cloning official VRM add-on source (not enabling arbitrary code):"
if [ ! -d "$TOOLS/VRM-Addon-for-Blender/.git" ]; then
  git clone --depth 1 https://github.com/saturday06/VRM-Addon-for-Blender.git "$TOOLS/VRM-Addon-for-Blender"
else
  git -C "$TOOLS/VRM-Addon-for-Blender" fetch --depth 1 origin
fi
echo "[alice-vrm] VRM add-on source ready at $TOOLS/VRM-Addon-for-Blender"
echo "[alice-vrm] Add-on must be installed/enabled from a release compatible with the installed Blender version."
echo "[alice-vrm] Do not treat this source checkout as an enabled extension."
