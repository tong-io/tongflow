# Iterating — not pulling a slot machine

Every run costs the user money. The difference between iterating and gambling is whether
you can say what you changed and what you expected.

## Four different things

- **The workflow** — the file. Editing it is a *version*: a real decision about the
  contract, the reference, the plugin or the params.
- **A run** — one execution of that file. It never overwrites: run 1 is `mei_ref.01.png`,
  run 2 is `mei_ref.02.png`, and `mei_ref.runs.json` records the inputs, plugins, timing
  and your `note` for each.
- **A selection** — which numbered output you picked, and why. Downstream work references
  that path, so the choice is permanent until you change it.
- **An iteration** — a version change driven by a diagnosis: what failed, what you
  changed, what you expect to see.

Running the same unchanged file five times is not four iterations. It is one run and four
duplicates, and it costs five times as much.

## One variable at a time

Before running again, be able to fill this in:

```
failure:            CAM-MULTI — the camera pushes in and then pans right, ends nowhere
layer:              contract
changed:            removed the pan; added camera_end (medium close, focus on her eyes)
expected:           one continuous push that settles on her face by 5s
held fixed:         prompt L1–L4, the wired reference, plugin, seed, duration
```

Pass the short form as the run's `note` — that is what `.runs.json` keeps, and what the
next session reads instead of guessing. Keep the long form in the notes file next to the
asset.

Changing the prompt, the reference and the plugin at once and getting a better result
teaches you nothing; the next shot starts from zero again.

## When to stop changing the prompt

**Two consecutive versions with no improvement on the same failure means the problem is
not in the prompt.** Go back up:

1. Is the asset good enough? A reference that does not pin the identity will not be fixed
   by wording.
2. Is the contract executable? Four beats, two characters, dialogue and a moving camera in
   five seconds is not a prompt problem — split the shot.
3. Is the plugin capable? Some slots simply cannot do what you are asking. Try another
   installed plugin, or change the ask.
4. Is this a post problem? A slightly wrong colour or a trim is cheaper in the edit than in
   ten more runs. Note it and move on.

Tell the user when you hit this point, with the two versions and what stayed the same.
Silently burning their credits on version seven is the failure mode this rule exists to
prevent.

## Randomness and comparison

If two runs of the *identical* file differ a lot, the variation is the plugin's, not
yours. Then, and only then, several runs of the same version is the right move — you are
sampling, not iterating. Say so, ask once for a batch of N, run them, and compare:

- Judge against the contract, not against taste: count, identity, state, space, camera end,
  audio. `tongflow_look` for images and contact sheets, `tongflow_perceive` for what a
  video actually says and sounds like.
- Record the choice: which number, judged on what, what remains wrong but acceptable.
- Tell the user which one you picked and why — they can see all the numbers in the folder
  and will wonder.

## Budget is a conversation

A run with a paid plugin needs `user_confirmed` every single time; a yes for the last run
never covers the next one. That constraint is also good practice — it forces you to have a
reason before every spend.

- Planning a batch (ten shots, or five samples of one shot): say so, and get one clear yes
  for that batch.
- Before an expensive stage, tell the user roughly how many runs you expect and what the
  stop rule is.
- When you hit the two-version rule, that is a checkpoint: report and ask, do not spend
  through it.

## What lands on disk

No new bookkeeping files. Everything above lives in what the project already has:

- `.runs.json` — automatic provenance plus your `note` per run.
- The workflow file's `meta.purpose` — why this asset exists.
- A notes file next to the asset (or in `notes/`) — diagnoses, selections, what is
  knowingly imperfect.
- `continuity.md` for state that must hold across shots, pulled in with `{{path}}`.
