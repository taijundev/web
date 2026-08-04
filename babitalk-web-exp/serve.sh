#!/usr/bin/env bash
# Amplitude Web Experiment 테스트 페이지 로컬 서버.
# file:// 로 열면 localStorage 동작이 브라우저마다 다르고 Web Experiment
# 비주얼 에디터도 붙지 않으므로 http 로 서빙한다.
set -euo pipefail

PORT="${1:-4173}"
cd "$(dirname "$0")"

echo "http://localhost:${PORT}/  (Ctrl+C 로 종료)"
exec python3 -m http.server "$PORT"
