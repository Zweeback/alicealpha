# ALICE n8n Chat-/Android-/API-Bruecke 0.1

## Nachgewiesen / Grenzen
- Der Quellcode und das Workflow-JSON sind erzeugt und lokal strukturell geprueft.
- Es besteht **noch keine Live-Verbindung zu n8n**, Android, oder anderen ChatGPT-Konversationen.
- Vercel-Projekt `zweeback-agent-bus` existiert; es wurde hier **nicht** veraendert.
- **ChatGPT-Verlauf ist keine OpenAI-API-Ressource**. Andere bestehende ChatGPT-Chats werden nicht automatisch ausgelesen; Inhalte koennen nur mit explizitem Import/Teilen in diese Bruecke gelangten.

## Import in n8n
1. Datei `ALICE_n8n_chat_android_api_bridge.json` in n8n als Workflow importieren.
2. Im Knoten `Authenticated Webhook` unter **Header Auth** ein eigenes n8n-Header-Auth-Credential anlegen und zuweisen (keinen Schluessel im Chat oder GitHub posten).
3. Webhook-Test mit Operation `health`; anschliessend erst Workflow veroeffentlichen, um `/webhook/alice-context-bridge-v1` zu nutzen.
4. Nur bewusst freigegebene, nicht vertrauliche Kurznotizen uebertragen. Niemals komplette Chatverlaeufe, Gesundheitsdaten, Passwoerter oder Zahlungsinformationen hochladen.

## POST Beispiele (JSON-Body, Auth-Header separat im n8n-Credential)

```
{"operation":"health"}
{"operation":"catalog"}
{"operation":"publish","event_id":"demo_20261022_0001","source":"android","channel":"alice","note":"Testnotiz ohne persoenliche Daten","user_approved":true}
{"operation":"list","channel":"alice","limit":10}
```

Nur `health`, `catalog`, `publish`, `list` sind erlaubt. Keine Fernausfuehrung, keine API-Schluessel-Erzeugung, keine automatischen ChatGPT-Lesezugriffe.

## Persistenzhinweis
Pilot verwendet n8n `workflow static data`, maximal 30 Notizen / 1200 Zeichen pro Notiz. Laut n8n experimentell, bei vielen Ausfuehrungen nicht zuverlaessig; nur in aktiven Produktions-Workflows persistent, nicht im Testlauf. Spaeter mit privaten n8n Data Tables oder Datenbank ersetzen, bevor persoenliche Daten betroffen sind. Ein Auth-Credential ist bei Aktivierung zwingend erforderlich.

## API-Management
Zulaessiger erster Schritt ist eine **Metadaten-Registry** (`catalog`) ohne Zugangsschluessel. API-Keys gehoeren in n8n Credentials / sichere Cloud-Umgebungsvariablen, niemals in GitHub oder den Chat. n8n verwaltet _seine_ API-Zugriffe, aber nicht automatisch Zugriff auf alle anderen ChatGPT-Chats.

## Android
Die bisherige ALICE-Geraetebruecke bleibt getrennt. Sie soll **nicht** durch ein oeffentliches GitHub-command.json mit sensiblen Zugriffen erweitert werden. Bei spaeterer Integration braucht das Android-Geraet einen privaten, authentifizierten HTTPS-Kanal und lokale Berechtigungsfreigabe.