import io
import os
import sys
import threading
from pathlib import Path

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field
from scipy.io.wavfile import write as write_wav

app = FastAPI(title="Alice Neural Voice Sidecar", version="0.2.0")

_model = None
_device = None
_glados = None
_generation_lock = threading.Lock()



VOICE_PAGE = """<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Alice Voice</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070a0e;color:#eef5fb;font-family:system-ui,sans-serif}
main{width:min(720px,calc(100% - 28px));padding:24px;border:1px solid #273441;border-radius:20px;background:#0d131a}
h1{margin:0 0 8px;font-size:28px}p{color:#91a3b2}
textarea{width:100%;min-height:120px;box-sizing:border-box;border-radius:12px;border:1px solid #304150;background:#081018;color:#fff;padding:14px;font:inherit}
button{margin-top:10px;padding:12px 18px;border:0;border-radius:12px;font-weight:800;cursor:pointer}
#status{margin-left:10px;color:#91a3b2;font-size:13px}audio{width:100%;margin-top:16px}
</style>
</head>
<body>
<main>
<h1>Alice // GLaDOS Voice</h1>
<p>Nur die Stimme. Kein Avatar, kein Dashboard.</p>
<textarea id="text">Hello Ben. The voice is online.</textarea>
<button id="speak">Speak</button><span id="status">ready</span>
<audio id="audio" controls></audio>
</main>
<script>
const b=document.getElementById('speak'),t=document.getElementById('text'),a=document.getElementById('audio'),s=document.getElementById('status');
b.onclick=async()=>{b.disabled=true;s.textContent='synthesizing…';
 const r=await fetch('/tts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:t.value,provider:'glados'})});
 if(!r.ok){s.textContent='error '+r.status;b.disabled=false;return}
 const blob=await r.blob();a.src=URL.createObjectURL(blob);s.textContent='ready';b.disabled=false;try{await a.play()}catch(e){}
};
</script>
</body></html>"""

@app.get("/", response_class=HTMLResponse)
def voice_page():
    return VOICE_PAGE

class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    language: str = "de"
    accent: str | None = None
    rate: float = 1.0
    pitch: float = 1.0
    voice_reference: str | None = None
    provider: str | None = None


def choose_device() -> str:
    configured = os.getenv("ALICE_TTS_DEVICE", "").strip().lower()
    if configured:
        return configured
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def get_model():
    global _model, _device
    if _model is None:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        _device = choose_device()
        _model = ChatterboxMultilingualTTS.from_pretrained(
            device=_device,
            t3_model=os.getenv("ALICE_CHATTERBOX_MODEL", "v3"),
        )
    return _model


def glados_root() -> Path:
    configured = os.getenv("GLADOS_REPO_PATH", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path(__file__).resolve().parents[1] / "vendor" / "GLaDOS-GPT").resolve()


def get_glados():
    global _glados, _device
    if _glados is not None:
        return _glados

    root = glados_root()
    voice_path = root / "models" / "glados.pt"
    vocoder_path = root / "models" / "vocoder-cpu-lq.pt"
    if not voice_path.is_file() or not vocoder_path.is_file():
        raise HTTPException(status_code=503, detail="glados-models-missing")

    try:
        import espeakng_loader
        from phonemizer.backend.espeak.wrapper import EspeakWrapper

        EspeakWrapper.set_library(espeakng_loader.get_library_path())
        EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
    except Exception as exc:
        raise HTTPException(status_code=503, detail="glados-phonemizer-unavailable") from exc

    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    try:
        from utils.tools import prepare_text
    except Exception as exc:
        raise HTTPException(status_code=503, detail="glados-text-pipeline-unavailable") from exc

    _device = choose_device()
    voice = torch.jit.load(str(voice_path), map_location=_device)
    vocoder = torch.jit.load(str(vocoder_path), map_location=_device)
    voice.eval()
    vocoder.eval()
    _glados = (voice, vocoder, prepare_text)
    return _glados


def normalize_language(value: str) -> str:
    language = (value or "de").lower().replace("_", "-")
    return language.split("-", 1)[0]


def approved_reference() -> str | None:
    configured = os.getenv("ALICE_VOICE_REFERENCE", "").strip()
    if not configured:
        return None
    path = Path(configured).expanduser().resolve()
    if not path.is_file():
        raise HTTPException(status_code=503, detail="configured-voice-reference-missing")
    return str(path)


def wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    audio = np.asarray(samples).squeeze()
    if audio.dtype.kind == "f":
        audio = audio.astype(np.float32)
    buffer = io.BytesIO()
    write_wav(buffer, sample_rate, audio)
    return buffer.getvalue()


def synthesize_glados(text: str) -> bytes:
    voice, vocoder, prepare_text = get_glados()
    device = choose_device()
    tokens = prepare_text(text).to(device)
    with _generation_lock, torch.no_grad():
        output = voice.generate_jit(tokens)
        mel = output["mel_post"].to(device)
        audio = vocoder(mel).squeeze().detach().cpu().numpy().astype(np.float32)

    peak = float(np.max(np.abs(audio))) if audio.size else 1.0
    if peak > 1.0:
        audio = audio / peak
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    return wav_bytes(pcm, 22050)


@app.get("/health")
def health():
    provider = os.getenv("ALICE_TTS_PROVIDER", "chatterbox").strip().lower()
    result = {
        "ok": True,
        "provider": provider,
        "device": _device or choose_device(),
    }
    if provider == "glados":
        root = glados_root()
        result["models_ready"] = (root / "models" / "glados.pt").is_file() and (root / "models" / "vocoder-cpu-lq.pt").is_file()
        result["language"] = "en"
    else:
        result["model"] = "chatterbox-multilingual-v3"
        result["voice_reference_configured"] = bool(os.getenv("ALICE_VOICE_REFERENCE", "").strip())
    return result


@app.get("/probe.wav")
def probe():
    try:
        return Response(
            content=synthesize_glados("Benjamin. The system is awake."),
            media_type="audio/wav",
            headers={"Cache-Control": "no-store"},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"glados-probe-failed:{type(exc).__name__}") from exc


@app.get("/speak")
def speak_get(text: str = "Hello Ben. The voice is online."):
    try:
        return Response(content=synthesize_glados(text[:1600]), media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"glados-generation-failed:{type(exc).__name__}") from exc


@app.post("/tts")
def tts(request: TTSRequest):
    provider = (request.provider or os.getenv("ALICE_TTS_PROVIDER", "chatterbox")).strip().lower()
    text = request.text.strip()

    if provider == "glados":
        try:
            return Response(content=synthesize_glados(text), media_type="audio/wav")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"glados-generation-failed:{type(exc).__name__}") from exc

    model = get_model()
    language = normalize_language(request.language)
    reference = approved_reference()
    kwargs = {"language_id": language}
    if reference:
        kwargs["audio_prompt_path"] = reference

    try:
        with _generation_lock:
            wav = model.generate(text, **kwargs)
        audio = wav.detach().cpu().numpy().squeeze().astype(np.float32)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"tts-generation-failed:{type(exc).__name__}") from exc

    return Response(content=wav_bytes(audio, model.sr), media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "alice_tts_sidecar:app",
        host=os.getenv("ALICE_TTS_HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", os.getenv("ALICE_TTS_PORT", "8799"))),
    )
