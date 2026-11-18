#!/usr/bin/env python3
"""Sanitized, read-only ALICE Codespace status snapshot. No secret collection."""
import hashlib, json, re, shutil, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
EXPECTED="4580ac1c35a8bf4b49ac29d390197dd49cea053de42d563dbe940d09c0adeb30"
def run(args):
    try:
        p=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,timeout=15)
        return p.stdout.strip() if p.returncode==0 else None
    except (OSError,subprocess.TimeoutExpired): return None
def version(v):
    m=re.search(r"\d+(?:\.\d+){1,3}",v or "")
    return m.group() if m else None
def checksha(path):
    if not path.is_file(): return None
    h=hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda:f.read(1048576),b""): h.update(part)
    return h.hexdigest()
asset=ROOT/"public/avatars/alice-fbx-source.glb"
addon=Path.home()/".local/share/alice-tools/VRM-Addon-for-Blender"
sha=checksha(asset)
blender=version(run(["blender","--version"])) if shutil.which("blender") else None
commit=run(["git","-C",str(addon),"rev-parse","HEAD"]) if addon.is_dir() else None
if not commit or not re.fullmatch(r"[0-9a-f]{40}",commit): commit=None
head=run(["git","rev-parse","--short","HEAD"])
if not head or not re.fullmatch(r"[0-9a-f]{4,12}",head): head=None
data={
  "schema":"alice.codespace.telemetry.v1",
  "capturedAt":datetime.now(timezone.utc).isoformat(),
  "mode":"read_only_snapshot",
  "continuousChatPushSupported":False,
  "repoHead":head,
  "nodeVersion":version(run(["node","--version"])) if shutil.which("node") else None,
  "blenderVersion":blender,
  "vrmAddonCommit":commit,
  "sourceGLBPresent":asset.is_file(),
  "sourceGLBSha256":sha,
  "sourceGLBVerified":sha==EXPECTED
}
data["status"]="ready" if blender and commit and sha==EXPECTED else "incomplete"
payload=json.dumps(data,indent=2,ensure_ascii=False)+"\n"
print(payload,end="")
if "--write-local" in sys.argv[1:]:
    path=ROOT/".alice/telemetry/latest.json"
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(payload,encoding="utf-8")
