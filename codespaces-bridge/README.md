# ALICE Private GitHub Codespaces Bridge

**Stand: 2026-10-19.** Eigenständiger MCP-Dienst, der aus dem Feature-Branch deployed wird. Er ist **keine** Änderung am nativen GitHub-Connector von OpenAI.

## Bereits eingerichtet

- GitHub-Source: `codespaces-bridge/server.mjs`.
- Sicherheits- und Protokolltests: `.github/workflows/codespaces-bridge-test.yml`.
- Separater Render-Dienst (Free, Frankfurt): https://alice-codespaces-mcp.onrender.com/health
- Render-Konfiguration: https://dashboard.render.com/web/srv-dbapdecs728c7395jd1g
- Privates ChatGPT-Plugin: https://chatgpt.com/plugins/plugins_6ad59730f9e8819181b725cf1d2e10db
- Zuerst nur Repository `Zweeback/alicealpha` zum **Anlegen** freigegeben.

## Einmalige GitHub-Freigabe (Benutzeraktion)

Der schon verbundene native GitHub-Connector kann sein OAuth-Token nicht an diesen externen MCP-Dienst weiterreichen. Der private Dienst benötigt **eine eigene GitHub-Autorisierung**.

1. Im eigenen GitHub-Konto über https://github.com/settings/personal-access-tokens/new einen **fine-grained PAT** mit möglichst kurzer Laufzeit erzeugen. Resource owner: das eigene GitHub-Konto. Repository access: **Only select repositories → `Zweeback/alicealpha`**.
2. Für vollständigen Codespaces-Lebenszyklus die minimal benötigten Codespaces-Rechte freigeben: `Codespaces` (Read/Write), `Codespaces metadata` (Read), `Codespaces lifecycle admin` (Read/Write) soweit GitHub dies für die gewünschte Operation fordert. Die Benutzeroberfläche bzw. GitHub-Dokumentation ist maßgeblich.
3. Im Render-Dienst unter **Environment** das Secret `GITHUB_CODESPACES_TOKEN` mit diesem Token hinterlegen. **Niemals das Token im Chat senden, in GitHub committen oder im Plugin-Manifest veröffentlichen.**
4. Das persönliche ChatGPT-Plugin über den Link oben öffnen und installieren/verbinden. Auf Nachfrage `codespaces_status` ausführen. Bei `connected: true` folgt `codespaces_list`.
5. `ENABLE_REMOTE_EXEC` bleibt standardmäßig `false`. Remote-Kommandos erst nach separater ausdrücklicher Freigabe erlauben. Auch bei aktiviertem Schalter wird jede Ausführung nur mit exakter Einzelbestätigung entgegengenommen.

## MCP-Fähigkeiten

| Tool | Aktion | Zusätzliche Freigabe |
|---|---|---|
| `codespaces_status` | Diagnose, keine Secrets | Bridge-Key |
| `codespaces_list` | Codespaces lesen | GitHub-Token |
| `codespaces_get` | Details lesen | GitHub-Token |
| `codespaces_machines` | Maschinentypen lesen | GitHub-Token |
| `codespaces_create` | Codespace anlegen | Zielbezogene CREATE-Bestätigung |
| `codespaces_start` | Starten (mögliche Kosten) | Zielbezogene START-Bestätigung |
| `codespaces_stop` | Stoppen | Zielbezogene STOP-Bestätigung |
| `codespaces_delete` | Unwiderruflich löschen | Zielbezogene DELETE-Bestätigung |
| `codespaces_exec` | Ausschließlich erlaubte Kommandos | Eigener Schalter + EXEC-Bestätigung |
| `codespaces_exec_status` | Ausführungsergebnis und begrenzte Ausgabe | Authentifizierung |
| `codespaces_exec_cancel` | SSH lokal abbrechen (best effort) | CANCEL-Bestätigung |

**Berechtigungen:** Für die GitHub-REST-API gelten https://docs.github.com/en/rest/codespaces/codespaces und https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens .

**Kosten:** Render-Webservice mit `plan=free` erstellt. GitHub Codespaces können beim Starten/Erstellen gesondert abgerechnet werden. Keine Codespaces wurden automatisch angelegt oder gestartet.

**Sicherheit:** Der MCP-Endpunkt ist über einen nur im privaten Plugin und im Render-Environment konfigurierten Brückenschlüssel gesichert. Der GitHub-Zugriff ist optional und bei fehlendem Token deaktiviert. Kommandoausführung ist gesondert gesperrt, die erlaubten Aufrufe werden ohne Shell ausgeführt und zeitlich/bezüglich Ausgabe begrenzt. Kein universeller Shell-Executor.

**Einschränkungen:** Die Tests simulieren GitHub-REST-Zugriffe. Ein echter Codespace kann erst nach der oben genannten GitHub-Autorisierung geprüft werden. Die Ausführungsunterbrechung kann nicht garantieren, dass alle über SSH gestarteten Remote-Teilprozesse beendet werden.
