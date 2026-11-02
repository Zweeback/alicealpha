"""Lädt das VRM-Add-on (saturday06) in headless bpy. Installation: studio/setup.sh."""
import sys, os, bpy, addon_utils
ADDONS = bpy.utils.user_resource('SCRIPTS', path='addons')
if ADDONS not in sys.path: sys.path.append(ADDONS)


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mod = addon_utils.enable('io_scene_vrm', default_set=True, handle_error=lambda e: (_ for _ in ()).throw(e))
    assert mod is not None and 'io_scene_vrm' in bpy.context.preferences.addons, 'VRM-Add-on nicht geladen (studio/setup.sh ausführen)'
