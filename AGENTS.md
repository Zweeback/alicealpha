# Alice Alpha — Agent notes

## What this is
Alice OS v0.1 vertical slice: Presence, German chat, persistent memory (localStorage), Tribunal, Graph, Settings.
Core is model-independent. Backend here is local kernel (not SuperGrok cloud).

## Do
- Keep Core vs Backend separation
- Every memory needs hash + source + status (candidate|confirmed)
- Tribunal before permanent memory
- German UI strings

## Do not
- Claim Grok is the core
- Add multi-LLM mesh without provenance
- Drop localStorage without migration path

## Run
```bash
python3 -m http.server 8080
# http://localhost:8080
```

Or open `Alice-OS-v0.1.html` in a browser.
