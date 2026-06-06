# tongflow (PyPI)

`pip install tongflow` installs the **Python import name** `tongflow` (plugin contracts, `deploy.py` scan, node slot metadata).

## Install

```bash
pip install tongflow
```

## Use

```python
from tongflow.slots import node_slot
from tongflow.node_slots import NodeSlots
from tongflow import current_app
```

In this monorepo, Modal `impl.py` / stub `deploy.py` images pin **`tongflow==0.0.5`** (PyPI). Bump the version string in those files when you publish a new release.

## Plugin identity

Plugin Python source is the single source of truth. The scanner derives plugin
runtime configuration from code and AST; do not add per-plugin JSON manifests.

For every plugin repository, these names must be identical:

- directory name
- `pluginId`
- Modal app name
- git repository name

Use `tongflow-modal-<semantic-name>` for Modal plugins and
`tongflow-api-<semantic-name>` for API plugins, such as
`tongflow-modal-docling`, `tongflow-modal-qwen3asr`, or
`tongflow-api-openai`. Do not encode hardware details in the name, such as
`gpu` or `cpu`.

Runner detection is prefix-based and validated against the entry files:

- `tongflow-modal-*` with `deploy.py`: Modal plugin
- `tongflow-api-*` with `entry.py`: API plugin
- both files or neither file: scanner error

Modal plugins should derive their app from the directory name:

```python
from tongflow import current_app

app = current_app(__file__)
```

Future plugin-level metadata must be declared as top-level `UPPER_CASE`
literals in `deploy.py` or `entry.py` so the scanner can extract it with AST.
Do not reintroduce JSON configuration files.

## Build and publish (maintainers)

From the **Tongflow repo root**:

```bash
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-xxxxxxxx   # https://pypi.org/manage/account/token/
pnpm tongflow:publish
```

This runs [`scripts/publish-tongflow-pypi.sh`](../../scripts/publish-tongflow-pypi.sh) (clean, `python -m build`, `twine check`, `twine upload`).

TestPyPI: `TONGFLOW_UPLOAD_TESTPYPI=1 pnpm tongflow:publish` (use a [TestPyPI token](https://test.pypi.org/manage/account/token/)).

Manual equivalent from `sdk/`: `python -m pip install build twine && python -m build && python -m twine upload dist/*`

## License

The `tongflow` SDK is licensed under **AGPL-3.0** (see [`LICENSE`](LICENSE)), like
the rest of the TongFlow project. The whole repository is dual-licensed under
AGPL-3.0 / a commercial license — see
[`COMMERCIAL-LICENSE.md`](../COMMERCIAL-LICENSE.md).
