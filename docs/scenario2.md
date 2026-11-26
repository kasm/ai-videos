Animation Scenario Format: Theory and Data Formats

2026-11-24 · Dima

1. Purpose and principles

The format describes a scene as a set of intervals on actor channels, linked by constraints. A compiler turns that description into a list of events with absolute time, which the renderer executes without computing anything.

There are two levels:

Level	File	Written by	Stores
Authoring	scenario.md	AI or a person	Intent: actions, relations, parameters
Compiled	timeline.json	The compiler	Result: seconds, coordinates, asset paths
text → AI → scenario.md → compiler → timeline.json → frame render + audio mix → video

Five principles from which everything else follows:

Intent, not result. The scenario stores relations ("after the line", "to the left of Anna"); the compiler computes the numbers.
State is a function of time. Any frame is computed from the timeline and the moment t, without playing the frames before it.
One model for time and space. Both have primitives, named points, constraints and definedness statuses.
Construction before solving. Every value is defined through values already defined. Dependencies form an acyclic graph; a cycle is an error.
The compiled level is explicit. Defaults, the random seed and plugin versions are written into the timeline, so a render is reproducible.
2. Entity model

An event is the tuple "actor, action, parameters, interval". Everything else either describes the participants of an event or links events to each other.

Entity	What it is	Example
Scene	A space with a coordinate system, a frame size and reference geometry	forest
Reference geometry	Named points, paths and zones of the scene; never drawn itself	tree, road, meet
Actor	A participant with a set of channels: a character, the camera, a narrator, a board	anna, camera
Channel	An independent part of an actor that at most one action occupies at any moment	voice, body, arms, gaze
Action	A kind of behaviour declared by a plugin: channels, parameters, duration type	say, walk
Event	One use of an action: actor, action, parameters, interval	anna walk to=tree
Block	A container that sets the default relation between its children's intervals	seq, par
Parameter	A named value or expression	pause = 0.4s
Constraint	A relation between points of intervals or between geometry objects	ends=song.end

Three rules follow from the model:

Channel invariant. On one channel of one actor, intervals never overlap.
A combined action is several events of one actor on different channels: "walks and sings" occupies body and voice.
Several voices at once are events on the voice channels of different actors with overlapping intervals.

Lasting state (mood, pose) lives on a separate state channel: the event is instant, and the value holds until the next event on the same channel.

t →          0s        2s        4s        6s        8s       10s
anna.voice   [say ··]            [sing ···············]
anna.body                        [walk ·············]    [walk ····]
boris.voice            [say]                                  [laugh ··]
boris.arms             [wave]
boris.body                       [walk ·············]
boris.gaze                                               [look-at ·]
3. Theory of time

An interval is a segment on the time axis with three quantities (start, end, dur) and two degrees of freedom. The compiler's job is to remove both degrees of freedom from every interval.

I = [start, end],    dur = end − start ≥ 0
Points

An interval has named points that constraints attach to:

start and end exist on every interval;
inner points are declared by the plugin: a word of a spoken line (word:3), the stroke of a gesture (stroke);
a fraction of the length: song@50%.

Every point reduces to "interval start plus an offset". Offsets of inner points are known once the assets are prepared.

Duration types
Type	Where it comes from	Free degrees	Example
Intrinsic	From the asset, after preparation	1	say: length of the audio
Derived	From parameters and geometry	1	walk: path length divided by speed
Explicit	From the dur parameter	1	wait dur=2s
Instant	Always 0	1	a mood change, a marker
Elastic	From constraints and the container	2	dance, look-at, idle
Tolerance

A duration is described by a triple (minimum, preferred, maximum). For a rigid duration all three are equal; for an elastic one the maximum is unbounded. The scheduler takes the preferred value whenever the constraints allow it.

Default rules

The remaining degree of freedom (where the interval starts) is removed by the block:

in seq, an event starts at the end of the previous one plus the pause parameter;
in par, an event starts at the start of the block;
a block is itself an interval: seq runs from the start of its first child to the end of its last, par ends with its longest non-elastic child;
an elastic child stretches to the end of its block.

