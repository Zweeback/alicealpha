# ALICE Bundle – Übergabe an eine andere KI

Stand: 2026-11-02 · Auftraggeber: Ben („Bentropie“, GitHub `Zweeback`) · Sprache der Nutzeroberfläche: Deutsch.

## Worum es geht
ALICE ist Bens KI-Begleiterin: „AI Researcher / Field Analyst – curious, helpful, overenthusiastic, sometimes a mess, always here“.
Ziel ist ein **realistischer, voll geriggter VRM-Avatar** plus ein **Browser-KI-Bot**, der sie spricht, fühlen und sich bewegen lässt
(Qualitätslatte des Nutzers: besser als „Ani“ von Grok; aktueller Stand laut Nutzer: „Sims-4-Qualität“).

## Ordner
| Pfad | Inhalt |
|---|---|
| `viewer/` | **Asset-Viewer** (three.js 0.170 + @pixiv/three-vrm 3.3.3, fertig gebündelt in `app.js`, Quelle `app.src.js`). Liest `assets/manifest.json`, zeigt jeden Avatar/jedes Modell, Ausdrucks-Buttons, Klinikum als Hintergrund. Start: `node serve.mjs 4173` → http://localhost:4173 (oder beliebiger Static-Host). |
| `viewer/assets/` | Alle Assets + `manifest.json` (Felder: id, name, file, kind = avatar/model/environment, format, notes, default). |
| `bot/` | **KI-Bot**: Chat mit beliebigem OpenAI-kompatiblen LLM (Streaming), Emotions-Tags `[happy]` → Gesichtsausdruck, Browser-TTS oder `/audio/speech`, Lippensync (Text-Visemes + Lautstärke), Blinzeln, Blickfolge, Webhooks (HMAC-signiert, Retry, Dead-Letter-Queue), GTAO/Bloom/SMAA. Quelle `src/app.js`, `src/webhooks.js`; Build `npm install && npm run build`; Test `node test.mjs out.png` (mockt das LLM). |
| `pipeline/` | Bau-Pipeline (Python/Blender 5.2 als `bpy`-Modul + MPFB/MakeHuman CC0 + VRM-Add-on saturday06). Briefing/Regeln: `BRIEFING.md`. |
| `colab/` | GPU-Notebook: Referenzbild → TRELLIS.2 → UniRig → VRM (braucht L4/A100 oder HF-Account). Nicht auf GPU getestet. |
| `previews/` | Renderings (aktueller Avatar, Ausdrücke, Klinikum). |
| `references/` | Character Sheets (Researcher-Outfit, Formen/Orb, INK) + Referenzbild. **Maßgeblich für das Aussehen.** |

## Assets (siehe `viewer/assets/manifest.json`)
1. **`alice_v1.1_alpha.vrm` – aktueller Hauptavatar.** VRM 1.0, ~14,7 MB. Basis: fotorealistischer Avaturn-Körper aus
   `Zweeback/alicealpha` (`public/avatars/candidates/model.fbx`, Herkunft im Repo nicht dokumentiert, Identität dort als „unverified“ markiert).
   Bearbeitet: Iris → Türkis, Outfit-Textur → schwarz (Sneaker weiß), Expressions neu: 18 Presets (happy/angry/sad/relaxed/surprised,
   blink(L/R), aa/ih/ou/ee/oh, look*) + 69 Custom (Alice-Emotionen curious/thinking/excited/serious/confused/playful/smirk + alle 52 ARKit + Visemes).
   Skelett: 73 Knochen (Mixamo-artig), Humanoid inkl. Augen. **Keine Spring-Bones.**
2. `alice_v1.0_alpha.vrm` – wie 1., Original-Outfit (weißes T-Shirt, Jeans).
3. `alice_selfbuilt_v0.10.vrm` – Eigenbau (MPFB): **hat Laborkittel, Dutt-Haare, schwarzen Anzug, Sneaker, 92 Spring-Bones, 67 ARKit/Viseme-Keys**;
   Gesicht/Haar wirken künstlicher. Quelle für Kittel/Haar.
4. `alice_designsheet_stylized.vrm`, `alice_trellis_raw.glb` – ältere Kandidaten aus dem Repo (stilisiert bzw. ungeriggt).
5. **`klinikum_dortmund_lod2.glb` – BESTE Klinikum-Szene: amtliche NRW-LoD2-Gebäude (1271, echte Dachformen) + amtliches Luftbild auf Dächern und Gelände**, 720×720 m, Generator `pipeline/build_klinikum_lod2.py NRW_DIR OUT.glb` (braucht LoD2-GML-Kacheln `LoD2_32_392/393_5706/5707_1_NW.gml` von opengeodata.nrw.de + `dop.png` aus WMS `nw_dop_rgb`). Lizenz dl-de/zero-2-0 (frei, keine Namensnennungspflicht). Fassaden generisch.
   **`klinikum_dortmund_osm.glb`** – Klinikum Dortmund Mitte aus echten OpenStreetMap-Daten** (Grundrisse, Geschosse, Straßen, Tram, Grün, Bäume; 330 m Radius um Beurhausstraße 40; Generator `pipeline/build_klinikum_osm.py MAP.osm OUT.glb`; Daten © OpenStreetMap-Mitwirkende, ODbL 1.0 – Attribution Pflicht). Fassaden sind generisch.
