# Alice Desktop-Gateway (v1, bewusst klein)

Alice kann Aktionen auf **einem gekoppelten Desktop** vorschlagen. Ausgeführt wird nur, was der Mensch **an diesem Desktop** im Client mit „ja“ freigibt. Der Server führt selbst nichts aus.

## Ablauf

```
Alice-UI (?viewer=vrm)  --POST /api/desktop/proposals-->  Server (Queue + Journal)
Desktop-Client          --POST /api/desktop/client/next (Bearer-Token)-->  Vorschlag
Mensch am Desktop       --ja/nein-->  Client  --decision + payload_sha256-->  Server
Client führt aus        --result (succeeded|failed, Beobachtung)-->  Server
```

## Erlaubte Aktionen (fest, nicht per Payload erweiterbar)

| Aktion | Wirkung | Grenzen |
|---|---|---|
| `url.open` | Link im Standardbrowser | nur `https:`, keine Zugangsdaten in der URL, ≤ 2048 Zeichen |
| `clipboard.write` | Text in die Zwischenablage | ≤ 2000 Zeichen, passwort-/token-ähnliche Inhalte abgelehnt |
| `note.show` | Notiz im Client-Terminal | ≤ 2000 Zeichen |

Es gibt **keine** Shell-, Datei-, Prozess- oder Browser-Automationsaktion. Der Client startet ein festes Programm je Plattform ohne Shell (`rundll32 url.dll,FileProtocolHandler` / `open` / `xdg-open`; `clip.exe` / `pbcopy` / `xclip`).

## Provenienz-Journal

Jeder Schritt wird hash-verkettet (`prev_hash` → `hash`, SHA-256) mit UTC-Zeitstempel, Akteur und Evidenzklasse protokolliert:

- `asserted` – Angabe des Vorschlagenden (Begründung, Quelle) – ungeprüft
- `observed` – vom Server selbst geprüft (Zustellung, Ablauf, Hash-Abgleich)
- `reported` – vom gekoppelten Client gemeldet (menschliche Entscheidung, Ausführungsergebnis)

Freigabe und Ergebnis müssen den `payload_sha256` des Vorschlags wiederholen. Nicht zugestellte Vorschläge verfallen nach 10 Minuten (`ALICE_DESKTOP_PROPOSAL_TTL_MS`). Das Journal liegt in v1 **nur im Arbeitsspeicher** und ist nach einem Server-Neustart weg.

## Zugänge (zwei getrennte Bearer-Tokens)

| Variable | Wer nutzt sie | Darf |
|---|---|---|
| `ALICE_DESKTOP_PROPOSER_TOKEN` | wer Alice Vorschläge machen lässt (UI-Sitzung) | Vorschläge einreichen, eigene Vorschläge/Journal lesen, vollständigen Status lesen |
| `ALICE_DESKTOP_CLIENT_TOKEN` | nur der lokale Desktop-Client | Vorschläge abholen, Entscheidung und Ergebnis melden |

Beide müssen gesetzt, mindestens 16 Zeichen lang und **verschieden** sein, sonst bleibt das Gateway aus (`reason` im Status). Ohne gültigen Vorschlags-Zugang gibt `/api/desktop/status` nur `enabled`, `reason`, die Aktionsliste und `client.connected` zurück – keinen Client-Namen, keine Zähler, keinen Journal-Hash. Vorschläge und deren Inhalte (z. B. Zwischenablage-Text) sind nur mit dem Vorschlags-Zugang lesbar.

Im VRM-Viewer wird der Vorschlags-Zugang in ein Passwortfeld eingegeben und **nur im Arbeitsspeicher der Seite** gehalten (kein localStorage, keine URL, kein Log); nach Neuladen ist er weg. Der Client-Token gehört nie in den Browser. Mutierende Routen verlangen `application/json`; Cross-Site-Anfragen aus fremden Browser-Seiten scheitern am fehlenden Token bzw. an fehlenden CORS-Headern.

## Einschalten (lokal)

```bash
# Server – Tokens nur lokal erzeugen, nie committen, nie in Chats kopieren
export ALICE_DESKTOP_GATEWAY=1
export ALICE_DESKTOP_CLIENT_TOKEN="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
export ALICE_DESKTOP_PROPOSER_TOKEN="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
npm run build && npm run server

# Desktop-Client auf dem Rechner, der handeln soll (nur der Client-Token)
ALICE_DESKTOP_CLIENT_TOKEN=... node tools/alice-desktop-client.mjs --server http://127.0.0.1:8787 --human benjamin
# --dry-run: nur anzeigen, Ergebnis wird als "failed (dry-run)" gemeldet
```

Begründung und Quelle eines Vorschlags sind **Angaben des Absenders** (`source.verified: false`), keine verifizierte Identität.

## Speicher und Aufbewahrung

Alles liegt nur im Arbeitsspeicher und ist nach einem Neustart weg. Abgeschlossene Vorschläge: höchstens 50; Journal: höchstens 500 Einträge. Beim Kürzen bleibt `journal_anchor` (Hash vor dem ältesten behaltenen Eintrag), damit der verbleibende Teil prüfbar bleibt. Das ist **kein** dauerhaftes oder projektübergreifendes Provenienz-Register.

## Bewusst nicht enthalten

OpenClaw-Anbindung, Modell-/Tool-Calls, die selbst Vorschläge erzeugen, persistente Journale, Mehrbenutzer-Freigaben, Dateizugriff. Diese bauen auf demselben Vertrag auf und brauchen eigene Prüfung.

## Reifegrad

Getestet mit Unit- und HTTP-Tests sowie einem lokalen Smoke-Test. Nicht für den öffentlichen Produktivbetrieb geprüft: keine Token-Rotation, kein Audit-Export, keine Mehrbenutzer-Rollen, keine Ratenbegrenzung pro Token (nur pro IP), nicht auf Windows/macOS ausgeführt.
