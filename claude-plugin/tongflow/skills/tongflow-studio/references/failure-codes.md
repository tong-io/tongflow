# When a result is wrong — find the layer, make the smallest fix

"It looks bad" is not a diagnosis. Describe the observable symptom, name the layer that
owns it, then change the least that could fix it. Adding more negative words is almost
never the answer.

## Check the layers in this order

| Layer | What to check | Where the fix goes |
|---|---|---|
| Asset | Is the approved identity, state and reference good enough? | the character `.md`, the wired reference file, the scope line |
| Contract | Are the count, space, action, camera and audio actually executable? | the shot contract — simplify, split into two shots, fix first/last frame |
| Prompt | Is the contract stated clearly, without contradiction or repetition? | reorder, compress, add the missing part |
| Plugin | Do the params, reference slots, duration and model fit? | node config, or a different plugin for the slot |
| Randomness | Does it happen in every run, or only some? | hold everything, run again, compare |
| Post | Is this better fixed in the edit? | note it and move on |

Look before you diagnose: `tongflow_look` for images and video contact sheets,
`tongflow_perceive` for what a video or audio track actually says and sounds like.

## Record it like this

In the notes file next to the asset, and condensed into the run's `note`:

```
code · symptom with the frame or timestamp · layer · smallest fix · the one variable
you changed · what you deliberately did not do
```

## Identity and assets

| Code | Symptom | Check first | Smallest fix |
|---|---|---|---|
| `ID-DRIFT` | Face, build, hair or silhouette drifts | identity anchors; too many mixed references | one approved reference, explicit scope |
| `STATE-DRIFT` | Costume, wound, wetness or carried prop reverts | which state version you wired | wire the right file, put the state in "must hold" |
| `REF-SCOPE` | The reference's framing, background or light leaks in | your inherit/exclude line | take only what you need, refuse the rest |
| `DUP-SUBJECT` | The same character appears twice | count, repeated description, mirrors | exact count, each once, rule out reflections |
| `ASSET-MERGE` | Two characters or props blend features | overlapping references, overlapping space | separate the references, separate the placement |

**Do not**: pile on "same face, consistent character, identical person" while the reference
itself is unstable.

## Space and continuity

| Code | Symptom | Check first | Smallest fix |
|---|---|---|---|
| `COUNT` | Wrong number of people, or extras | the allowed set; background; reflections | exact number, ids, each appearing once |
| `SCREEN-DIR` | Screen direction or left/right flips | ambiguous position wording | state camera side, anatomical side and facing together |
| `AXIS` | A cut reverses who faces whom | the action axis across shots | stay on one side, or show the crossing |
| `SPATIAL-RESET` | The layout rebuilds itself between shots | the space description; leaked reference framing | name fixed anchors, exclude reference composition |
| `PROP-DUP` | Furniture or a key prop multiplies | count, owner, position | declare the object unique and who touches it |
| `CONTINUITY` | Action, injury, weather or sound does not join | `close_state` vs the next `open_state` | align them; register the change deliberately |

**Do not**: use one composition reference to control every angle, or write "keep it
consistent" and hope.

## Action, camera, audio

| Code | Symptom | Check first | Smallest fix |
|---|---|---|---|
| `ACTION-OVERLOAD` | Beats compressed, dropped or reordered | beat total vs duration | cut beats, merge them, or split the shot |
| `PHYSICS` | Floating, weightless, impact without reaction | preparation → contact → reaction → settle | write the full chain and the environment's response |
| `MOTION-CONFLICT` | Subject both still and moving | the prompt's own wording | give the movement to a different beat or subject |
| `CAM-MULTI` | Camera wanders, several movements at once | how many movements you asked for | one movement, with start and end frames |
| `CAM-NO-END` | The shot cannot be cut out of | is there a `camera_end`? | name the final framing and focus target |
| `LIPSYNC` | Mouth does not match, or speaks when silent | dialogue length vs duration; silence declared? | shorten the line, or state explicitly that nobody speaks |
| `AUDIO-UNSPEC` | Unwanted music, burned-in subtitles | did you state the audio bed? | declare ambience, and music/subtitles present or absent |
| `TEXT-VISUAL` | Spoken words rendered as on-screen text | heard vs seen not distinguished | mark dialogue as spoken; name printed text separately |

**Do not**: fix a camera problem by describing the camera more emphatically. Fix it by
removing a movement.

## Prompt-level

| Code | Symptom | Check first | Smallest fix |
|---|---|---|---|
| `CONTRADICT` | Two requirements cannot both be true | "must hold" vs "changes here" | delete one; decide which the shot is about |
| `NEG-BLOAT` | Long negative list, no improvement | which negatives ever mattered here | keep only failures you have seen; delete the rest |
| `PARAM-IN-PROSE` | Seed, steps, cfg or model name inside the prompt text | node config vs prompt string | move them to config fields |
| `STYLE-ONLY` | Pretty, generic, does not tell the story | delete the style words — what is left? | write L2–L6 properly |

## Plugin-level

Before rewriting anything, rule this out: is the plugin installed, are its keys set
(`tongflow_plugins_list`), does the slot actually support what you asked, and does the
duration or aspect ratio fit? `tongflow_node_describe(type)` for the real enums and
ranges. A capability the plugin does not have is not a prompt problem — try another plugin
for the same slot, or change what you are asking for.

If two runs with everything held fixed differ wildly and both are plausible, it is
randomness — that is a selection question, see `references/iteration.md`.