An explicit constraint on a line replaces the default rule.

Local time

Every block has its own axis. A block can shift it, scale it (speed=1.5) and repeat it. A plugin only receives the event's local time, from 0 to dur, and knows nothing about nesting. Compilation flattens the hierarchy into a plain list.

Units and precision

Allowed units: seconds (s), milliseconds (ms), frames (f), beats (b, when the scene sets a tempo). All computation runs in exact time. Values are rounded to the frame grid once, when the timeline is written.

4. Constraints

A constraint links points: in time these are points of intervals, in space they are points of reference geometry and of actors. Temporal constraints are linear and can be solved as a system; spatial ones are only constructed in order.

Temporal constraints

All of them reduce to three forms: equality of points with an offset, ordering of points, proportion of durations.

Geometric analogue	Meaning in time	Notation
Coincident points	Start equals the end of the previous event	default in seq
Coincident starts	Start together	& or starts=X.start
Coincident ends	End together	ends=X.end
Dimension between points	A pause or a lead	@ X.end + 0.5s
Midpoint, fraction	A point inside an interval	@ X@50%
Characteristic point	A word, the stroke of a gesture	@ X.word:3
Equal lengths	Same duration	dur=X.dur
Proportion	A multiple of a duration	dur=2*beat
Snap to grid	Repetition with a step	every=beat

Every action has the reserved time parameters starts, ends and dur. The notation @ P means starts=P, and & means starts=prev.start.

Spatial constructions

A construction is a function that returns a point from objects already defined. There are no simultaneous systems: each construction is computed in one step.

Construction	Result
midpoint(a, b)	Midpoint of a segment
left-of(a, d), right-of(a, d)	A point at distance d to the left or right of a
offset(a, dx, dy)	An offset from a point
along(path, 30%)	A point on a path by fraction of its length
intersection(p1, p2)	Intersection of two paths
foot(a, line)	Foot of the perpendicular from a point to a line
Snapshot and live binding

A reference to an actor inside a parameter comes in two kinds.

Snapshot. The actor's position is taken at one moment and becomes a number at compile time. By default that moment is the start of the event. Another moment is set explicitly: left-of(anna@go.end, gap).
Live binding. The reference holds for the whole interval and is evaluated every frame. Only parameters that the plugin declares as live can be bound this way: target of look-at, follow, hold.

Live bindings form a dependency graph between channels: Boris's gaze depends on Anna's body. The graph must be acyclic, and its traversal order is written into the timeline.

Coupling space and time

For an action with a derived duration, three quantities are tied by one equation, so only one of them can be driving.

dur = length(path) / speed
Given on the line	Computed
speed	Duration
dur	Speed
ends=P with a known start	Duration, then speed
Nothing	Speed comes from the default cascade; duration is computed
Two or more of the above	Error: over-constrained
5. Parameters

A parameter is a named value that is evaluated at compile time and reaches the timeline as a plain number. The definition closest to the event wins.

Levels and cascade
Level	Where it is set	Example
Build	A profile outside the scenario	resolution, fps, language, voice set, seed
Scenario	params and defaults in the file front matter	pause: 0.4s
Scene	The scene settings block	defaults: { speed: slow }
Block	The block header	par speed=1.5:
Event	The line	anna walk speed=fast

Lookup order for a value: event, block, scene, scenario, plugin default. One scenario with different build profiles yields different versions of the video: vertical and horizontal, or in different languages.

Expressions

A value may contain numbers with units, the four arithmetic operations, references to parameters and to quantities of objects (song.dur, anna.height). There are no conditions and no loops. Dependencies between expressions form an acyclic graph.

Named values

Instead of numbers, a scenario uses names: plugin presets (slow, normal, fast) and scene points (tree). Numbers with units remain as a fallback. Names are more robust against AI mistakes and survive a change of frame.

