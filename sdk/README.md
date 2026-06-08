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
from tongflow import deploy  # backend-neutral marker for deploy-first plugins
```

The SDK is **backend-neutral**: it does not depend on `modal` (or any other
backend) and ships no `modal` helper. A deploy-first plugin declares `modal`
itself (in its `requirements.txt`) and pins the SDK in its image build.

In this monorepo, every Modal `deploy.py` pins **`tongflow==0.0.23`** (PyPI) in its `pip_install`, matching the version in [`pyproject.toml`](pyproject.toml). Bump that pin in every plugin when you publish a new release.

## Run a workflow as an embedded engine

The SDK can also **execute** a workflow exported from the TongFlow canvas, so
TongFlow can be embedded as an execution engine in any Python app — no running
desktop app required. Export `*.executable.json` from the canvas menu
("Export Executable"), then:

```python
from tongflow import run_workflow

result = run_workflow(
    "my-flow.executable.json",
    inputs={"input_ab12cd34": {"texts": ["a cute cat"]}},  # keyed by WorkflowInput.name
    auto_install=True,         # clone missing plugins + provision a shared venv
)
print(result["status"])           # "success" | "failed"
# inline mode (default): binary outputs come back as {bytesBase64, mime, filename}
print(result["outputs"])          # {nodeId -> ABI output}
print(result["outputs_by_name"])  # {output name -> [values]}
```

`run_workflow` interprets the exported plan (already topologically sorted, with
resolved bindings and output routes), materializes asset inputs, spawns each
plugin's local `entry.py`, and returns each node's output. With
`auto_install=True` it collects the `pluginId`s the workflow needs, clones any
that are missing (`{org}/{pluginId}.git`, default org `https://github.com/tong-io`;
override per plugin via `plugin_git_urls=`), and installs `tongflow` (from PyPI)
plus each plugin's `requirements.txt` into a shared venv. It stays
backend-neutral — a deploy-first plugin's `entry.py` still deploys-once and
invokes its remote backend.

### Where it writes to disk

Running a workflow touches the disk in a few places. Defaults follow the desktop
app's per-user directory so the SDK and the app **share** plugins/venv and the
SDK does **not** pollute your working directory:

| What | Default location | Override |
|---|---|---|
| Cloned plugins | `<user-data>/plugins` | `plugins_dir=` / `TONGFLOW_PLUGINS_DIR` |
| Shared plugin venv | `<user-data>/data/.tongflow/plugin-venv` | `data_dir=` / `TONGFLOW_DATA_DIR` |
| Binary outputs | **none by default** (kept in memory) | see below |

`<user-data>` is `~/Library/Application Support/TongFlow` (macOS),
`%APPDATA%\TongFlow` (Windows), or `$XDG_DATA_HOME/TongFlow` (Linux).

**Outputs are inline by default** (`inline_outputs=True`): node outputs and
intermediate assets stay in memory, and binary results come back as
`{bytesBase64, mime, filename}` — nothing is written for them. Pass
`inline_outputs=False` (optionally with `out_dir=`) to spill binaries to disk and
get `file_key` paths instead. Cloning plugins and the venv always require disk.

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

Every plugin ships an `entry.py` that the platform runs. The prefix is just a
label, not an execution backend:

- `tongflow-api-*`: a self-contained `entry.py`.
- `tongflow-modal-*`: a `deploy.py` whose handler class is marked `@deploy`,
  plus a thin `entry.py` bridge (identical across Modal plugins — copy it from
  any reference plugin) that deploys once and invokes the remote method, plus a
  `requirements.txt` declaring `modal`.
- neither `deploy.py` nor `entry.py`: scanner error.

A deploy-first plugin marks its handler class with `@deploy` and derives its
Modal app name from the directory name (no SDK helper needed):

```python
import modal
from pathlib import Path
from tongflow import deploy

app = modal.App(Path(__file__).resolve().parent.name)

@deploy           # tongflow's backend-neutral marker; the scanner detects it
@app.cls(...)
class Inference:
    @modal.method()
    @node_slot(NodeSlots.GEN_TEXT)
    def gen(self, input: GenTextInput) -> GenTextOutput: ...
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

This runs [`scripts/publish-tongflow-pypi.sh`](../scripts/publish-tongflow-pypi.sh) (clean, `python -m build`, `twine check`, `twine upload`).

TestPyPI: `TONGFLOW_UPLOAD_TESTPYPI=1 pnpm tongflow:publish` (use a [TestPyPI token](https://test.pypi.org/manage/account/token/)).

Manual equivalent from `sdk/`: `python -m pip install build twine && python -m build && python -m twine upload dist/*`

## License

The `tongflow` SDK is licensed under **AGPL-3.0** (see [`LICENSE`](LICENSE)), like
the rest of the TongFlow project. The whole repository is dual-licensed under
AGPL-3.0 / a commercial license — see
[`COMMERCIAL-LICENSE.md`](../COMMERCIAL-LICENSE.md).
