# Alice v0.5: Oberfläche, Bühne und Lippensynchronisation

Stand: 2026-11-11. Gilt für Branch `feat/alice-vrm-v0.5`.

## Was sich geändert hat

| Bereich | Vorher | Jetzt |
| --- | --- | --- |
| Hauptbundle | 1,17 MB (322 KB gzip) | 244 KB (79 KB gzip); three.js (702 KB) und three-vrm laden separat nach dem ersten Render |
| Schriften | Google Fonts per `@import` (externe Verbindung) | Instrument Serif und Instrument Sans, selbst gehostet über `@fontsource` (nur Latin, rund 100 KB) |
| Avatar-Bild | Ganzkörper, Gesicht klein | Brustbild: Kamera folgt dem Kopfknochen, Kopf ≈ ein Drittel der Höhe |
| Licht | Labor-Licht (Cyan/Amber) | Studio-Licht aus den Farben der Figur; Labor-Licht bleibt für prozeduralen Körper und GLaDOS |
| Mund | Takt-Näherung aus der Lautstärke | Vokal-Gewichte aus echtem Audio (LPC-Formanten F1/F2), Rückfall auf die Näherung |
| Ansichten | Drei beschriftete Knöpfe oben rechts | Ansichts-Menü unter dem Namen: Porträt, 3D-Avatar testen, eigenes Modell laden |

## Gestaltung

- Palette aus der Figur: Nacht `#0e0b14`, Dämmer `#1c1726`, Lavendel `#b9a6f0` (Jacke), Kupfer `#e0743f` (Haar), Augenblau `#8fc3e6`.
- Alices Worte in Instrument Serif, Bedienung in Instrument Sans. Sentence case, keine Schrift unter 12 px.
- Das eine große Element ist der Torbogen hinter Alice. Sein Licht folgt `--voice` (0 bis 1), das `AliceWorld` pro Frame ohne React-State auf den App-Container schreibt.
- Statusfarben pro Phase: Lavendel (hören), Augenblau (denken), Kupfer (sprechen), Rot (Fehler).

## Bühne (`src/xr/AliceWorld.js`)

- `#bustActive()`: gerigtes VRM, Desktop-Ansicht, nicht GLaDOS. Dann ist der Canvas transparent, der Raum ausgeblendet und das Studio-Licht aktiv (`canvas[data-stage="bust"]`).
- `#bustFrame()` rahmt relativ zur Kopfhöhe `h` (Kopfgelenk bis Scheitel). Breit: 3,9 h; schmal (Handy): 5,0 h.
- Kamera-Parallaxe zum Zeiger (maximal 6 cm seitlich), gedämpft.
- XR (AR/VR) behält Raum, Skalierung und Hintergrund wie zuvor.

## Lippensynchronisation (`src/core/lipSync.js`)

Aus dem Alice-Pipeline-Paket übernommen und getestet. Lautstärke steuert die Öffnung, LPC-Formanten wählen den Vokal.
Änderung gegenüber dem Original: LPC-Ordnung 10 statt 13. Bei hohen Grundtönen lieferten höhere Ordnungen Scheingipfel für F2 (Test mit synthetischen Vokalen, `tests/lipSync.test.js`).

Grenzen, ehrlich benannt:

- Das ist eine Näherung aus dem Audiosignal, keine Phonem-Erkennung und kein Wissen über den Text.
- Es ist nur an Echtzeit-Audio (WebRTC) angeschlossen. Die Browser-Sprachausgabe liefert keine PCM-Daten; dort greift weiter die Näherung aus Lautstärke und Takt.
- Validiert mit synthetischen Vokalen, nicht mit echter Sprache. Ein Hörtest mit der Live-Verbindung steht aus.

## Laden (`src/xr/lazyWorld.js`)

`createLazyWorld()` lädt `AliceWorld` erst nach dem ersten Render. Vor dem Laden werden Aufrufe verworfen; Präsenz und Darstellungsmodus werden gemerkt. Fehlt WebGL, lehnt `ready` ab, die Seite zeigt Porträt und Text (Rückfall wie bisher).
Der Service Worker cached inhaltsgehashte Dateien unter `/assets/` zuerst aus dem Cache; `/api/` und `/mcp` werden nie gecacht.

## Freigabe des 3D-Avatars

Standardansicht bleibt das Porträt: `canonicalAssetStatus: pending` und der Test „default avatar selection obeys the fail-closed character manifest“ halten das fest. Die Ansicht `?avatar=vrm` ist ein Kandidat. Die Freigabe ist eine Entscheidung des Besitzers; sie läuft über `provenance.approved` im Manifest, nicht über Code.
Die VRM-Metadaten der Datei (`allowRedistribution: false`, nur Autor) sollten vor einem öffentlichen Repository geprüft werden.