Manner and state
Manner is a list of tags in parentheses after the action: anna say (angry, loud): .... A tag is passed to every channel of the event, and each plugin decides how to perform it. A tag that no plugin understands produces a warning.
State is an instant event on a state channel: anna mood: sad. The compiler writes the effective state into every later event of that actor, so the renderer never has to remember history.
Change over time

A parameter that changes within an event is given as a pair of values and a curve: camera zoom from=1 to=1.5 ease=in-out. In the timeline this becomes two key values and the name of an interpolation function.

Randomness

Any randomness in plugins (blinking, idle variations) is drawn from the seed in the build profile. The seed is written into the timeline.

6. Statuses and diagnostics

After analysis every value has one of three statuses: defined, under-constrained, over-constrained. The timeline is written only when all values are defined.

Defined: no degrees of freedom are left and nothing conflicts.
Under-constrained: a degree of freedom is still free. The compiler closes it with a default and emits a warning. If there is no default, it is an error.
Over-constrained: there are more conditions than degrees of freedom. Always an error, even when the conditions happen to agree.
Code	Condition	Level
E_UNKNOWN_ACTION	The action is in no manifest	error
E_UNKNOWN_PARAM	The action has no such parameter; the hint gives the nearest name	error
E_TYPE	A value has the wrong type or unit	error
E_UNDEFINED_REF	A reference to a label, point or actor that does not exist	error
E_OVERCONSTRAINED	More driving values than degrees of freedom	error
W_UNDERCONSTRAINED	A default was applied; the message gives the value used	warning
E_UNDERCONSTRAINED	A free degree with no default, such as an elastic event outside a group	error
E_CHANNEL_CONFLICT	Two events overlap on one channel of an actor	error
E_CYCLE	A cycle in the dependency graph; the message gives the whole chain	error
E_NEGATIVE_DURATION	An interval ends before it starts	error
E_TOLERANCE	The required duration is outside the tolerance	error
E_NO_SOLUTION	A construction yields no point, for example the paths do not intersect	error
W_UNUSED_MANNER	No plugin of the event understands a manner tag	warning

A message always names the line, the other side of the conflict and a way to fix it. In that form an AI can correct the scenario without a person involved.

json
{
  "code": "E_OVERCONSTRAINED",
  "severity": "error",
  "line": 14,
  "message": "walk has both speed and ends: only one value can be driving",
  "related": [
    { "line": 12, "note": "ends refers to walk.end, defined here" }
  ],
  "hint": "Remove speed, and the speed will be computed from the arrival time"
}
7. Authoring format: scenario.md

The file is ordinary Markdown: front matter with parameters, scene headings, and inside each scene two fenced code blocks tagged scene and script. The compiler skips all other text, so the source passage of the book can sit next to the commands.

File structure
Part	Form	Contains
Front matter	YAML between --- lines at the top of the file	title, params, defaults, cast
Scene	A first-level heading	The scene title
Scene settings	A scene code block, YAML	name, points, paths, place, params, defaults
Commands	A script code block	The lines and blocks of the scenario
Grammar
line    = ["&"] [label] actor action [manner] {param} [anchor] [":" main]
block   = [label] ("par" | "seq") {param} ":"  NEWLINE  INDENT {line | block}
label   = "[" name "]"
manner  = "(" tag {"," tag} ")"
param   = name "=" value
anchor  = "@" point [("+" | "-") duration]
point   = ref "." pointname | ref "@" percent
ref     = name | "prev" | "block"
value   = number [unit] | name | call | expr
call    = name "(" value {"," value} ")"
main    = text to the end of the line
comment = a line that starts with "#"
Rules
Everything structural comes before the colon. After the colon there is only the action's main argument, taken verbatim to the end of the line. The text of a spoken line needs no escaping.
Lines run in sequence. The top level of a script block is an implicit seq.
& joins a line to the previous one as a group. A group behaves like par: it ends with its longest non-elastic event, and the next line follows the group.
An explicit start replaces the block rule. A line with @ or starts= does not queue; it is placed by its anchor.
Reserved references: prev (the previous line of the same block) and block (the enclosing block).
Labels are unique within a scene. Block nesting is set by a two-space indent.

