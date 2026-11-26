// The plugin's part of the video tool's guide to a script (the tool's AGENTS.md, "prompt" and "A
// script"): what a cartoon can show, a cartoon's file with an example, how to turn a story into it,
// and how to draw a new character or background for the library. A web chat reads it with no file of
// this project: the tool adds how a script is written, the actions, library.yaml and the voices.

/** How to draw what the library lacks: the guide's last part. */
const DRAWING = `### Drawing a new character

A character the library lacks is drawn under library: characters:, in the library's format.

- It has its voice and its parts, each part a list of shapes, drawn in the order written. A shape is a rect or an ellipse: at is its centre, size its width and height, fill its colour as #rrggbb. A rect may have round, its corners' radius.
- Its shapes are measured from the point between its feet: x goes right and y goes down, so [0, -170] is 170 pixels above the ground. Draw it facing right: a turn mirrors it.
- Give it the four parts the others have, so that it can do all they do:
  - body comes first. Ears, a snout, a tail or a hat are more shapes in it, or parts of their own before the arm.
  - arm hangs straight down on its front side (its right), after the body, so it is drawn over it. With an arm, the character has shoulder: [x, y] beside its parts: the middle of the arm's upper end, which the arm turns around.
  - eyes blink. Put the pupils nearer the right side of each eye, the way it faces.
  - mouth is drawn closed, as a flat shape inside the body, with room under it for the jaw to drop, about 0.9 of its width: it opens as the character talks.
- Make it easy to tell from the others: its own colour and its own size. Pip is 220 by 340 pixels, Mo 190 by 430, Tuk 170 by 240. Keep it at most 400 wide, so it stays clear of a neighbour on the next mark, and at most 700 tall. Say in a comment what it is.

### Drawing a new background

A background the library lacks is drawn under library: backgrounds:, when no background of the library is the story's place. Its fill is the sky's colour; its shapes are drawn over it in the order written, in the stage's points: x from 0 at the left to 1920, y from 0 at the top to 1080. Keep the ground from y 820 down to the bottom, as in the library's: the characters stand at y 880. Draw it plainly, in big shapes that stay clear of the characters: the sun, hills, a house, a river along the ground.
`;

/**
 * The plugin's part of the guide to a cartoon's script (the tool's AGENTS.md, "A script"), which
 * the tool's prompt for a web chat has: what a cartoon can show, a whole file as an example, a
 * scene's own keys, how a story is told in it, and how to draw what the library lacks. The tool adds how a script's lines are written, and the actions (script.ts, ACTIONS). The
 * example compiles against library.yaml (script.test.ts).
 */
