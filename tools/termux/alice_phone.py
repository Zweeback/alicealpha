#!/usr/bin/env python3
"""ALICE local Android/Termux bridge. Standard library only; no root, no listener."""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

ENDPOINT = re.compile(r"^(?:[a-zA-Z0-9._-]+|\[[0-9a-fA-F:]+\]):([0-9]{1,5})$")

def validate_endpoint(value):
    match = ENDPOINT.fullmatch(value)
    if not match or not 1 <= int(match.group(1)) <= 65535:
        raise ValueError("Expected HOST:PORT shown under Android > Wireless debugging")
    return value

def execute(argv, timeout=20, interactive=False, binary=False):
    if not shutil.which(argv[0]):
        raise RuntimeError(f"Command unavailable: {argv[0]}")
    try:
        proc = subprocess.run(argv, capture_output=not interactive,
                              text=not binary, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Timed out: {argv[0]}") from exc
    if proc.returncode:
        err = proc.stderr if proc.stderr is not None else ""
        if isinstance(err, bytes):
            err = err.decode("utf-8", "replace")
        raise RuntimeError((err or "Command exited unsuccessfully").strip()[:240])
    return proc.stdout

def optional(argv, decode_json=False):
    try:
        value = execute(argv, timeout=8)
        return json.loads(value) if decode_json else value.strip()
    except (RuntimeError, ValueError, OSError):
        return None

def device_list():
    out = optional(["adb", "devices", "-l"])
    if out is None:
        return {"available": False, "devices": []}
    devices = []
    for line in out.splitlines():
        pieces = line.split()
        if len(pieces) >= 2 and not line.startswith("List of") and not line.startswith("*"):
            devices.append({"serial": pieces[0], "state": pieces[1]})
    return {"available": True, "devices": devices}

def status():
    return {
        "schema": "alice-termux-status/1",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "termux": bool(os.environ.get("TERMUX_VERSION") or "com.termux" in os.environ.get("PREFIX", "")),
        "model": optional(["getprop", "ro.product.model"]),
        "android": optional(["getprop", "ro.build.version.release"]),
        "battery": optional(["termux-battery-status"], decode_json=True),
        "adb": device_list(),
        "remote_chatgpt_connected": False,
    }

def selected_device():
    devices = [x["serial"] for x in device_list()["devices"] if x["state"] == "device"]
    if len(devices) != 1:
        raise RuntimeError(f"Exactly one authorized ADB device required; found {len(devices)}")
    return devices[0]

def integer(value, low, high):
    number = int(value)
    if not low <= number <= high:
        raise ValueError(f"Value must be {low}..{high}")
    return str(number)

def handle(args):
    action = args.action
    if action in ("status", "doctor"):
        result = status()
        if action == "doctor":
            result["instructions"] = [
                "Termux: pkg install android-tools python",
                "Pixel: Developer options > Wireless debugging",
                "Use 'adb pair HOST:PAIR_PORT' with the pairing code shown by Android",
                "Use 'adb connect HOST:DEBUG_PORT' (this is a different port)",
            ]
        return result
    if action in ("pair", "connect"):
        endpoint = validate_endpoint(args.endpoint)
        result = execute(["adb", action, endpoint], interactive=(action == "pair"), timeout=60)
        return {"ok": True, "action": action, "output": result.strip() if result else None}
    if action == "devices":
        return device_list()
    serial = selected_device()
    adb = ["adb", "-s", serial]
    if action in ("home", "back"):
        execute(adb + ["shell", "input", "keyevent", "3" if action == "home" else "4"])
    elif action == "tap":
        execute(adb + ["shell", "input", "tap", integer(args.x, 0, 10000), integer(args.y, 0, 10000)])
    elif action == "swipe":
        positions = [integer(v, 0, 10000) for v in (args.x1, args.y1, args.x2, args.y2)]
        duration = integer(args.duration, 50, 10000)
        execute(adb + ["shell", "input", "swipe", *positions, duration])
    else:
        raise RuntimeError("Unsupported action")
    return {"ok": True, "action": action, "device": serial}

def build_parser():
    parser = argparse.ArgumentParser(description="Rootless Termux phone bridge; no network listener")
    sub = parser.add_subparsers(dest="action", required=True)
    for name in ("doctor", "status", "devices", "home", "back"):
        sub.add_parser(name)
    for name in ("pair", "connect"):
        sub.add_parser(name).add_argument("endpoint")
    tap = sub.add_parser("tap")
    tap.add_argument("x")
    tap.add_argument("y")
    swipe = sub.add_parser("swipe")
    for part in ("x1", "y1", "x2", "y2"):
        swipe.add_argument(part)
    swipe.add_argument("duration", nargs="?", default="400")
    return parser

def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        print(json.dumps(handle(args), ensure_ascii=False, indent=2))
        return 0
    except (RuntimeError, ValueError, OSError) as error:
        print(json.dumps({"ok": False, "error": str(error)}), file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
