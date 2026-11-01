#!/usr/bin/env bash
set -euo pipefail
umask 077

remote="${1:-bentropy:}"
output_root="${DRIVE_INVENTORY_DIR:-$HOME/.local/share/alicealpha/drive-inventory}"
mkdir -p "$output_root"
run_dir="$(mktemp -d "$output_root/run-XXXXXXXX")"
printf 'Inventar-Verzeichnis: %s\n' "$run_dir"

if rclone lsjson "$remote" --recursive --files-only --hash --metadata \
  > "$run_dir/inventory.partial.json" 2> "$run_dir/rclone.log"; then
  printf '0\n' > "$run_dir/rclone.exit"
else
  status=$?
  printf '%s\n' "$status" > "$run_dir/rclone.exit"
  printf 'Drive-Erfassung fehlgeschlagen (Exitcode %s). Details: %s/rclone.log\n' \
    "$status" "$run_dir" >&2
  exit "$status"
fi

python3 - "$run_dir/inventory.partial.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    inventory = json.load(source)
if not isinstance(inventory, list) or not all(isinstance(item, dict) for item in inventory):
    raise ValueError("Ungültiges Inventar: erwartet wird eine Liste von Dateiobjekten")
print(f"Vollständiges JSON geprüft: {len(inventory)} Dateieinträge.")
PY

mv "$run_dir/inventory.partial.json" "$run_dir/inventory.json"
printf 'Inventar abgeschlossen: %s/inventory.json\n' "$run_dir"
printf 'Hinweise und Erfassungslücken im Log prüfen: %s/rclone.log\n' "$run_dir"
