# Provenienz-Rekonstruktion: Plan und Roadmap

Ziel: ein dauerhaft überprüfbares Vergleichsregister für Chats, Ideen, Projekte und Artefakte (2023–2026).
Referenzwerte (nicht unabhängig validiert): 6.198 Chat-Metadatensätze, 3.385 eindeutige Chats, 137 Projektsignale, 446 ungeprüfte Kandidaten.

## Regeln
- Quellen nur lesend. Nichts verändern, verschieben oder löschen.
- Keine Zugangsdaten, Tokens oder Sitzungsdaten in Repo, Prompts oder Artefakten.
- Jeder Befund nennt Quelle und Hash. Ohne Beleg bleibt es Hypothese.
- Läuft in Google Colab (Drive wird dort vom Nutzer selbst autorisiert).

## Phasen
| Phase | Inhalt | Ergebnis / Abnahme |
|---|---|---|
| 1 Inventar | `tools/provenance/drive_inventory.ipynb` über den Drive laufen lassen | `register.sqlite` mit SHA-256, Größe, Zeitstempel; Fehlerliste |
| 2 Exporte sammeln | Exporte aus ChatGPT, Gemini (Takeout), Perplexity, NotebookLM-Quellen, Jules/GitHub-Verlauf in den Drive legen; SuperGrok und DeepSeek soweit exportierbar | Liste je Quelle: vorhanden / fehlt |
| 3 Dubletten | Mehrfachkopien über gleiche Hashes erkennen | Dublettenbericht |
| 4 Abgleich | 6.198 Metadatensätze gegen 3.385 Chats abgleichen (IDs, Titel, Zeit) | Tabelle: gefunden / fehlend / mehrdeutig |
| 5 Chronologie | 137 Signale datieren, erste Nutzeräußerung zuordnen | Zeitleiste mit Belegen |
| 6 Kandidaten | 446 Kandidaten gegen Originalquellen prüfen | je Kandidat: bestätigt / abgelehnt / offen |
| 7 Dauerbetrieb | Archivwächter prüft zusätzlich Hashes und Abdeckung, nicht nur Änderungszeiten | Lücken werden gemeldet und geschlossen |

## Offene Punkte
- Welche Exporte existieren tatsächlich? (Phase 2 klärt das.)
- VRM-Binärdateien fehlen im Repo; Freigabe nach PR #142 bleibt Voraussetzung.
