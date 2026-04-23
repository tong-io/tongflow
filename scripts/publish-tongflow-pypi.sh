#!/usr/bin/env bash
# Build plugins/tongflow and upload sdist + wheel to PyPI (or TestPyPI).
#
# Usage (PyPI):
#   export TWINE_USERNAME=__token__
#   export TWINE_PASSWORD=pypi-xxxxxxxx
#   pnpm tongflow:publish
#
# TestPyPI:
#   export TWINE_USERNAME=__token__
#   export TWINE_PASSWORD=pypi-xxxxxxxx   # TestPyPI token
#   TONGFLOW_UPLOAD_TESTPYPI=1 pnpm tongflow:publish
#
# Requires: Python 3 with pip; script installs `build` and `twine` if missing (user venv recommended).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="${ROOT}/plugins/tongflow"

if [[ ! -f "${PKG}/pyproject.toml" ]]; then
  echo "Expected ${PKG}/pyproject.toml" >&2
  exit 1
fi

cd "${PKG}"
rm -rf dist build
rm -rf ./*.egg-info 2>/dev/null || true

python3 -m pip install -q --upgrade pip
python3 -m pip install -q build twine

python3 -m build
python3 -m twine check dist/*

if [[ -z "${TWINE_PASSWORD:-}" ]]; then
  echo "" >&2
  echo "Missing TWINE_PASSWORD. For non-interactive upload set:" >&2
  echo "  export TWINE_USERNAME=__token__" >&2
  echo "  export TWINE_PASSWORD=pypi-...   # from https://pypi.org/manage/account/token/" >&2
  echo "Then re-run: pnpm tongflow:publish" >&2
  exit 1
fi

if [[ -z "${TWINE_USERNAME:-}" ]]; then
  export TWINE_USERNAME=__token__
fi

if [[ "${TONGFLOW_UPLOAD_TESTPYPI:-}" == "1" ]]; then
  echo "Uploading to TestPyPI..."
  python3 -m twine upload --repository testpypi dist/*
else
  echo "Uploading to PyPI..."
  python3 -m twine upload dist/*
fi

VER="$(grep -E '^version[[:space:]]*=' pyproject.toml | head -1 | sed -E 's/^version[[:space:]]*=[[:space:]]*\"([^\"]+)\".*/\1/')"
echo "Done. Install with: pip install tongflow==${VER}"