The old form actor1 say: Hello remains a valid line of this format.

Example

A complete scenario.md:

markdown
---
title: Meeting in the clearing
params:
  pause: 0.4s
  gap: 150
cast:
  anna:  { model: girl, voice: anna_v1 }
  boris: { model: bear, voice: boris_v1 }
---

# Scene 1. The clearing

```scene
name: forest
points:
  door: [300, 800]
  tree: [1500, 800]
  meet: midpoint(door, tree)
place:
  anna: door
  boris: tree
```

```script
anna say: Hi, Boris!
boris say: Hi!
& boris wave

par:
  [walk] anna walk to=meet speed=slow
  [song] anna sing: La-la-la, la-la
  boris walk to=right-of(meet, gap) ends=walk.end

[go] anna walk to=door
& boris look-at target=anna
boris laugh @ go.end - 0.5s
```

The example contains no absolute time: only the pause and the lead of the laugh are given. Only the two reference points have coordinates. Boris's speed in the par block is not given: it is computed from the requirement to arrive at the same moment as Anna.

8. Compiled format: timeline.json

The timeline is a flat list of events with absolute time and fully evaluated parameters. It contains no blocks, expressions, presets or point names.

What the compiler computed for the example

The durations of the spoken lines, the song, the gesture and the laugh are illustrative here: in practice asset preparation supplies them. Speed presets: slow = 150, normal = 300 units per second. Line numbers count from the first line of the script block.

Line	Event	Start, s	End, s	Determined by
1	anna say	0.0	1.6	Scene start; audio length
2	boris say	2.0	2.9	End of line 1 plus pause; audio length
3	boris wave	2.0	3.2	&: start of line 2; clip length
6	anna walk	3.6	7.6	Start of par; 600 units at speed 150
7	anna sing	3.6	8.0	Start of par; audio length
8	boris walk	3.6	7.6	Start of par; ends=walk.end; speed 112.5 computed from 450 units in 4 s
10	anna walk	8.4	10.4	End of par plus pause; 600 units at the default speed 300
11	boris look-at	8.4	10.4	&: start of line 10; elastic, to the end of the group
12	boris laugh	9.9	11.4	Anchor go.end - 0.5s; audio length

The video runs 11.4 s, which is 342 frames at 30 frames per second.

Fields
Field	Meaning
version	Format version; grows on incompatible changes
source	The scenario file and its hash
profile	Build profile: frame size, fps, seed, language
duration, frames	Length of the video in seconds and in frames
plugins	Versions of the plugins the timeline was built with
actors	Model, voice and initial position of each actor
evalOrder	Order in which channels are evaluated within a frame, from the graph of live bindings
events[].id	The label from the scenario, or L plus the line number
events[].t, dur	Start and duration in seconds, multiples of the frame step
events[].channels	The actor's channels occupied by the event
events[].params	All parameters as numbers, defaults included
events[].driven	Parameters computed by the compiler instead of set by the author
events[].manner, state	Manner tags and the actor's effective state
events[].points	Offsets of inner points from the start of the event
events[].assets	Paths to files created during preparation
events[].live	Live bindings: the parameter and the channel it tracks
audio[]	Clips for the mix: file, start, gain in dB, pan
Example

Four of the nine events and two of the four audio clips are shown.

