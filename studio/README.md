# ALICE 3D Studio (Codespace)

Blender + VRM-Pipeline in der Cloud, steuerbar per Befehl oder per KI (Copilot-Chat: „lies studio/AGENTS.md und …“).

**Starten:** GitHub → Code → Codespaces → „…“ → *New with options* → Branch `exploration/alice-assets`,
Konfiguration **„ALICE 3D Studio“**, Maschine 4 Kerne → Create. Die Einrichtung (`studio/setup.sh`) dauert ca. 10 Minuten.

**Danach im Terminal:**
```bash
make -C studio help
make -C studio alice check                      # Alice bauen + prüfen + Screenshots
make -C studio klinikum LAT=51.4884 LON=7.5103 NAME=hoerde   # beliebiger Ort in NRW, amtliche 3D-Daten
make -C studio scene                            # Alice + RTW vor dem Klinikum rendern
```
Lizenzen: MPFB (GPL-3, `vendor/mpfb-2.0.18.zip`), MakeHuman-Assets/Faceunits CC0, VRM-Add-on MIT, NRW-Geodaten dl-de/zero-2-0.
