# Alice — Große Motoren-Interferenz (2026-10-10)

## Ziel / End-to-End-Datenweg

`Nutzereingabe → TurnCoordinator → PersonaRuntime → Speech/TTS → onStart → PerformancePlan → AliceWorld → stop/interrupt`

Die Module sind ausdrücklich **nicht** gleichzusetzen:
- `src/core/turnCoordinator.js`: genau ein gültiger Antwort-Turn; alte Provider-Antworten können danach keine Stimme auslösen.
- `src/core/runtime.js`: vorhandener Chatrouter / WebGPU / lokale Persona; abgebrochene Fetches sind kein normaler Offline-Fallback.
- `src/core/voice.js`: Browser-Sprachausgabe, optionale Remote-TTS, Unterbrechung. Die Nutzermikrofon-Energie darf Alice nicht als eigenes Sprechen animieren.
- `src/core/performance.js`: gesprochener Text → zeitlich begrenzter Gestenplan.
- `src/xr/AliceWorld.js`: Sichtkörper (Procedural / VRM / GLB) und Rendering; Animation ab onStart, Stop ab onEnd / Cancel.
- `src/xr/avatarCatalog.js`: Auswahl des Körpers unabhängig vom Sprachmotor; ungeprüfte Kandidaten nur explizit.
- `src/core/companion.js`: lokaler Verlauf und Kontinuität; keine automatische Synchronisation zu einem anderen Konto.

## Direkt nach Start

- `/?visual=3d`: prozedurales, animiertes Alice-Modell – sicherer Default.
- `/?avatar=trellis&visual=3d`: vorhandener TRELLIS-GLB-Kandidat, mit begrenzten Vollkörperbewegungen; **keine Facial Rigging / Viseme-Garantie**.
- `/?visual=portrait`: Referenzbild zum Identitätsvergleich.
- `Stimme testen`: deterministischer deutscher Satz via Browser-TTS, kein bezahlter KI-Schlüssel erforderlich.

## Akzeptanzprüfungen

- Test / Build / Node-Health: `npm run test:run`, `npm run build`, `npm run server`.
- GitHub-Workflow `avatar-candidate-smoke.yml` testet Mobile-Chromium, GLB-Ladevorgang, visuelle Modi und die Stimmprobe; lädt Screenshots als Actions-Artefakte hoch.
- Tests `turnCoordinator.test.js`, `runtimeCancellation.test.js`, `voiceMotor.test.js` für Unterbrechungs- und Sprachausgabegrenzen.

## Evidenzgrenzen

- **TESTED** bedeutet CI-/Headless-Browser-Prüfung. Es bedeutet nicht: persönliche Android-Gerätetests, fehlerfreie Offline-TTS für jeden Browser oder unabhängige 3D-Identitätsabnahme.
- Die zehn Benutzer-Videos wurden nicht in ein öffentliches GitHub-Repository übertragen.
- Der TRELLIS-Avatar gilt laut `public/avatars/alice-trellis.json` als Kandidat ohne Rig; sein Modell wurde nicht stillschweigend genehmigt.
- Die vorhandene Render-Hauptinstanz deployt `main`. Änderungen dieses Entwicklungsbranches dürfen nicht als Live-Hauptdeployment ausgegeben werden.
- Echtzeit-WebRTC und Remote-TTS benötigen laufenden Backend-Dienst und gegebenenfalls gültige Drittanbieter-Konfiguration.
- PR #112 bleibt bis zur menschlichen visuellen Abnahme als **Draft** offen, ohne Auto-Merge.

## Bewusst nicht behauptet

Kein Nachweis einer fertig geriggten Alice mit authentischer Mund-Synchronisierung, produktiver Langzeitspeicherung, globalem Google-Drive-Scraper oder universeller Plugin-Verkabelung. Diese Grenzen dürfen nicht durch den Begriff `Interferenz` verwischt werden.
