# ALICE v6 – realistische VRM-Pipeline (MPFB-Basis) – Studio-Briefing

Ziel: Alice (AI Researcher / Field Analyst) als **hochwertiges, realistisches, voll geriggtes VRM 1.0** für einen eigenen AI-VR-Bot
(Amica/AIRI/three-vrm, später VRChat-Konvertierung). Qualitätslatte: sieht neben den Referenzbildern **nicht billig/prozedural** aus.
Die alte prozedurale Pipeline (skeleton.py, body_researcher.py, …) ist **tot** – nicht benutzen. Alles Neue liegt in `mh/`.

## Referenzen (ansehen mit Read!)
- `/mnt/user-data/attachments/ba6ce5eb-0729-5bb9-9dab-f777d50aa901/77e88a4f-image.png` – **Haupt-Referenz Researcher**: Front/Seite/Rücken, Details (Patch, Pendant, Gürtel, Beinmodul, Schuhe, Stoffe)
- `…/447993e5-image.png` und `…/870aebc0-image.png` – Researcher-Sheets (Turnaround, Ausdrücke, Outfit-Details)
- `…/ca4e6eb6-image.png` – News-Anchor-Variante (Brille, schwarzer Blazer) – später
- `/home/claude/alice_vrm/ai/alice_front_ref.png` – freigestellte Front-Figur
Look: realistisch-stilisiert (wie hochwertiges Game-Cinematic), rote Haare (kupfer/feuerrot), chaotischer hoher Dutt, Sommersprossen, türkise Augen,
weißer langer Laborkittel mit Kapuze/Harness/Taschen/Tech-Modulen (cyan-teal leuchtende Akzente), schwarzer Tech-Anzug, chunky Sneaker.

## Koordinaten / Fakten (Blender, Meter, Z oben)
- Charakter schaut **-Y**, Charakter-links = **+X** (Bone-Suffix `_l`). Körpergröße 1,63 m, Augen z=1,52, Kopf-Bone `head` (0,-0.041,1.493)->(0,-0.035,1.63).
- Kopf-Verts (z>1.42): x ±0.088, y −0.162…0.046, z bis 1.629. Hals-Basis z≈1.37. Schulter-Gelenk (0.157,-0.021,1.283). Ellbogen (0.317,-0.025,1.109), Handgelenk (0.428,-0.163,0.987).
  Taille/Becken z≈0.85–0.92, Knie z≈0.46, Knöchel z≈0.07. Ruhepose in `core.blend` = **A-Pose** (Arme ~45° abwärts, Unterarme leicht nach vorn); der Export macht daraus T-Pose
  (alle Teile werden mit-konvertiert – ihr modelliert also in **A-Pose**).
- Rig `Alice_Armature` (game_engine): Root, pelvis, spine_01/02/03, clavicle_l/r, upperarm_l/r, lowerarm_l/r, hand_l/r, Finger (thumb/index/middle/ring/pinky _01.._03 _l/_r), neck_01, head, eye_l, eye_r, thigh_l/r, calf_l/r, foot_l/r, ball_l/r.
- `out/mh/core.blend` (NICHT überschreiben; nur lesen) enthält: `Alice_Armature`, `Alice_Body` (13 380 Verts, Haut, Gewichte, 67 Shape Keys), `Alice_Eyes`, `Alice_Brows`, `Alice_Lashes`, `Alice_Teeth`, `Alice_Tongue`.
  Neu bauen: `python3 mh/build_core.py out/mh/core.blend` (Besitzer: Lead; Gesichtsform eingefroren).

