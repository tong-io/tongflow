# Writing a prompt — the seven layers

A prompt fails for a reason that belongs to a layer. Write the layers in order, and
when something comes out wrong you already know which layer to fix.

| Layer | The question it answers |
|---|---|
| L1 intent | Why this image or shot exists; what the viewer must read from it |
| L2 identity | Who exactly, in which state, inheriting what from which reference |
| L3 space | How many, where on screen, facing where, which objects are unique |
| L4 action | What triggers, what moves, what makes contact, where it settles |
| L5 camera | Starting frame, one main movement, ending frame |
| L6 texture | Light source, exposure, palette, material, dialogue, ambience |
| L7 constraints | What must hold, what changes here, what must never appear |

An image prompt uses L1–L3, L5–L7 and a static L4 (pose, weight, gaze). A video prompt
uses all seven and owes the fuller contract in `references/shot-contract.md`.

## Where each layer lives in TongFlow

Layers are **not** all prose in one string. Split them the way the runtime splits them:

- **L1** — the workflow file's `meta.purpose`, and the notes file next to the asset. Not
  in the prompt text at all; the model cannot act on "this shot establishes loneliness".
- **L2** — the wired reference **files** (`data:{fileKeys:['./mei_ref.02.png']}`) plus the
  identity anchors you keep in `characters/mei/mei.md` and pull in with `{{./mei.md}}`.
- **L3, L4, L5, L6, L7** — the prompt text, in **one** text node, in that order.
- **Plugin, model, seed, steps, guidance, motion strength** — node config fields, never
  prose. `tongflow_node_describe(type)` lists what the slot actually accepts. A parameter
  written into the prompt string is ignored and dilutes everything around it.

Compose the whole prompt in one text node. Never chain text-combining nodes to assemble it.

## L2 — identity, state, and reference scope

Three different things, kept apart:

- **Identity invariants**: what makes her her across every shot. Written once, in her
  `.md` file, included everywhere.
- **State**: what is true *now* — costume version, wound, wet, dirt, what she carries.
  State belongs to the scene, and it changes; identity does not.
- **Reference scope**: what the wired image is being used *for*. A reference always leaks
  more than you meant — its framing, its background, its light. Say what you take from it
  and what you refuse:

```
{{./mei.md}} — hold face, hair length, jaw. Take costume and wounds from the wired
reference only; do not take its framing, background, lens or lighting.
```

If identity drifts, the fix is upstream in the reference and the scope line, **not** more
adjectives. Adding "same face, consistent character, identical person" to an unstable
reference does nothing.

## L3 — count, placement, screen direction

Vague space is where extra people and duplicated props come from.

- **Exact count, each once**: "exactly two figures: MEI and the mechanic, each appearing
  once; nobody else is in frame or in the space behind camera."
- **Screen position and facing**, both stated: "MEI stands screen-left in mid-ground,
  facing screen-right." Screen-left and her left hand are different things — when a hand,
  a wound or a scar matters, say which: "the bandage is on her anatomical right arm, which
  reads screen-left here."
- **Unique objects with an owner**: "one toolbox, on the floor at her feet, touched by
  nobody" — otherwise the model happily renders three of them.
- **Mirrors, screens, windows, crowds** duplicate subjects. If the scene has one, either
  rule it out ("no reflections of MEI") or state what it shows.

## L5 — one main movement

An image has a frame; a shot has a start frame, one movement, and an end frame. Two
incompatible movements in one shot is the single most common video failure. Details and
the full camera contract: `references/shot-contract.md`.

## L6 — motivated texture

- **Light has a source.** "Neon sign above the door, screen-right, cold cyan, hard edge;
  fill from a work lamp on the ground, warm, weak." Not "cinematic lighting".
- **Exposure and palette** as decisions: what is clipped, what is crushed, two or three
  colours that own the frame.
- **Material** where it reads: wet steel, worn canvas, cracked rubber.
- **Audio** is a layer, not an afterthought — see `references/shot-contract.md`.

Style words are the cheapest part of a prompt. Delete every style word and the prompt must
still fully determine the picture. If it does not, the missing information is in L2–L6.

## L7 — the three-column constraint block

End every non-trivial prompt with three explicit lists:

```
must hold:       MEI's face and hair; the red jacket, torn at the left cuff; night, rain
changes here:    she straightens from the crouch; the toolbox lid closes
must not appear: a second person; a reflection of MEI; text, logos, watermarks; daylight
```

Negatives are expensive — each one competes for attention. Only list a failure you have
actually seen from this plugin on this asset, and delete it once it stops happening. A wall
of generic negatives ("bad hands, blurry, low quality, extra limbs") is noise; if a plugin
needs a fixed negative string, that is a node config field, not part of the prompt.

## Before you run

Read the prompt back and answer these. A "no" is cheaper to fix now than after a paid run.

1. Delete the style words — is the picture still determined?
2. Can you count the people, and does every listed subject appear exactly once?
3. Could you draw a rough floor plan from the placement lines?
4. Does every reference file have a stated scope?
5. Is exactly one thing moving in the camera contract?
6. Does each light have a source?
7. Does anything in "changes here" contradict "must hold"?

Language: prompts sent to image and video plugins are English unless the plugin says
otherwise. Notes, character files and the constraint reasoning you keep on disk are in the
user's language.
