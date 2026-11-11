# tongflow

**The Python SDK for [TongFlow](https://www.tongflow.com)** — the Agent-Human-Friendly, Modality-First, Enterprise-Level GenAI Workflow Platform.

- 🌐 Website: **https://www.tongflow.com**
- ▶️ Try it online: **https://app.tongflow.com**
- 📦 Source, desktop app & docs: **https://github.com/tong-io/tongflow** (developer guide: [docs/developers.md](https://github.com/tong-io/tongflow/blob/main/docs/developers.md))

`pip install tongflow` gives you the `tongflow` import package. It has two uses:

1. **[Run workflows](#run-a-workflow-as-an-embedded-engine)** — execute a workflow exported from the TongFlow canvas as an embedded engine, straight from Python (no desktop app needed).
2. **[Author plugins](#author-a-plugin)** — implement node capabilities against TongFlow's ABI contract.

## Install

```bash
pip install tongflow
```

Requires **Python 3.10+**. The SDK is **backend-neutral**: it depends only on `pydantic` and `typing_extensions`, and never imports `modal` (or any other backend).

## Run a workflow as an embedded engine

Build a flow on the [TongFlow canvas](https://github.com/tong-io/tongflow), export it (**Export Executable** → `*.executable.json`), then run it from Python:

```python
from tongflow import run_workflow

result = run_workflow(
    "my-flow.executable.json",
    inputs={"input_ab12cd34": {"texts": ["a cute cat"]}},  # keyed by WorkflowInput.name
    auto_install=True,   # clone missing plugins + provision a shared venv
)

print(result["status"])            # "success" | "failed"
print(result["outputs"])           # {nodeId -> ABI output}
print(result["outputs_by_name"])   # {output name -> [values]}
```

`run_workflow` reads the exported plan (already topologically sorted, with resolved
bindings and output routes), materializes asset inputs, spawns each plugin's local
`entry.py`, and returns each node's output. With `auto_install=True` it clones any
missing plugins (`{org}/{pluginId}.git`, default org `https://github.com/tong-io`;
override per plugin via `plugin_git_urls=`) and installs `tongflow` plus each
plugin's `requirements.txt` into a shared venv. It stays backend-neutral — a
deploy-first plugin's `entry.py` deploys-once and invokes its remote backend.

**Outputs are inline by default** (`inline_outputs=True`): outputs and intermediate
assets stay in memory, and binary results come back as `{bytesBase64, mime, filename}`
— nothing is written for them. Pass `inline_outputs=False` (optionally with `out_dir=`)
to spill binaries to disk and get `file_key` paths instead.

### From another process (any language)

`python -m tongflow engine` is the same engine behind an NDJSON bridge: write one JSON
request to stdin, read events on stdout. This is how the TongFlow app — and any
external host built on the `tongflow` npm package's exporter — runs workflows.

```jsonc
// stdin (one JSON document)
{"workflow": {...executable workflow...},
 "inputs": {"input_ab12cd34": {"texts": ["a cute cat"]}},
 "options": {"auto_install": true, "inline_outputs": false, "out_dir": "./out",
             "env": {"OPENAI_API_KEY": "..."}}}   // extra env for every plugin process
// stdout (NDJSON)
{"ready": {"version": "0.3.0"}}
{"event": {"type": "workflow_started", ...}}
{"event": {"type": "node_completed", "nodeId": "...", "output": {...}}}
{"result": {"status": "success", "outputs": {...}, "outputs_by_name": {...}}}
```

Other subcommands: `python -m tongflow scan [--root plugins] [--abi file]` prints the
plugin registry JSON (the ABI defaults to the copy bundled with the SDK) and
`python -m tongflow version` prints the SDK version.

### Where it writes to disk

Defaults follow the desktop app's per-user directory, so the SDK and the app **share**
plugins/venv and the SDK does **not** pollute your working directory:

| What | Default location | Override |
|---|---|---|
| Cloned plugins | `<user-data>/plugins` | `plugins_dir=` / `TONGFLOW_PLUGINS_DIR` |
| Shared plugin venv | `<user-data>/data/.tongflow/plugin-venv` | `data_dir=` / `TONGFLOW_DATA_DIR` |
| Binary outputs | none by default (kept in memory) | `inline_outputs=False`, `out_dir=` |

`<user-data>` is `~/Library/Application Support/TongFlow` (macOS),
`%APPDATA%\TongFlow` (Windows), or `$XDG_DATA_HOME/TongFlow` (Linux).

## Author a plugin

A plugin is a small Python package that implements one or more ABI **node slots**.
Annotate each slot method with the generated types and mark it with `@node_slot`:

```python
from tongflow.slots import node_slot
from tongflow.node_slots import NodeSlots
from tongflow.models.gen_text import GenTextInput, GenTextOutput

@node_slot(NodeSlots.GEN_TEXT)
def gen_text(input: GenTextInput) -> GenTextOutput:
    answer = my_llm(input.text)              # attribute access; types come from the ABI
    return GenTextOutput(success=True, text=answer)
```

The platform runs each plugin's `entry.py`, exchanging ABI JSON over stdin/stdout.
`@node_slot` deep-constructs the incoming dict into a typed `BaseModel` and dumps your
returned model back to a dict — plugin code never sees or produces a raw dict.

A plugin comes in one of **two shapes**, decided purely by its files (the scanner
detects them from code — it does not look at the plugin's name):

- **Self-contained** — ships an `entry.py` that does the work in-process.
- **Deploy-first** — ships a `deploy.py` whose handler class is marked `@deploy`,
  plus a thin `entry.py` bridge (identical across deploy-first plugins — copy it from
  any reference plugin) that deploys once and invokes the remote backend, plus a
  `requirements.txt` for that backend. Example using Modal:

```python
import modal
from pathlib import Path
from tongflow import deploy
from tongflow.slots import node_slot
from tongflow.node_slots import NodeSlots
from tongflow.models.gen_text import GenTextInput, GenTextOutput

app = modal.App(Path(__file__).resolve().parent.name)

@deploy                      # tongflow's backend-neutral marker; the scanner detects it via AST
@app.cls(...)
class Inference:
    @modal.method()
    @node_slot(NodeSlots.GEN_TEXT)
    def gen(self, input: GenTextInput) -> GenTextOutput: ...
```

**Naming is a separate convention, unrelated to the two shapes above.** Where the work
actually runs (locally, on Modal, on another cloud) is the plugin's own concern, and
the name prefix carries no execution meaning. Plugin repos are named
`tongflow-<label>-<name>` — for example `tongflow-api-openai` or `tongflow-modal-ltx`.
These are only naming examples; the prefix does **not** decide whether a plugin is
self-contained or deploy-first.

Pin the SDK in your plugin's image build (`pip_install("tongflow==0.1.0")`) to match
the version you develop against.

👉 **Full plugin guide** — directory layout, the ABI, generated model conventions,
and how to publish: **[docs/plugins.md](https://github.com/tong-io/tongflow/blob/main/docs/plugins.md)**.

## Build & publish (maintainers)

From the repo root:

```bash
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-xxxxxxxx   # https://pypi.org/manage/account/token/
pnpm tongflow:publish
```

Runs [`scripts/publish-tongflow-pypi.sh`](https://github.com/tong-io/tongflow/blob/main/scripts/publish-tongflow-pypi.sh)
(clean, `python -m build`, `twine check`, `twine upload`). Dry-run to TestPyPI with
`TONGFLOW_UPLOAD_TESTPYPI=1 pnpm tongflow:publish`.

## License

AGPL-3.0 — see [LICENSE](https://github.com/tong-io/tongflow/blob/main/LICENSE). The
whole project is dual-licensed under AGPL-3.0 / a commercial license; see
[COMMERCIAL-LICENSE.md](https://github.com/tong-io/tongflow/blob/main/COMMERCIAL-LICENSE.md)
or contact **business@tongflow.com**.
