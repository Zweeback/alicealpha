import io
import os
from pathlib import Path

import torch
import torchaudio as ta
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from chatterbox.mtl_tts import ChatterboxMultilingualTTS

app = FastAPI(title="Alice Neural Voice Sidecar", version="0.1.0")

_model = None
_device = None


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
        _device = choose_device()
        _model = ChatterboxMultilingualTTS.from_pretrained(
            device=_device,
            t3_model=os.getenv("ALICE_CHATTERBOX_MODEL", "v3"),
        )
    return _model


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


@app.get("/health")
def health():
    return {
        "ok": True,
        "provider": "chatterbox-multilingual-v3",
        "device": _device or choose_device(),
        "voice_reference_configured": bool(os.getenv("ALICE_VOICE_REFERENCE", "").strip()),
    }


@app.post("/tts")
def tts(request: TTSRequest):
    model = get_model()
    language = normalize_language(request.language)
    reference = approved_reference()

    kwargs = {"language_id": language}
    if reference:
        kwargs["audio_prompt_path"] = reference

    try:
        wav = model.generate(request.text.strip(), **kwargs)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"tts-generation-failed:{type(exc).__name__}") from exc

    buffer = io.BytesIO()
    ta.save(buffer, wav.detach().cpu(), model.sr, format="wav")
    return Response(content=buffer.getvalue(), media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "alice_tts_sidecar:app",
        host=os.getenv("ALICE_TTS_HOST", "127.0.0.1"),
        port=int(os.getenv("ALICE_TTS_PORT", "8799")),
    )
