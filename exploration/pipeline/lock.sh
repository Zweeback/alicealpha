#!/bin/bash
# Serialisiert schwere Jobs (Blender-Render/Chromium) – die Maschine hat nur 2 Kerne. Aufruf: mh/lock.sh <befehl ...>
exec flock /tmp/mh_heavy.lock "$@"
