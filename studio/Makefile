# ALICE 3D Studio – alles per Befehl (KI-tauglich). Aufruf aus dem Repo-Root: make -C studio <ziel>
SHELL := /bin/bash
export ALICE_FACEUNITS := vendor/func
export ALICE_SCRATCH := /tmp/alice_scratch
PY := python3
SRC_AVATAR ?= ../public/avatars/alice-fbx-source.vrm
LAT ?= 51.50836
LON ?= 7.45674
HALF ?= 360
NAME ?= klinikum_dortmund
SHOTS ?= full,q34,face
EXPR ?= happy:0.4

.PHONY: help alice check shots klinikum rtw scene viewer core clean
help:
	@echo "make alice            – Alice v1.1 aus dem Repo-Avatar bauen (Expressions, türkise Augen, schwarzes Outfit) -> out/alice.vrm"
	@echo "make check            – glTF-Validator + Screenshots von out/alice.vrm (SHOTS=$(SHOTS) EXPR=$(EXPR)) -> out/shots/"
	@echo "make klinikum         – Ort aus amtlichen NRW-Daten (LoD2 + Luftbild): LAT=.. LON=.. HALF=360 NAME=.. -> out/env/NAME_lod2.glb"
	@echo "make rtw              – Rettungswagen -> out/env/rtw_rettungswagen.glb"
	@echo "make scene            – Cycles-Render: Alice + RTW vor der Szene -> out/shots/scene_*.png"
	@echo "make viewer           – Asset-Viewer starten (Port 4173)"
	@echo "make core             – Eigenbau-Körper (MPFB/MakeHuman CC0) neu bauen -> out/mh/core.blend (langsam)"

out/alice.vrm: $(SRC_AVATAR) mh/avaturn_vrm_upgrade.py mh/avaturn_eyes_teal.py mh/avaturn_outfit_black.py
	mkdir -p out/tmp out/mh
	$(PY) mh/avaturn_vrm_upgrade.py $(SRC_AVATAR) out/tmp/a1.vrm
	$(PY) mh/avaturn_eyes_teal.py out/tmp/a1.vrm out/tmp/a2.vrm
	$(PY) mh/vrm_optimize.py out/tmp/a2.vrm out/tmp/a2o.vrm --small eye,teeth
	$(PY) mh/avaturn_outfit_black.py out/tmp/a2o.vrm out/tmp/a3.vrm
	$(PY) mh/vrm_optimize.py out/tmp/a3.vrm $@ --small eye,teeth
alice: out/alice.vrm

check: out/alice.vrm
	cd viewer && node validate.cjs ../out/alice.vrm | head -3
	mkdir -p out/shots && node viewer/shot.mjs out/alice.vrm out/shots/alice $(SHOTS) "pose=relaxed&expr=$(EXPR)&sim=40"
shots: check

klinikum:
	$(PY) tools/fetch_nrw.py data/nrw_$(NAME) --lat $(LAT) --lon $(LON) --half $(HALF)
	mkdir -p out/env && $(PY) mh/build_klinikum_lod2.py data/nrw_$(NAME) out/env/$(NAME)_lod2.glb $(HALF)

rtw:
	mkdir -p out/env && $(PY) mh/build_rtw.py out/env/rtw_rettungswagen.glb

scene: out/alice.vrm rtw
	[ -f out/env/klinikum_dortmund_lod2.glb ] || $(MAKE) klinikum
	mkdir -p out/shots && $(PY) mh/render_scene.py out/shots/scene 42 -147 90 36 -151 0

viewer:
	node ../exploration/viewer/serve.mjs 4173

core:
	mkdir -p out/mh && $(PY) mh/build_core.py out/mh/core.blend

clean:
	rm -rf out/tmp out/shots