6. `klinikum_dortmund.glb` – ältere, frei erfundene stilisierte, frei interpretierte Krankenhaus-Szene (Bettenhaus-Hochhaus, Flachbauflügel,
   Glas-Eingangshalle, Notaufnahme-Vordach, Hubschrauberlandeplatz, Vorplatz, Parkplatz). **Keine exakte Nachbildung, kein Logo.** 1 Einheit = 1 m. Generator: `pipeline/build_klinikum.py`.

## Weitere Kartenquellen (geprüft)
- Geobasis NRW (opengeodata.nrw.de): LoD2 CityGML, DOP 10 cm, DGM1 Gelände, 3D-Mesh – frei (dl-de/zero). Empfohlen.
- Google Photorealistic 3D Tiles (Map Tiles API, API-Key, Lizenz verbietet Export/Offline-Speichern → nur live im Browser via 3DTilesRenderer/Cesium).
- Apple Maps: kein Export/keine 3D-Rohdaten.
- OpenStreetMap (ODbL, Attribution Pflicht).
- Nutzer-Datei `dortmund.glb` (Sketchfab, roman-permyakov, CC-BY 4.0, 143 MB) – nicht im Bundle, Attribution nötig.

## Was am dringendsten fehlt (Priorität)
1. **Laborkittel auf dem v1.1-Körper** (weiß, lang, Kapuze, Harness, Taschen, Teal-Leuchtmodule, A-im-Kreis-Patch, Teal-Anhänger am Hals).
   Versuch per Mesh-Übertragung aus v0.10 (`pipeline/graft_coat.py`) **gescheitert** (Kittel zu weit, Körper sticht durch) –
   neu in Blender direkt am v1.1-Körper modellieren/anpassen (Shrinkwrap + Puffer, Säume mit Stoffdicke, Gewichte vom Körper übertragen, Spring-Bones auf Schößen/Kapuze).
2. **Haare: hoher, unordentlicher roter Dutt mit losen Strähnen** (statt offener Haare), Hair Cards in Schichten, Spring-Bones.
3. **Haut-Textur 2K+** mit sichtbaren Sommersprossen (aktuell 1K).
4. Bot: Ruhepose/Gesten auf das 73-Knochen-Rig abstimmen; VRMA-Animationen; stärkere Idle-Bewegung.
5. Sidekick **INK** (Schattenkatze, leuchtende türkise Augen, Modi: standard/kraken/pixel/vortex/fire/shark-plush) und Orb-Zustände – noch nicht gebaut.

## Bekannte Fallstricke
- `pipeline/vrm_optimize.py`: Morph-**NORMAL**-Targets müssen erhalten bleiben (früherer Bug → brauner Fleck beim Blinzeln). Ist behoben (sparse statt gelöscht).
- Headless-Tests: Chromium mit `--use-angle=swiftshader`; Canvas per `toDataURL` abgreifen (Seiten-Screenshot kann bei Dauer-Renderloop hängen). Viewer hat `?test=1&lite=1`.
- Hugging-Face-ZeroGPU-Spaces (TRELLIS.2 etc.) blocken anonyme Aufrufe aus Rechenzentren → eigenen HF-Account/Token oder Colab-GPU nutzen. Hunyuan3D-Lizenz schließt die EU aus → nicht verwenden.
- VRM-Meta: Autor „Ben (Bentropie)“, avatarPermission onlyAuthor, personalNonProfit, keine Weitergabe/Änderung durch Dritte.

## Regeln des Nutzers / Projekts
- Nutzer will Ergebnisse, nicht Rückfragen; arbeitet nur mit Cloud-Tools (Colab, Codespaces, GitHub, Browser).
- Repo-Regeln (`Zweeback/alicealpha/AGENTS.md`): deutsche UI, keine Provider-Keys im Browser/Repo, Memory nur mit Bestätigung, ehrliche Fallback-Kennzeichnung,
  keine Abhängigkeits-/Exklusivitäts-Dynamik, keine Bewusstseins-Behauptungen.
- Keine Gesichter echter Personen nachbauen; Referenzbilder mit realen Personen nur als Stimmungs-/Stilreferenz.

## Lizenzen
Klinikum-LoD2-Szene: Geobasis NRW, dl-de/zero-2-0.
Kartendaten Klinikum-Szene: © OpenStreetMap-Mitwirkende, ODbL 1.0.
MakeHuman/MPFB-Assets CC0 (Code GPL); ARKit-Faceunits/Visemes CC0; three.js MIT; three-vrm MIT; Avaturn-Basis: Nutzungsbedingungen von Avaturn beachten.
