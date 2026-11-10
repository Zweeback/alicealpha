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

## Einschalten (lokal)

```bash
# Server (Token nur lokal erzeugen, nie committen)
export ALICE_DESKTOP_GATEWAY=1
export ALICE_DESKTOP_CLIENT_TOKEN="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
npm run build && npm run server

# Desktop-Client auf dem Rechner, der handeln soll (gleiches Token)
ALICE_DESKTOP_CLIENT_TOKEN=... node tools/alice-desktop-client.mjs --server http://127.0.0.1:8787 --human benjamin
# --dry-run: nur anzeigen, Ergebnis wird als "failed (dry-run)" gemeldet
```

Ohne beide Variablen meldet `/api/desktop/status` ehrlich `enabled: false` und alle anderen Gateway-Routen antworten mit `503`. Auf einem öffentlich erreichbaren Server kann jeder Besucher Vorschläge einreichen; ausgeführt wird trotzdem nur nach lokaler Freigabe.

## Bewusst nicht enthalten

OpenClaw-Anbindung, Modell-/Tool-Calls, die selbst Vorschläge erzeugen, persistente Journale, Mehrbenutzer-Freigaben, Dateizugriff. Diese bauen auf demselben Vertrag auf und brauchen eigene Prüfung.
