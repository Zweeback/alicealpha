#!/usr/bin/env python3
"""Reproducible GLaDOS DE voice E2E probe. No substitute voices."""
from __future__ import annotations
import hashlib, json, math, os, pathlib, platform, sys, time, urllib.request, wave, audioop
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "proof"
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = "https://huggingface.co/systemofapwne/piper-de-glados/resolve/main/de/de_DE/glados/medium"
FILES = {
    "de_DE-glados-medium.onnx": (63511038, "a3ccf9c6d75f8d21c71c2bd6c2ea5f63"),
    "de_DE-glados-medium.onnx.json": (7100, "16b86a4a20fe5c4723cc8dfc17bd7bb6"),
}
def digest(path, method):
    h = hashlib.new(method)
    with path.open("rb") as f:
        while block := f.read(1024*1024):
            h.update(block)
    return h.hexdigest()
def ensure(name, expect_size, expect_md5):
    dst = ROOT/name
    if dst.is_file() and dst.stat().st_size == expect_size and digest(dst, "md5") == expect_md5:
        print("Already valid:", name)
        return dst
    for n in range(3):
        try:
            req = urllib.request.Request(f"{SOURCE}/{name}", headers={"User-Agent": "glados-de-e2e/1.0"})
            with urllib.request.urlopen(req, timeout=90) as src, (ROOT/(name+".part")).open("wb") as out:
                while chunk := src.read(1024*1024):
                    out.write(chunk)
            tmp = ROOT/(name+".part")
            assert tmp.stat().st_size == expect_size, f"{name}: size mismatch {tmp.stat().st_size}"
            assert digest(tmp,"md5") == expect_md5, f"{name}: checksum mismatch"
            tmp.replace(dst)
            print("VERIFIED:",name,expect_size,expect_md5)
            return dst
        except Exception:
            (ROOT/(name+".part")).unlink(missing_ok=True)
            if n==2:raise
            time.sleep(3*(n+1))
def run():
    files={n: ensure(n,*metadata) for n,metadata in FILES.items()}
    from piper import PiperVoice
    voice = PiperVoice.load(str(files["de_DE-glados-medium.onnx"]), config_path=str(files["de_DE-glados-medium.onnx.json"]))
    cfg=json.loads(files["de_DE-glados-medium.onnx.json"].read_text())
    assert cfg["espeak"]["voice"].lower().startswith("de"), "Not a German phonemizer"
    text="Willkommen im Testlabor. Dies ist eine Prüfung der deutschen Sprachsynthese."
    wav=OUT/"glados-de-proof.wav"
    with wave.open(str(wav),"wb") as f:
        voice.synthesize_wav(text, f)
    with wave.open(str(wav),"rb") as wf:
        rate,chans,width,frames = wf.getframerate(),wf.getnchannels(),wf.getsampwidth(),wf.getnframes()
        data=wf.readframes(frames)
    duration = frames/rate
    assert chans==1 and width==2, (chans,width)
    assert 18000<=rate<=48000,rate
    assert 0.5<duration<40,duration
    rms = audioop.rms(data,2)/32768
    peak = audioop.max(data,2)/32768
    assert math.isfinite(rms) and rms>0.001, f"silent/invalid: rms={rms}"
    assert math.isfinite(peak) and peak>rms and peak<=1.0
    meta={
       "standard":"RIFF/WAVE PCM; Piper model upstream voices.json",
       "passed":True,"model_id":"systemofapwne/piper-de-glados",
       "voice":"de_DE-glados-medium","source":SOURCE,
       "model_sha256":digest(files["de_DE-glados-medium.onnx"],"sha256"),
       "config_sha256":digest(files["de_DE-glados-medium.onnx.json"],"sha256"),
       "wav_sha256":digest(wav,"sha256"),"rate":rate,"channels":chans,
       "sample_width":width,"duration_seconds":round(duration,3),
       "rms_norm":round(rms,5),"peak_norm":round(peak,5),
       "python":sys.version.split()[0],"platform":platform.platform(),
       "generated_at":datetime.now(timezone.utc).isoformat(),
       "text":text,
    }
    (OUT/"evidence.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2)+"\n")
    print("END_TO_END_PASS",json.dumps(meta,ensure_ascii=False))
if __name__=="__main__":run()
