#!/usr/bin/env python3
"""Browser E2E under network denylist: only loopback served assets allowed."""
from __future__ import annotations
import functools, http.server, json, os, pathlib, shutil, threading, time
from playwright.sync_api import sync_playwright

HERE=pathlib.Path(__file__).resolve().parent
DIST=HERE/"dist"
assert (DIST/"assets/de_DE-glados-medium.onnx").stat().st_size==63511038
shutil.copyfile(HERE/"index.html",DIST/"index.html")
# Piper upstream JS expects these URLs at the document root, not runtime/.
if not (DIST/"vendor").exists():
    (DIST/"vendor").symlink_to("runtime/vendor",target_is_directory=True)
if not (DIST/"piper-browser.js").exists():
    (DIST/"piper-browser.js").symlink_to("runtime/piper-browser.js")
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()
    def guess_type(self,path):
        if path.endswith(".wasm"):return "application/wasm"
        if path.endswith(".onnx"):return "application/octet-stream"
        return super().guess_type(path)
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(Handler,directory=str(DIST)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f"http://127.0.0.1:{server.server_port}/"
events={"url":base,"checks":[],"errors":[],"warnings":[],"requests_blocked":[]}
def check(name,fn):
    fn();events["checks"].append(name);print("PASS",name,flush=True)
try:
 with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=["--disable-dev-shm-usage","--no-sandbox","--autoplay-policy=no-user-gesture-required"])
    page=browser.new_page()
    page.on("pageerror",lambda e: events["errors"].append(str(e)))
    page.on("console",lambda m: events["warnings"].append(m.text) if m.type in ("error","warning") else None)
    def restrict(route):
        if route.request.url.startswith(base):route.continue_()
        else:events["requests_blocked"].append(route.request.url);route.abort()
    page.route("**/*",restrict)
    page.goto(base,wait_until="domcontentloaded",timeout=60000)
    page.wait_for_function("document.getElementById('status').textContent.includes('Bereit') || document.getElementById('status').textContent.includes('Keine Sprachausgabe')",timeout=180000)
    state=page.locator("#status").inner_text()
    check("model_and_wasm_load",lambda: (_ for _ in ()).throw(AssertionError(state)) if not state.startswith("Bereit") else None)
    check("speak_enabled",lambda: (_ for _ in ()).throw(AssertionError("speak disabled")) if not page.locator("#speak").is_enabled() else None)
    page.locator("#text").fill("Willkommen im Testlabor. Dies ist die deutsche Sprachausgabe.")
    page.locator("#speak").click()
    page.wait_for_function("document.getElementById('status').textContent.includes('GLaDOS bereit') || document.getElementById('status').textContent.includes('Keine Audioausgabe')",timeout=180000)
    state=page.locator("#status").inner_text()
    check("wasm_onnx_synthesis",lambda: (_ for _ in ()).throw(AssertionError(state)) if "GLaDOS bereit" not in state else None)
    clip=page.locator("#audio").evaluate("""async e=>{const r=await fetch(e.src);const b=await r.arrayBuffer();const d=new DataView(b);return {bytes:b.byteLength,fmt:String.fromCharCode(...new Uint8Array(b,0,4)),wave:String.fromCharCode(...new Uint8Array(b,8,4)),rate:d.getUint32(24,true),dataBytes:d.getUint32(40,true)}}""")
    check("RIFF_WAVE_audiodata",lambda: (_ for _ in ()).throw(AssertionError(clip)) if not (clip["fmt"]=="RIFF" and clip["wave"]=="WAVE" and clip["bytes"]>10000 and clip["dataBytes"]>1000 and clip["rate"]==22050) else None)
    events["wav"]=clip
    page.locator("#stop").click()
    check("stop_hides_audio",lambda: (_ for _ in ()).throw(AssertionError("audio visible")) if not page.locator("#audio").is_hidden() else None)
    page.locator('input[value="hev"]').check()
    check("HEV_fail_closed",lambda: (_ for _ in ()).throw(AssertionError("HEV allows synthesis")) if page.locator("#speak").is_enabled() else None)
    page.locator('input[value="glados"]').check()
    page.locator("#text").fill("E"*501)
    page.locator("#speak").click()
    check("length_guard",lambda: (_ for _ in ()).throw(AssertionError("missing length guard")) if "500" not in page.locator("#status").inner_text() else None)
    check("zero_runtime_js_errors",lambda: (_ for _ in ()).throw(AssertionError(events["errors"])) if events["errors"] else None)
    page.screenshot(path=str(HERE/"proof"/"browser.png"),full_page=True)
    browser.close()
 events["passed"]=True
finally:
 server.shutdown()
 (HERE/"proof").mkdir(exist_ok=True)
 (HERE/"proof"/"browser-evidence.json").write_text(json.dumps(events,ensure_ascii=False,indent=2))
 print(json.dumps(events,ensure_ascii=False),flush=True)
