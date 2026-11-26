```yaml
episode: the-race-1
library:
  characters:
    bramble: # a small, round, brown hedgehog with prickles and a pointed snout, about 265 by 240
      voice: bf_isabella
      shoulder: [75, -94]
      parts:
        body:
          - { shape: rect, at: [-70, -190], size: [18, 50], round: 9, fill: "#4a301c" } # the prickles on top
          - { shape: rect, at: [-40, -208], size: [18, 50], round: 9, fill: "#4a301c" }
          - { shape: rect, at: [-8, -215], size: [18, 50], round: 9, fill: "#4a301c" }
          - { shape: rect, at: [28, -208], size: [18, 50], round: 9, fill: "#4a301c" }
          - { shape: rect, at: [-100, -165], size: [50, 18], round: 9, fill: "#4a301c" } # and down the back
          - { shape: rect, at: [-108, -128], size: [50, 18], round: 9, fill: "#4a301c" }
          - { shape: rect, at: [-108, -90], size: [50, 18], round: 9, fill: "#4a301c" }
          - { shape: rect, at: [-98, -52], size: [50, 18], round: 9, fill: "#4a301c" }
          - { shape: rect, at: [0, -105], size: [200, 210], round: 95, fill: "#7a5230" }
          - { shape: ellipse, at: [20, -100], size: [150, 160], fill: "#d9b48a" } # the face
          - { shape: ellipse, at: [95, -102], size: [75, 38], fill: "#d9b48a" } # the snout
          - { shape: ellipse, at: [130, -108], size: [24, 22], fill: "#2b1d14" } # the nose
        arm:
          - { shape: rect, at: [75, -70], size: [32, 80], round: 16, fill: "#5c3c22" }
        eyes:
          - { shape: ellipse, at: [-12, -142], size: [34, 42], fill: "#ffffff" }
          - { shape: ellipse, at: [48, -142], size: [34, 42], fill: "#ffffff" }
          - { shape: ellipse, at: [-2, -139], size: [14, 18], fill: "#1c1917" }
          - { shape: ellipse, at: [58, -139], size: [14, 18], fill: "#1c1917" }
        mouth:
          - { shape: ellipse, at: [20, -80], size: [46, 12], fill: "#5b2333" }
use: cartoon
cast: { radio: am_michael }
values: { pause: 0.4s }
scenes:
  - background: morning
    places: { mo: off-left, pip: off-right, bramble: off-left, tuk: off-right }
    faces: { pip: left, tuk: left }
    script: |
      mo walk to=700
      & narrator say: Every morning, Mo brings out his old radio.
      pip walk to=1200
      & narrator say: And Pip comes to hear the news with him.
      narrator say: This morning, they are there early.
      jingle play
      radio say: Good morning. Today at noon there is a race
      radio say: to the big oak, at the far end of the meadow.
      radio say: Whoever gets there first wins a basket of plums.
      together:
        pip say volume=4dB: A race!
        mo say volume=4dB: A race!
        pip jump
        mo jump
      in order:
        under volume=-12dB:
          radio say: And now the weather. It will be dry all morning, with a light wind from the west.
          radio say: Clouds will come in the afternoon, and there may be a little rain tonight.
        [boast] mo say: I have the longest legs in the meadow, so I...
        pip say @ boast.word(so): And I have the fastest feet!
        narrator say: The radio goes on about the weather.
        narrator say: Nobody listens to it.
      rustle play
      narrator say: Something rustles in the long grass.
      bramble walk to=330
      & narrator say: Out steps somebody they have never seen.
      & mo turn
      narrator say: A hedgehog, small, round, brown and prickly.
      narrator say: Her name is Bramble. She lives in the hedge
      narrator say: at the end of the meadow.
      bramble say: If you please, I would like to race too.
      together:
        pip say: Ha, ha, ha!
        mo say: Ha, ha, ha!
        pip jump times=2
      mo say: A hedgehog? In a race?
      tuk walk to=1560 speed=fast
      & narrator say: Then Tuk runs in, all out of breath.
      & pip turn
      tuk say: I heard it on the radio! I am racing too!
      & tuk jump
      narrator say: Now there are four who want those plums.
```

```yaml
episode: the-race-2
use: cartoon
cast: { radio: am_michael }
values: { pause: 0.4s }
scenes:
  - background: morning
    places: { bramble: 330, mo: 700, tuk: 1130, pip: 1390 }
    script: |
      narrator say: Today there is a race to the big oak.
      narrator say: The first one there wins a basket of plums.
      narrator say: Pip, Mo and Tuk all want to win it.
      narrator say: So does Bramble, a small hedgehog.
      narrator say: Now everybody talks at once.
      in order:
        under volume=-14dB:
          radio say: Tonight will be cool, with mist on the pond. Tomorrow brings sun in the morning, and then more clouds.
        together:
          pip say: The plums are mine! I have the fastest feet!
          mo say: No, mine! I have the longest legs!
          tuk say volume=-8dB: I heard it too, I heard it on the radio!
          bramble say volume=-8dB: Excuse me, please, may I say something?
        narrator say: And nobody hears anybody.
      [ready] mo say: Ready, steady...
      pip walk to=off-right speed=fast @ ready.end
      & tuk walk to=off-right speed=fast
      & mo look-at target=pip
      & narrator say: Before Mo can say go, Pip and Tuk are off!
      narrator say: Mo stares after them.
      narrator say: Bramble does not run.
      bramble turn
      & narrator say: She turns round,
      bramble walk to=off-left speed=slow
      & narrator say: and slowly walks off the other way.
  - background: oak-foot
    places: { bramble: 740, mo: off-right, pip: off-left, tuk: off-left }
    faces: { mo: left }
    script: |
      narrator say: At the big oak, all is quiet.
      narrator say: Bramble is there first, waiting under it.
      mo walk to=1260
      & narrator say: Next comes Mo, puffing and blowing.
      together:
        mo say: Bramble? You are here already?
        mo jump
      [run] pip walk to=450 speed=fast
      & narrator say: Last come Pip and Tuk, from the wrong side!
      tuk walk to=190 speed=fast @ run.start + 0.5s
      & bramble turn
      narrator say: Hot and tired, they ran all round the meadow.
      bramble say: The big oak was this way all along.
      narrator say: Bramble has won the basket of plums.
      narrator say: And she shares them with everybody,
      narrator say: for a race is more fun when all get a plum.
      together:
        pip say: Thank you!
        tuk say: Thank you!
      bramble turn
      & mo say: Next year I will hear the news to the end!
      & mo wave
```

All episodes written.

- The radio is only heard, and the long grass is only a rustle.
- The basket, the plums, the hedge and how tired the runners are get told by the narrator, not drawn.
- I added a few words of my own: the weather report, some of the chatter when everybody talks at once, and a short recap to open episode 2. The moment where everybody talks at once also opens episode 2, after Tuk's arrival ends episode 1.