## Werkzeuge
- Blender 5.2 als Python-Modul: `python3 skript.py` (import bpy). Nutzt **kein** `-I` für eigene Skripte. VRM-Add-on: `blender/vrm_env.py` (`vrm_env.setup()`).
- **Cycles-Vorschau**: `mh/lock.sh python3 mh/preview.py DATEI.blend OUT_PREFIX --shots full,face,q34,bust --samples 16` (auch `.vrm`). Optional `--keys ARKit-Key=1,…`.
- **Echter Viewer (three-vrm, so sehen es Amica/AIRI & Co.)**: `mh/lock.sh node viewer/shot.mjs X.vrm OUT_PREFIX full,q34,back,face,head,bust "pose=relaxed&expr=happy:1"`
  Shots: full q34 side back bust face face34 head head34 headback headside. Extra: `pose=tpose|relaxed|hero`, `expr=blink:1,aa:0.7`, `bg=dark`, `sim=120`.
- **VRM-Export zum Testen**: `python3 mh/export_vrm.py --out out/mh/<dept>_test.vrm --parts out/mh/<dept>.blend [weitere.blend …]`
- **Validierung**: `node /tmp/claude-0/-home-claude/ba6ce5eb-0729-5bb9-9dab-f777d50aa901/scratchpad/validator/run.js X.vrm` (glTF-Validator, Ziel: 0 errors).
- Bilder ansehen: Read-Tool auf die PNGs. **Mindestens 3 Runden Render → kritisch mit Referenz vergleichen → verbessern.**
- **Schwere Jobs IMMER über `mh/lock.sh`** (2 CPU-Kerne, 7 GB RAM, mehrere Abteilungen parallel!). Cycles ≤ 24 Samples, Auflösung moderat, nie mehrere Blender gleichzeitig starten.
  Keine Hintergrundprozesse hinterlassen. Kein Netz außer GitHub/PyPI/npm/HuggingFace; CC0-Assets sind lokal unter `/root/.config/blender/5.2/extensions/.user/user_default/mpfb/data/` (Haare, Kleidung, Schuhe, Skins …, nur lesen; CC0).

## Part-Konvention (Abteilung → Integration)
Jede Abteilung liefert `out/mh/<abteilung>.blend` mit **Mesh-Objekten, deren Name mit `P_` beginnt** (z. B. `P_Hair`, `P_Coat`), in **Weltkoordinaten der A-Pose** (Objekt-Transform = Identität!),
und optional `out/mh/<abteilung>.json`:
```json
{"bones":[{"name":"hair_bun_01","head":[x,y,z],"tail":[x,y,z],"parent":"head","roll":0,"deform":true}],
 "springs":[{"name":"hair_bun","joints":["hair_bun_01","hair_bun_02"],"stiffness":0.8,"drag":0.4,"gravity":0.05,"hit_radius":0.01}],
 "colliders":[{"name":"c_head","bone":"head","type":"sphere","offset":[0,0,0.06],"radius":0.1}],
 "body_remove_verts":[ Indizes in Alice_Body, die vollständig unter der Kleidung liegen (werden vor Export gelöscht) ]}
```
- Gewichte: Vertex-Gruppen **mit Bone-Namen** (Kern-Bones oder eure neuen JSON-Bones). Armature-Modifier braucht ihr nicht (wird ergänzt). Max. 4 Einflüsse pro Vertex.
- Keine Fremd-Objekte in der Datei exportieren (die Integration lädt nur `P_*`-Meshes; Armature/Body dürfen als Hilfsobjekte in der Datei liegen).
- Materialien **nur über `mh/mats.py`** (`mats.pbr(name, tex=…, rough=…, alpha='OPAQUE|BLEND|MASK', tint=…, emit=…, normal=…, double_sided=…)`): einfaches Principled-BSDF, exportiert als glTF-PBR.
  Keine eigenen Node-Gruppen/Prozedural-Texturen im Material: **Texturen als PNG backen/generieren** (numpy/PIL, max 2048², Haar/Stoffe ggf. 1024², `im.pack()`), Pixel in sRGB.
  Material-Namen mit Präfix der Abteilung (`Hair_…`, `Coat_…`, `Under_…`). Alpha: `BLEND` für Haar-Wisps/Strümpfe, `MASK` für harte Cutouts.