json
{
  "version": 1,
  "source": { "file": "scenario.md", "hash": "sha256:9f2c…" },
  "profile": { "width": 1920, "height": 1080, "fps": 30, "seed": 42, "lang": "en" },
  "duration": 11.4,
  "frames": 342,
  "plugins": { "actor2d": "0.3.0", "speech": "0.2.1" },
  "actors": {
    "anna":  { "model": "girl", "voice": "anna_v1",  "pos": [300, 800] },
    "boris": { "model": "bear", "voice": "boris_v1", "pos": [1500, 800] }
  },
  "evalOrder": ["anna.body", "boris.body", "boris.gaze"],
  "events": [
    {
      "id": "L1", "line": 1, "t": 0, "dur": 1.6,
      "actor": "anna", "channels": ["voice", "mouth"],
      "plugin": "speech", "action": "say",
      "params": { "text": "Hi, Boris!", "rate": 1 },
      "points": { "word:1": 0, "word:2": 0.7 },
      "assets": { "audio": "assets/L1.wav", "visemes": "assets/L1.visemes.json" }
    },
    {
      "id": "walk", "line": 6, "t": 3.6, "dur": 4,
      "actor": "anna", "channels": ["body"],
      "plugin": "actor2d", "action": "walk",
      "params": { "from": [300, 800], "to": [900, 800], "speed": 150 }
    },
    {
      "id": "L8", "line": 8, "t": 3.6, "dur": 4,
      "actor": "boris", "channels": ["body"],
      "plugin": "actor2d", "action": "walk",
      "params": { "from": [1500, 800], "to": [1050, 800], "speed": 112.5 },
      "driven": ["speed"]
    },
    {
      "id": "L11", "line": 11, "t": 8.4, "dur": 2,
      "actor": "boris", "channels": ["gaze"],
      "plugin": "actor2d", "action": "look-at",
      "params": {},
      "live": { "target": "anna.body" }
    }
  ],
  "audio": [
    { "event": "L1",   "src": "assets/L1.wav",   "t": 0,   "gain": 0, "pan": -0.4 },
    { "event": "song", "src": "assets/song.wav", "t": 3.6, "gain": 0, "pan": -0.4 }
  ]
}
Format rules
Events are sorted by t, and by id when equal.
The frame number equals t times fps and is always an integer.
The renderer ignores unknown fields, so the format can grow without a version change.
Audio is not recorded in the browser: the mix is assembled from the audio section. Overlapping voices are simply overlapping clips.
9. Compilation algorithm

The compiler builds one dependency graph over all values (parameters, coordinates, time points, durations) and evaluates them in topological order. Time and space are not split into phases, because the duration of a walk depends on geometry and a position snapshot depends on time.

Parse. Markdown becomes a tree of scenes, blocks and lines. Every node keeps its line number.
Bind to manifests. For each line the action is found, parameter names and types are checked, the default cascade is applied, and the channels and duration type are determined.
Prepare assets. Plugins synthesise speech and return intrinsic durations and offsets of inner points. The result is cached by a hash of the action, parameters, voice and plugin version.
Build the graph. Nodes are values, edges mean "is computed from". Block rules and explicit anchors give edges between time points, constructions give edges between coordinates, and derived durations tie the two together.
Count degrees of freedom. The driving values of each event are counted. Extra ones raise E_OVERCONSTRAINED, missing ones are closed with defaults.
Evaluate. The graph is walked in topological order. A cycle raises E_CYCLE. Elastic events get their end once the end of their block or group is known.
Check. Overlaps on channels, negative durations, tolerances, and absence of cycles among live bindings.
Snap to frames. Each time point is rounded to the nearest frame. A duration is recomputed as the difference of the rounded points, so adjacent events stay adjacent.
Write. The hierarchy is flattened into a plain list, state is substituted into events, and timeline.json and the list of diagnostics are emitted.

Steps 1, 2 and 5 need no assets and run in milliseconds. They are worth exposing as a quick check mode that the AI calls right after writing a scenario.

This scheme needs no linear constraint solver. One becomes necessary only for time, and only once tolerances come with mutual requirements that cannot be evaluated in order.

10. Plugin contract

A plugin is a manifest plus four functions. The manifest is the single source for validation, for counting degrees of freedom, and for the command reference that the AI receives.

