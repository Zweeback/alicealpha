# ALICE Exploration – Asset-Viewer für Codespaces

Avatare (VRM), Rettungswagen und das Klinikum Dortmund Mitte (amtliches NRW-LoD2 + Luftbild) in einem Browser-Viewer.

## In Codespaces öffnen
1. Auf GitHub: **Code → Codespaces → „…“ → New with options** → Branch `exploration/alice-assets`, Dev-Container-Konfiguration **„ALICE Exploration Viewer“** wählen → Create.
2. Der Viewer startet automatisch und öffnet sich als Vorschau (Port 4173).
   Manuell: `node exploration/viewer/serve.mjs 4173` und im Tab „Ports“ den Port 4173 öffnen.

## Inhalt
- `viewer/` – Viewer (three.js + three-vrm, fertig gebündelt), `assets/manifest.json` listet alle Assets.
- `previews/` – Renderings/Screenshots. `pipeline/` – Generator-Skripte. `README_FOR_AI.md` – Übergabe für andere KIs.

## Datenquellen/Lizenzen
- Klinikum LoD2: Geobasis NRW (3D-Gebäudemodelle LoD2, Digitale Orthophotos), Datenlizenz Deutschland – Zero – 2.0.
- Klinikum OSM-Variante: © OpenStreetMap-Mitwirkende, ODbL 1.0.
- Avatare: VRM-Meta (Autor Ben/Bentropie, nur Autor, nicht kommerziell); Basis-Avatar aus `public/avatars/candidates/model.fbx`.