export const SCRIPT_GUIDE = `
A cartoon is drawn on one stage, 1920 by 1080 pixels, with characters made of flat rectangles and ellipses. They stand on the ground in front of a background, which can change, as a cut; they walk, turn round, look at one another, hop, wave, point, blink and talk, several of them at once where the story has it so, and one of them several things at once. A cartoon has no props, no faces that change, and nobody who sits, lies down, climbs, flies or swims: what the story has besides, the narrator says in a few words, or it is left out. Never invent a key, a mark or an action: the tool refuses it.

### An episode

\`\`\`yaml
use: cartoon
cast: { radio: am_michael }                # a voice nobody is drawn for: a radio, a crowd, someone off stage
values: { beat: 0.4s, pause: beat }        # what holds for the whole cartoon
scenes:
  - background: morning                    # a background of the library
    places: { pip: off-left, mo: right }   # where each character of the scene stands as it begins
    faces: { mo: left }                    # who faces left as the scene begins; the others face right
    script: |
      pip walk to=middle
      & narrator say: It is morning in the meadow, and Pip is early.
      pip wave
      & [hello] pip say: Hello, Mo! Have you heard the news today?
      mo say @ hello.word(news): What news?
      & pip stand
      together:
        radio say: And now the news. The pond is frozen, and it will stay so all week.
        in order pause=beat / 2:
          pip say: There it is!
          mo say: Hush, I want to hear.
      together:
        mo jump times=2
        mo say: We can skate!
        pip turn @ block.start + 1s
        pip point @ prev.end
  - background: sundown                    # a new scene: everyone placed anew
    places:                                # a place with a comma in it is on a row of its own
      pip: off-left
      mo: left-of(pond, near)
    faces: { mo: left }
    values: { beat: 0.6s, pond: 1500 }     # the evening is slower, its pauses a longer beat; and a point of the scene's own
    script: |
      ending together:
        pip walk to=left-of(mo, near)
        [late] narrator say: Pip comes back as the night falls.
      scene background to=night @ late.word(night)
      in order:
        under:
          mo say: One star, two stars, three stars, four stars.
          mo say: Five stars, six stars, seven stars, eight stars.
        narrator say: And Mo counts the stars.
        pip say: Good night, Mo.
      together:
        pip walk to=off-right speed=slow
        pip wave
        mo look-at target=pip
        narrator say: And Pip goes home.
\`\`\`

### Scenes and places

- A scene is one stretch of the story. It names the background it begins with, the place where each of its characters stands as it begins (places), who faces left (faces), and its script; it may have values. A new scene begins anew: everyone at its own place, facing as the scene says.
- Time passing in the same place is no new scene: scene background to=night changes the background there, at once, as its row begins, and it stays so until a row changes it again. Everyone stays where they are, and goes on with what they do. Nobody does it, so the row is the scene's. Join it to the line that tells of it, or begin it at a word of that line: @ late.word(night). For a look at it with nothing said, give it its time: takes=2s.
- A place is a mark, a point, or one worked out from others by a construction (left-of, right-of and midpoint, below). Everyone stands on the ground, so a place says only how far across the stage.
- The marks are left, middle and right on the stage, and off-left and off-right out of sight, where any number wait. A place that is not a mark is on the stage.
- A point is a number from 0, the stage's left edge, to 1920, its right. Give the ones a scene comes back to a name, among its values: values: { pond: 1500 }. Then to=pond goes there, and to=pond + 100 a little to its right.
- In a place worked out, a character's name is where the rows above leave that character, whichever blocks they are in: below pip walk to=right, to=left-of(pip, near) is beside where Pip's walk ends. Nothing below moves it.
- Use a mark unless the story says more: who comes up to somebody goes to left-of(mo, near) or right-of(mo, near), whichever side it comes from, and who steps between two to midpoint(pip, mo).
- Two characters never stand on one spot of the stage, as a scene begins or after a walk: a character may cover at most 0.3 of another, of the smaller one's width. So nobody goes to=mo, where Mo stands: they go beside Mo.
- Who goes where another stands is refused, unless that other has surely left by then, however long the voices turn out to be. Write the row that takes the other away above, or join the two by &.
- Everyone faces right, as drawn, unless the scene's faces says left, or a turn or a look. A walk turns nobody: a character walks the way it faces. To go back the way it came, it turns first; who comes in from the right begins the scene facing left. Two who talk face each other. Work out each character's facing row by row: after a look, it is the side where the one looked at was as it ended, and a turn goes the other way from there.
- A character the scene does not place may speak too: it is a voice off stage. So may a name the file's cast gives a voice: cast: { radio: am_michael }, on top, beside use. Nobody else is drawn for it.
- A walk is over before the next row, unless it is joined to words or together with them: then it lasts as long as they do, within reason. Join a walk to the line that tells of it. To have the words end as somebody arrives, write the two in an ending together: the walk keeps its own pace, and the words wait. That is for a walk that ends on the stage: one that leaves it is out of sight before it ends.
- Leave a walk's speed and time out, unless the story has somebody hurry or dawdle: a walk that is given one keeps it, and the next row waits. Set pip.speed on a scene for somebody who is slow all through it, or walk.speed for everybody.

### Several things at once

- A character's place, its hop, its facing, its arm and its voice are channels: it walks, hops, turns, waves and talks at once, and each is a row of its own, joined by & or in a together.
- Only a walk is fitted to words. A jump, a turn and the arm keep their own pace: join them to the words they go with.
- Who does something a little later begins by a moment: @ block.start + 1s, or at a word, @ hello.word(news).
- A wave or a point goes on until the character's arm does something else, through the rows after it. Put it back with stand when its moment is over, or a wave goes on waving; a new scene begins with everyone's arm hanging.
- A point goes straight ahead, so the pointer faces what it points at. It and a wave need the character's arm.
- Who watches somebody walk past, or turns to whoever comes, has a look: mo look-at target=pip. It is open, so join it to the walk it watches, or put it in that walk's together. On a row of its own, not joined, it goes on to the end of the scene, or of the block it is in. All that while its character neither turns nor looks at anybody else.
- A look is for one who stands: somebody who walks away from the one it looks at would go backwards. It is at a character of the scene, and not at a place.
- Two who go somewhere together are two walks, joined: mo walk to=right, and below it & pip walk to=left-of(mo, near). Pip keeps beside Mo all the way, if it stands there as they set out.
- Two who run off together, out of the scene, are two walks to off-right, or off-left, joined and given one speed: pip walk to=off-right speed=fast, and below it & mo walk to=off-right speed=fast. So they keep their gap. Fitted to the words beside them, the one behind would hurry, and run into the other.

### Lines

- What the story tells in one sentence is often several rows: she stops, says hello, turns away.
- A line is a sentence or two, said by one character or by the narrator. A longer speech is several lines, one under another.
- Keep a line to about 45 characters: a longer one is a caption of two rows, and its upper row covers the characters' feet.
- What a character says in the story, it says: write reported speech as the words themselves.
- People who talk over each other are drawn so, and heard so, and two of them have a caption each at once. Keep it for what the story has at once: a chorus, someone breaking in, talk over a radio, a crowd under two who talk.
- The narrator says what nobody says and the picture cannot show: where we are, who somebody is, what somebody feels, time passing.
- Write for the ear: plain words, no brackets, no stage directions. The line is also the caption.

${DRAWING}`;