Manifest
json
{
  "plugin": "actor2d",
  "version": "0.3.0",
  "channels": ["body", "arms", "gaze", "mood"],
  "actions": {
    "walk": {
      "channels": ["body"],
      "duration": "derived",
      "drivers": ["speed", "dur"],
      "params": {
        "to": { "type": "point", "required": true },
        "speed": {
          "type": "number", "unit": "units/s", "default": "normal",
          "presets": { "slow": 150, "normal": 300, "fast": 500 }
        }
      }
    },
    "wave": {
      "channels": ["arms"],
      "duration": "intrinsic",
      "points": ["stroke"]
    },
    "look-at": {
      "channels": ["gaze"],
      "duration": "elastic",
      "params": { "target": { "type": "actor", "live": true, "required": true } }
    },
    "mood": {
      "channels": ["mood"],
      "duration": "instant",
      "main": { "name": "value", "type": "enum", "values": ["neutral", "sad", "happy", "angry"] }
    }
  },
  "manner": ["tired", "angry", "happy"]
}
Action key	Meaning
channels	The channels the action occupies
duration	Duration type: intrinsic, derived, explicit, instant, elastic
drivers	Parameters of which exactly one must be driving
params	Schema of the named parameters: type, unit, default, presets, the live flag
main	The main argument, written after the colon
points	Inner points available to anchors
Functions
Function	Runs in	When	Returns
prepare(event, ctx)	Node	Compilation, step 3	Assets, the intrinsic duration, offsets of inner points
measure(event, ctx)	Node	Compilation, step 6	The derived duration from the parameters, or the driven parameter from the duration
sample(event, u, ctx)	Node and browser	Compilation and render	The state of the channels at local moment u: position, pose, phase
draw(state, stage)	Browser	Render	Nothing; draws the state into the frame
Requirements
Purity. sample depends only on its arguments. No timers, no real time, no accumulated state.
One code base in two environments. The compiler calls sample for position snapshots, the renderer calls it for every frame. The results must match.
Randomness from the seed. The generator receives the seed from ctx and the event identifier.
Live parameters. The value of a live parameter arrives in ctx already evaluated for the current frame: the renderer walks the channels in evalOrder.

Rendering one frame: for the moment t, select the active events, call sample with local time in evalOrder, then draw. A channel with no active event gets the idle state and the position where the previous event on that channel ended.

11. Implementation order and open questions

The model is introduced in five layers; each yields a working result and does not break the format of the layer before it.

Layer	What is added	Sections
1. Core	Line parsing, seq, par, &, labels and anchors, intrinsic and elastic duration, channel check, timeline.json	2, 3, 7, 8
2. Parameters	Front matter, cascade, expressions, presets, manner and state, statuses and error codes	5, 6
3. Geometry	Reference points, constructions, derived duration, driven speed, snapshots	4
4. Live bindings	look-at, follow, the evalOrder order	4, 10
5. Tolerances and rhythm	Duration tolerances, the beat grid, a solver for time	3, 9
Decisions that differ from the discussion
Line syntax. Parameters moved before the colon: anna walk to=tree speed=slow instead of anna walk: to=tree, speed=slow. Otherwise the text of a spoken line containing commas, an equals sign or @ cannot be told apart from parameters.
Snapshot moment. The default is the start of the event, not its end. The end of a walk depends on its target, so a snapshot at the end would create a cycle.
Commands in fenced blocks. Commands live in a script block, not in the ordinary text of the file. That way the parser never confuses a command with prose.
Open questions
[ ] Singing: is singing synthesis needed, or is ready-made audio enough? The answer decides whether the beat grid is needed in the first layer.
[ ] Sync precision: are word:N points needed? They require word timestamps from the speech model or a separate alignment step.
[ ] Units of space: frame pixels or abstract scene units? Abstract units are needed if one scenario is built into frames of different aspect ratios.
[ ] An anchored line in seq: should the next line wait for its end, or for the end of the previous non-anchored line?
[ ] Channel idle: does the plugin provide it implicitly, or does the compiler insert explicit idle events into the gaps?
[ ] Macros and scene templates: postponed until real scenarios show repetition.