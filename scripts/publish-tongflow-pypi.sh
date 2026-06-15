#!/usr/bin/env bash
# Build sdk/ and upload sdist + wheel to PyPI (or TestPyPI).
#
# Usage (PyPI):
#   Add to repo-root `.env` (see `.env.example`): TWINE_USERNAME=__token__, TWINE_PASSWORD=pypi-...
#   Or export in the shell:
#   export TWINE_USERNAME=__token__
#   export TWINE_PASSWORD=pypi-xxxxxxxx
#   pnpm tongflow:publish
#
# TestPyPI:
#   export TWINE_USERNAME=__token__
#   export TWINE_PASSWORD=pypi-xxxxxxxx   # TestPyPI token
#   TONGFLOW_UPLOAD_TESTPYPI=1 pnpm tongflow:publish
#
# Requires: Python >= 3.10 (prefers Homebrew python3.12; avoids Xcode python3.9 + PEP 668 issues).
# Uses a cache venv outside the repo (XDG_CACHE_HOME or ~/.cache/tongflow/pypi-venv) for build tools.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="${ROOT}/sdk"

if [[ ! -f "${PKG}/pyproject.toml" ]]; then
  echo "Expected ${PKG}/pyproject.toml" >&2
  exit 1
fi

# Optional: PyPI API token from repo-root `.env` (gitignored; create from https://pypi.org/manage/account/token/).
if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
fi

# Prefer explicit PYTHON, then common Homebrew paths, then PATH (python3.12 before python3).
pick_python() {
  local c
  if [[ -n "${PYTHON:-}" && -x "${PYTHON}" ]]; then
    echo "${PYTHON}"
    return 0
  fi
  for c in /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.13 \
           /usr/local/bin/python3.12 "$(command -v python3.12)" "$(command -v python3)"; do
    if [[ -n "${c}" && -x "${c}" ]]; then
      echo "${c}"
      return 0
    fi
  done
  return 1
}

BASE_PY="$(pick_python)" || {
  echo "No usable Python 3 interpreter found. Install Python 3.10+ or set PYTHON=/path/to/python3." >&2
  exit 1
}

CACHE_BASE="${XDG_CACHE_HOME:-${HOME}/.cache}/tongflow"
mkdir -p "${CACHE_BASE}"
VENV="${CACHE_BASE}/pypi-venv"
if [[ ! -x "${VENV}/bin/python" ]]; then
  "${BASE_PY}" -m venv "${VENV}"
fi

PIP="${VENV}/bin/pip"
PYTHON_BIN="${VENV}/bin/python"

cd "${PKG}"
rm -rf dist build tongflow.egg-info 2>/dev/null || true

"${PIP}" install -q --upgrade pip build twine

"${PYTHON_BIN}" -m build
"${PYTHON_BIN}" -m twine check dist/*

if [[ -z "${TWINE_PASSWORD:-}" ]]; then
  echo "" >&2
  echo "Built sdk/dist OK; skipping PyPI upload (TWINE_PASSWORD not set)." >&2
  echo "To upload, add to repo-root .env or export:" >&2
  echo "  TWINE_USERNAME=__token__" >&2
  echo "  TWINE_PASSWORD=pypi-...   # https://pypi.org/manage/account/token/" >&2
  echo "Then re-run: pnpm tongflow:publish" >&2
  VER="$(grep -E '^version[[:space:]]*=' pyproject.toml | head -1 | sed -E 's/^version[[:space:]]*=[[:space:]]*\"([^\"]+)\".*/\1/')"
  echo "Local install: ${PYTHON_BIN} -m pip install \"dist/tongflow-${VER}-py3-none-any.whl\"" >&2
  exit 0
fi

if [[ -z "${TWINE_USERNAME:-}" ]]; then
  export TWINE_USERNAME=__token__
fi

if [[ "${TONGFLOW_UPLOAD_TESTPYPI:-}" == "1" ]]; then
  echo "Uploading to TestPyPI..."
  "${PYTHON_BIN}" -m twine upload --repository testpypi dist/*
else
  echo "Uploading to PyPI..."
  "${PYTHON_BIN}" -m twine upload dist/*
fi

VER="$(grep -E '^version[[:space:]]*=' pyproject.toml | head -1 | sed -E 's/^version[[:space:]]*=[[:space:]]*\"([^\"]+)\".*/\1/')"
echo "Done. Install with: pip install tongflow==${VER}"
