#!/bin/sh
# Downloads the German GLaDOS Piper voice (de_DE-glados-medium, ~79 MB extracted).
# Original model: https://huggingface.co/systemofapwne/piper-de-glados
# sherpa-onnx package: k2-fsa/sherpa-onnx release "tts-models".
# Usage: sh tools/fetch_glados_piper.sh [target_dir]; then set ALICE_GLADOS_PIPER_DIR=<target_dir>/vits-piper-de_DE-glados-medium
set -eu
TARGET="${1:-voices}"
mkdir -p "$TARGET"
[ -f "$TARGET/vits-piper-de_DE-glados-medium/de_DE-glados-medium.onnx" ] && exit 0
curl -fsSL https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-de_DE-glados-medium.tar.bz2 \
  | python3 -c "import sys,tarfile;tarfile.open(fileobj=sys.stdin.buffer,mode='r|bz2').extractall(sys.argv[1])" "$TARGET"
