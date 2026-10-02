# The shot contract — video

A video prompt is a contract for one shot, not a description of a scene. Read this
together with `references/prompt-layers.md`; the layers are the spine, this is the video
detail that sits on it.

## First decide what you are making

- **One shot** — the camera observes continuously, no cut, **one** main movement.
- **A sequence** — explicit cuts; each part owns its duration, framing and the join to the
  next. In TongFlow that is one workflow per shot, then `tongflow_workflow_compose` — not
  one prompt asking for four shots.
- **A montage** — juxtaposed fragments; still bounded in count, order and total duration.

Do not push several incompatible camera movements into "one shot", and do not call a list
of actions a montage.

## The twelve parts

Not every shot needs all twelve spelled out; a shot that is *wrong* is almost always
missing one of them.

1. **Purpose** — one function, one visible main event, where the shot leaves the viewer.
2. **Exact cast** — total count, one line per subject, each appearing once, and whether an
   off-screen speaker occupies space.
3. **Appearance and state** — identity anchors, current state, and the scope taken from
   each wired reference.
4. **Space** — area, foreground/mid/background, screen positions, facing, entrances, the
   action axis, unique props and who touches them.
5. **`open_state`** — first frame: pose, gaze, props, environment, and what is already
   audible.
6. **`beat_timeline`** — the causal chain across the duration.
7. **`close_state`** — last frame: position, pose, props, expression, environment, sound.
8. **`camera_start`** — framing, height, angle, lens feel, focus target.
9. **`camera_path`** — the one movement, its motivation and its speed.
10. **`camera_end`** — where the frame lands and what is in focus when it does.
11. **Audio** — dialogue verbatim, ambience, foley, music or its explicit absence.
12. **Constraints** — the three columns: must hold / changes here / must not appear.

## open_state → beats → close_state

```
duration: 6s
open_state:  MEI crouched beside the open toolbox, screen-left, looking down at her hands;
             rain steady, no music.
0.0–1.2s     she stays down; a shutter rattles off-screen right.
1.2–3.0s     she lifts her head toward the sound, then rises, weight shifting to her
             front foot.
3.0–5.0s     she takes two steps toward the door and stops.
5.0–6.0s     she holds, breathing out; the rain continues.
close_state: MEI standing centre-frame, facing screen-right, toolbox open behind her at
             screen-left, jacket wet across the shoulders; rain, no music.
```

Rules that make this work:

- **Beats fill the duration and do not overlap.** Beats totalling 9 seconds in a 6-second
  shot get compressed, reordered, or silently dropped.
- **The duration is a node config field**, not a sentence in the prompt. Check what the
  slot allows with `tongflow_node_describe(type)`; a 12-second beat sheet aimed at a plugin
  that produces 5 seconds is a contract you cannot fulfil.
- **Every action ends.** Movement without a settle produces a shot you cannot cut out of.
- **You must be able to draw the first and last frame.** If you cannot, neither can the
  model.
- **`close_state` is the next shot's `open_state`.** That is the whole continuity
  mechanism — write it down and reuse it verbatim.

## The camera contract

One movement. Give it three parts and a motivation:

```
camera_start: medium-wide, chest height, slight low angle, she is screen-left third,
              focus on her hands.
camera_path:  a slow push in, motivated by her rising; no pan, no roll.
camera_end:   medium close, her face screen-centre, focus on her eyes, toolbox out of
              frame.
```

- A single verb ("dolly in") is not a contract; it leaves the start and end frames to
  chance and makes the shot uncuttable.
- "Locked-off camera" and any movement verb in the same prompt is a direct contradiction —
  so is "the subject stands completely still" alongside "she keeps running".
- Handheld, focus pulls and lens character are camera facts, not style words; state them
  in `camera_path` or leave them out.

## Audio

State it even when there is none, or you get generic music.

- **Dialogue verbatim**, with who says it and when: `1.4–2.6s MEI: "It's still not
  turning over."` Long dialogue in a short shot produces lip sync that does not fit —
  budget roughly the words a person actually says in that many seconds.
- **A speaker who is off-screen** must be declared off-screen *and* excluded from frame,
  or they will walk into the background.
- **Ambience and foley** as a short list; **music** explicitly present or explicitly
  absent; **subtitles** explicitly off unless wanted, or they get burned in.
- Text that is meant to be *heard* and text that is meant to be *seen* get confused
  constantly. If a line is spoken, say so; if a word is printed on a sign, say that.

## Across shots

Keep a continuity file next to the shots and include it with `{{path}}` rather than
retyping from memory:

```
ep01/
  continuity.md          ← identity anchors, costume state, weather, the action axis
  sh010/
    sh010.tongflow.json  ← texts:['{{../continuity.md}} ...shot-specific contract...']
    sh010.02.mp4
  sh020/
```

- **Hold the axis.** Once two characters face each other across a line, every shot stays
  on one side of it, or the cut reverses who is looking at whom. Crossing it needs a
  visible bridging move.
- **Carry state forward.** Wet stays wet; a wound stays on the same arm; a closed toolbox
  stays closed. Every change must be traceable to a beat in some shot.
- **Carry sound forward.** Rain that stops between two adjacent shots reads as an error.
- When a shot chain is complete, `tongflow_workflow_compose({ folder })` turns the file
  references between the parts into real edges so the user can see and re-run the whole
  thing on the canvas.
