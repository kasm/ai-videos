// The plugin's part of the video tool's prompt (the tool's AGENTS.md, "prompt"): what a cartoon can
// show, the format of a cartoon's file with an example, how to turn a story into it, and how to draw
// a new character or background for the library. A web chat reads it with no file of this project:
// the tool adds the commands (scenario.ts, COMMANDS), library.yaml and the voices. The example
// passes the plugin's checks against library.yaml (plugin.test.ts).

export const GUIDE = `
A cartoon is drawn on one stage, 1920 by 1080 pixels, with characters made of flat rectangles and ellipses. They stand on the ground in front of a background; they walk, turn round, hop, wave and point, blink and talk; and the background can change, as a cut. A cartoon has no props, no faces that change, no two moves at once, and nobody who sits, lies down, climbs, flies or swims. What the story has and a cartoon cannot show, the narrator says in a few words, or it is left out. Never invent a key, a pose or a mark: the tool refuses it.

### An episode

\`\`\`yaml
use: cartoon
scenes:
  - background: morning                   # a background of the library
    places: { pip: middle, mo: off-right } # the mark each character of the scene stands on as it begins
    faces: { mo: left }                   # who faces left as the scene begins; the others face right
    beats:
      - name: morning                     # a beat's name is its own in the whole episode
        says:
          - { who: narrator, text: "It is morning in the meadow." }
      - name: mo-comes
        walk: { who: mo, to: right }
        says:
          - { who: narrator, text: "Here comes Mo." }
      - name: pip-waves
        pose: { pip: wave }
        says:
          - { who: pip, text: "Hello, Mo!" }
      - name: mo-answers
        pose: { pip: stand }
        says:
          - { who: mo, text: "Hello, Pip. Look how late it is." }
      - name: night-falls
        takes: 2                          # a pause with nothing said
        background: night
      - name: pip-jumps
        jump: { who: pip, times: 2 }
        says:
          - { who: pip, text: "The stars are out!" }
  - background: meadow                    # a new scene: everyone placed anew, standing
    places: { mo: left, pip: right }
    faces: { pip: left }
    beats:
      - name: next-day
        says:
          - { who: narrator, text: "The next morning, they meet again." }
      - name: mo-points
        pose: { mo: point }
        says:
          - { who: mo, text: "Look, Pip, the sun is up." }
      - name: pip-turns
        turn: { who: pip }
        pose: { mo: stand }
      - name: pip-leaves
        walk: { who: pip, to: off-right }
        says:
          - { who: pip, text: "Goodbye, Mo!" }
\`\`\`

### Scenes, marks and beats

- A scene is one stretch of the story in one place. It names the background it begins with, the mark each of its characters stands on as it begins (places), and who faces left (faces). Time passing in the same place is a beat's background, not a new scene. A new scene begins anew: everyone on its own mark, facing as the scene says, standing.
- The marks are where characters stand: left, middle and right on the stage, one character each, and off-left and off-right out of sight, where any number wait. Two characters never stand on one mark of the stage, as a scene begins or after a walk.
- A beat is one thing happening, in order. Its name is lowercase letters, digits and dashes, a letter first, and no other beat of the episode has it. A beat has at most one move, a walk, a turn or a jump, by a character the scene places. As it begins it may change poses and the background. What the story tells in one sentence is often several beats: he stops, says hello, turns away.
- A beat's takes is its length in seconds, and is mostly left out: a move then takes its own time, and a beat with lines as long as they take to say. Write it only for a pause with nothing said, or a move slower than its own.
- A beat's says lists the lines said during it, in order, each with who (a character's name, or narrator, whom nobody draws) and text. A character the scene does not place may speak too: it is a voice off stage.

### Moving and facing

- Everyone faces right, as drawn, unless the scene's faces or a turn says otherwise. Work out each character's facing beat by beat.
- A walk turns nobody: a character walks the way it faces. To go back the way it came, it turns first, in a beat before the walk.
- Coming and going is a walk from or to off-left or off-right. Who comes in from the right begins the scene facing left.
- Two who talk face each other. A point goes straight ahead, so the pointer faces what it points at.
- A pose stays until a later beat of the scene changes it: put it back to stand when its moment is over, or a wave goes on waving.

### Lines

- A line is a sentence or two, said by one character or by the narrator. A longer speech is several lines, in one beat or in beats that follow.
- Keep a line to about 45 characters: a longer one is a caption of two rows, and its upper row covers the characters' feet.
- What a character says in the story, it says: write reported speech as the words themselves.
- The narrator says what nobody says and the picture cannot show: where we are, who somebody is, what somebody feels, time passing. The narrator does not repeat what the picture shows.
- Write for the ear: plain words, no brackets, no stage directions. The line is also the caption.

### Drawing a new character

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
 * The plugin's part of the guide to a cartoon written as a script (the tool's AGENTS.md, "A
 * script"): what such a cartoon can show, a whole file as an example, and a scene's own keys. The
 * tool adds how a script's lines are written, and the actions (script.ts, ACTIONS). The example
 * compiles against library.yaml (script.test.ts). It teaches what a script has so far, and grows
 * with it.
 */
export const SCRIPT_GUIDE = `
A cartoon is drawn on one stage, 1920 by 1080 pixels, with characters made of flat rectangles and ellipses. They stand on the ground in front of a background; they walk, turn round, hop, wave, point, blink and talk, several of them at once where the story has it so, and one of them several things at once. A cartoon has no props, no faces that change, and nobody who sits, lies down, climbs, flies or swims: what the story has besides, the narrator says in a few words, or it is left out. Never invent a key, a mark or an action: the tool refuses it.

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
  - background: night                      # a new scene: everyone placed anew
    places:                                # a place with a comma in it is on a row of its own
      pip: off-left
      mo: left-of(pond, near)
    faces: { mo: left }
    values: { beat: 0.6s, pond: 1500 }     # the evening is slower, its pauses a longer beat; and a point of the scene's own
    script: |
      ending together:
        pip walk to=left-of(mo, near)
        narrator say: By night, Pip comes back.
      in order:
        under:
          mo say: One star, two stars, three stars, four stars.
          mo say: Five stars, six stars, seven stars, eight stars.
        narrator say: And Mo counts the stars.
        pip say: Good night, Mo.
      together:
        pip walk to=off-right speed=slow
        pip wave
        narrator say: And Pip goes home.