- Budget gesamt Alice ≲ 120k Tris (Körper+Gesicht ≈ 37k): Haar ≲ 25k, Kittel+Harness ≲ 30k, Unterlage+Schuhe+Gadgets ≲ 30k. Normale glatt, Faces sauber (keine Doppelflächen, keine Löcher), alle Maße in Metern.
- Abstände: Haut → Anzug ≥ 2 mm, Anzug → Kittel ≥ 8 mm (Torso) / Ärmel ≥ 12 mm Radius-Zuschlag, Haar → Kopfhaut 1–3 mm.

## Eigentümer-Regeln (keine Konflikte!)
- Haar-Abteilung: `mh/dept_hair.py`, `mh/hair_*.py`, `out/mh/hair.*`   | Kittel: `mh/dept_coat.py`, `mh/coat_*.py`, `out/mh/coat.*`
- Unterlage: `mh/dept_under.py`, `mh/under_*.py`, `out/mh/under.*`    | Face: `mh/core_materials.py`, `mh/expressions.py`, `mh/face_*.py`, `out/mh/face.*`
- Nicht ändern: `mh/build_core.py`, `mh/export_vrm.py`, `mh/mats.py` (Lead) – Änderungswünsche als Notiz in euer Abschlussreport. Fehler dort bitte melden statt lokal patchen.
- **Nie den User fragen.** Entscheidungen selbst treffen, kurz dokumentieren (`out/mh/notes_<abteilung>.md`, max. 25 Zeilen: was gebaut, Parameter, bekannte Mängel).
- Abschlussmeldung (kurz!): Dateien, Tri-/Vertexzahlen, Testexport OK?, die 2–3 größten Restmängel.

## Profi-Regeln (aus Reallusion „CC Asset Developer Guide", verbindlich ab jetzt)
**Kleidung (Kittel, Anzug):**
- Topologie an Körper-Kantenfluss anlehnen an Brust, Schritt, Schultern, Ellbogen, Knien, Achseln (dort wird gebogen). Teile eines Outfits dürfen sich im statischen Modell **nie schneiden**.
- Offene Ränder (Kragen, Saum, Manschette, Kapuzenrand) brauchen **sichtbare Dicke**: einseitig dick oder doppelseitig dick; **nie doppelseitig dünn**. Flatternde Teile (Kittelschöße) einseitig dünn + `double_sided=True`.
- **Puffer zur Haut** (s. Abstände oben) besonders an Brust/Hüfte/Gesäß – Test in `pose=hero` + Extremposen.
- Gewichte vom Körper übertragen (nearest face interpolated), danach glätten; Testpose prüfen.
- UV aufrecht/einheitlich von vorn; Nähte = echte Stoffnähte (Schulter, Seiten). Texturen 1024², max 2048² (1:1 oder 2:1). Normal-Map pro UV-Insel, keine Insel-übergreifenden Details.
**Haare (Hair Cards):**
- Zuerst **Kopfhaut-Kappe** (Kopf-Mesh kopieren, leicht aufblasen, gleichmäßige UV, dunklere Diffuse als Strähnen = Okklusion, Opacity-Ränder weich), keine Physik auf der Kappe.
- Strähnen in **3–6 Schichten innen→außen**, kleiner Abstand zwischen Schichten; innen breitere/dichtere, außen dünnere/lichtere Strähnen. Wurzel **in** der Kappe verankert, nie schwebend. Wurzel mit mehr Unterteilungen (runde Biegung).
- Strähnen-UV senkrecht, ≥10 px Abstand zwischen Inseln, gleiche Strähnentypen überlagern (Texturplatz sparen). Opacity hart/kontrastreich, Diffuse mit farbigem Hintergrund (kein Schwarz an Kanten → keine dunklen Säume).
- Budget ≤ 10k Quads (≈ 20k Tris). Spring-Bones nur auf Strähnen, nicht an der Wurzel (Wurzelzone fix).
**Allgemein:** Namen eindeutig mit Abteilungs-Präfix; Texturen so klein wie vertretbar (Realtime/Web).
