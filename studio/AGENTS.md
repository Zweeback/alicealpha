# ALICE 3D Studio – Anleitung für KI-Agenten (Copilot, Claude, Gemini …)

Du arbeitest im Codespace „ALICE 3D Studio“. Blender 5.2 läuft **als Python-Modul** (`import bpy`), ohne Bildschirm.
Alle Arbeit läuft über `make -C studio <ziel>` oder Python-Skripte in `studio/mh/`. Ergebnisse landen in `studio/out/`.

## Ablauf für jeden Auftrag
1. Passendes Ziel/Skript wählen (`make -C studio help`). Fehlt eins: neues Skript in `studio/mh/` schreiben (bpy oder reines glTF-JSON wie `avaturn_*.py`).
2. Ausführen, dann **immer prüfen**: `make -C studio check` (Validator 0 Fehler + Screenshots) und die PNGs in `studio/out/shots/` ansehen.
3. Mit den Referenzbildern vergleichen (`exploration/previews/`, Character Sheets im Bundle) und nachbessern, mind. 2 Runden.
4. Ergebnis committen (nur Skripte + kleine Ergebnisse; große Binärdateien < 50 MB).

## Wichtige Fakten
- Hauptavatar: `out/alice.vrm` (VRM 1.0, Avaturn-Basis aus `public/avatars/alice-fbx-source.vrm`, 73 Knochen, ARKit-52 + Visemes, Alice-Emotionen als Custom-Expressions).
- `mh/vrm_optimize.py` muss Morph-NORMALs behalten (sonst Fehler beim Blinzeln).
- Offene Aufgaben (Priorität): Laborkittel mit Kapuze/Harness/A-Logo **direkt am v1.1-Körper** (nicht übertragen – `graft_coat.py` ist gescheitert), hoher roter Dutt mit Hair Cards + Spring-Bones, Haut 2K mit Sommersprossen.
- Regeln für Kleidung/Haare: `mh/BRIEFING.md` (Reallusion-Regeln: Saumdicke, Puffer zur Haut, Haarschichten).
- Geodaten: nur amtliche NRW-Daten (dl-de/zero) oder OSM (ODbL, Attribution). Keine Feuerwehr-/Sicherheitspläne. Google 3D Tiles nicht speichern (Lizenz).
- Keine echten Gesichter nachbauen; keine Logos/Marken auf Modellen.
- Kein GPU im Codespace: KI-3D-Generatoren (TRELLIS, Hunyuan) → `colab/`-Notebook bzw. HF-Account.