\`\`\`

### Scenes and places

- A scene is one stretch of the story. It names the background it begins with, the place where each of its characters stands as it begins (places), who faces left (faces), and its script; it may have values. A new scene begins anew: everyone at its own place, facing as the scene says.
- A place is a mark, a point, or one worked out from others by a construction (left-of, right-of and midpoint, below). Everyone stands on the ground, so a place says only how far across the stage.
- The marks are left, middle and right on the stage, and off-left and off-right out of sight, where any number wait. A place that is not a mark is on the stage.
- A point is a number from 0, the stage's left edge, to 1920, its right. Give the ones a scene comes back to a name, among its values: values: { pond: 1500 }. Then to=pond goes there, and to=pond + 100 a little to its right.
- In a place worked out, a character's name is where the rows above leave that character, whichever blocks they are in: below pip walk to=right, to=left-of(pip, near) is beside where Pip's walk ends. Nothing below moves it.
- Use a mark unless the story says more: who comes up to somebody goes to left-of(mo, near) or right-of(mo, near), whichever side it comes from, and who steps between two to midpoint(pip, mo).
- Two characters never stand on one spot of the stage, as a scene begins or after a walk: a character may cover at most 0.3 of another, of the smaller one's width. So nobody goes to=mo, where Mo stands: they go beside Mo.
- Who goes where another stands is refused, unless that other has surely left by then, however long the voices turn out to be. Write the row that takes the other away above, or join the two by &.
- Everyone faces right, as drawn, unless the scene's faces says left, or a turn. A walk turns nobody: a character walks the way it faces. To go back the way it came, it turns first; who comes in from the right begins the scene facing left. Two who talk face each other. Work out each character's facing row by row.
- A character the scene does not place may speak too: it is a voice off stage. So may a name the file's cast gives a voice: cast: { radio: am_michael }, on top, beside use. Nobody else is drawn for it.
- A walk is over before the next row, unless it is joined to words or together with them: then it lasts as long as they do, within reason. Join a walk to the line that tells of it. To have the words end as somebody arrives, write the two in an ending together: the walk keeps its own pace, and the words wait. That is for a walk that ends on the stage: one that leaves it is out of sight before it ends.
- Leave a walk's speed and time out, unless the story has somebody hurry or dawdle: a walk that is given one keeps it, and the next row waits. Set pip.speed on a scene for somebody who is slow all through it, or walk.speed for everybody.

### Several things at once

- A character's place, its hop, its facing, its arm and its voice are channels: it walks, hops, turns, waves and talks at once, and each is a row of its own, joined by & or in a together.
- Only a walk is fitted to words. A jump, a turn and the arm keep their own pace: join them to the words they go with.
- Who does something a little later begins by a moment: @ block.start + 1s, or at a word, @ hello.word(news).
- A wave or a point goes on until the character's arm does something else, through the rows after it. Put it back with stand when its moment is over, or a wave goes on waving; a new scene begins with everyone's arm hanging.
- A point goes straight ahead, so the pointer faces what it points at. It and a wave need the character's arm.

### Lines

- A line is a sentence or two, said by one character or by the narrator. A longer speech is several lines, one under another.
- Keep a line to about 45 characters: a longer one is a caption of two rows, and its upper row covers the characters' feet.
- What a character says in the story, it says: write reported speech as the words themselves.
- People who talk over each other are drawn so, and heard so, but only one caption shows at a time. Keep it for what the story has at once: a chorus, someone breaking in, talk over a radio, a crowd under two who talk.
- The narrator says what nobody says and the picture cannot show: where we are, who somebody is, what somebody feels, time passing.
- Write for the ear: plain words, no brackets, no stage directions. The line is also the caption.
`;
