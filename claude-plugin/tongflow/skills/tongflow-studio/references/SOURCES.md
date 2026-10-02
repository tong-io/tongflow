# Sources

The method in `prompt-layers.md`, `shot-contract.md`, `failure-codes.md` and
`iteration.md` is adapted for TongFlow from **Hell Grind AIGC Skill**
(https://github.com/renmu2017/Hell-Grind-AIGC-Skill), MIT License,
Copyright (c) 2026 renmu2017:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this
> software and associated documentation files (the "Software"), to deal in the Software
> without restriction, including without limitation the rights to use, copy, modify,
> merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
> permit persons to whom the Software is furnished to do so, subject to the following
> conditions:
>
> The above copyright notice and this permission notice shall be included in all copies
> or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
> INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
> PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
> HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
> CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
> OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Taken: the layered prompt model, the shot-contract structure, the failure taxonomy, and
the version/run/selection/iteration distinction. Rewritten in English and rebound to
TongFlow's own mechanics (workflow files, numbered outputs, `.runs.json`, `{{path}}`
includes, per-run billing confirmation).

Not taken: the upstream project-folder schema and its CSV tables, and the bundled Python
tools — a dsh-tongflow project has no fixed template, and its provenance is recorded
automatically next to each asset.

That upstream project notes its own method was informed by publicly accessible production
material for Higgsfield's *Hell Grind*, and carries no rights to that film, its assets or
its project-specific prompts. Neither does this. Do not copy characters, assets or source
prompts from it into a user's project.
