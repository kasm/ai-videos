```yaml
episode: forest1-1
library:
  characters:
    mole: # round black mole with pink snout and claws, 210 by 270
      voice: am_liam
      shoulder: [95, -160]
      parts:
        body:
          - { shape: rect, at: [0, -135], size: [210, 270], round: 105, fill: "#2b2d38" }
          - { shape: ellipse, at: [102, -165], size: [42, 30], fill: "#e89cae" }
        arm:
          - { shape: rect, at: [95, -115], size: [42, 120], round: 21, fill: "#3e4152" }
        eyes:
          - { shape: ellipse, at: [-40, -195], size: [38, 46], fill: "#ffffff" }
          - { shape: ellipse, at: [40, -195], size: [38, 46], fill: "#ffffff" }
          - { shape: ellipse, at: [-28, -192], size: [16, 20], fill: "#14151a" }
          - { shape: ellipse, at: [52, -192], size: [16, 20], fill: "#14151a" }
        mouth:
          - { shape: ellipse, at: [0, -132], size: [56, 14], fill: "#7a2e43" }
    rabbit: # tall grey-brown elderly rabbit with long ears, 190 by 390
      voice: bm_george
      shoulder: [85, -195]
      parts:
        body:
          - { shape: rect, at: [-26, -340], size: [36, 110], round: 18, fill: "#9e9389" }
          - { shape: rect, at: [26, -340], size: [36, 110], round: 18, fill: "#9e9389" }
          - { shape: rect, at: [0, -160], size: [190, 320], round: 95, fill: "#b5aaa0" }
          - { shape: ellipse, at: [95, -195], size: [30, 24], fill: "#e396a4" }
        arm:
          - { shape: rect, at: [85, -140], size: [38, 130], round: 19, fill: "#8c8177" }
        eyes:
          - { shape: ellipse, at: [-38, -235], size: [40, 48], fill: "#ffffff" }
          - { shape: ellipse, at: [38, -235], size: [40, 48], fill: "#ffffff" }
          - { shape: ellipse, at: [-26, -232], size: [16, 22], fill: "#2b2d42" }
          - { shape: ellipse, at: [50, -232], size: [16, 22], fill: "#2b2d42" }
        mouth:
          - { shape: ellipse, at: [0, -165], size: [54, 14], fill: "#5b2333" }
    squirrel: # slender russet red squirrel with tufted ears and bushy tail, 240 by 310
      voice: af_bella
      shoulder: [85, -180]
      parts:
        body:
          - { shape: rect, at: [-82, -165], size: [78, 220], round: 39, fill: "#a8441e" }
          - { shape: rect, at: [-32, -295], size: [26, 56], round: 13, fill: "#c95628" }
          - { shape: rect, at: [32, -295], size: [26, 56], round: 13, fill: "#c95628" }
          - { shape: rect, at: [0, -145], size: [175, 290], round: 88, fill: "#d96230" }
        arm:
          - { shape: rect, at: [85, -132], size: [36, 118], round: 18, fill: "#b3491e" }
        eyes:
          - { shape: ellipse, at: [-36, -215], size: [42, 50], fill: "#ffffff" }
          - { shape: ellipse, at: [36, -215], size: [42, 50], fill: "#ffffff" }
          - { shape: ellipse, at: [-24, -212], size: [18, 22], fill: "#1c1917" }
          - { shape: ellipse, at: [48, -212], size: [18, 22], fill: "#1c1917" }
        mouth:
          - { shape: ellipse, at: [0, -150], size: [54, 14], fill: "#5b2333" }
  backgrounds:
    glade: # sunlit forest glade with mossy ground and dark tree trunks
      fill: "#cfe8b8"
      shapes:
        - { shape: rect, at: [190, 420], size: [150, 840], fill: "#5c4332" }
        - { shape: rect, at: [1740, 420], size: [170, 840], fill: "#5c4332" }
        - { shape: ellipse, at: [960, 110], size: [1920, 320], fill: "#4f8a42" }
        - { shape: rect, at: [960, 950], size: [1920, 260], fill: "#5a9649" }
    oak-foot: # foot of an ancient colossal oak beside a beech tree
      fill: "#b8dba3"
      shapes:
        - { shape: rect, at: [240, 420], size: [360, 840], fill: "#4a3525" }
        - { shape: rect, at: [1680, 420], size: [260, 840], fill: "#6e5d4f" }
        - { shape: ellipse, at: [1680, 470], size: [90, 140], fill: "#241d17" }
        - { shape: rect, at: [960, 950], size: [1920, 260], fill: "#4d853e" }
    canopy: # high emerald forest canopy with sunlit boughs and leaves
      fill: "#9cd48c"
      shapes:
        - { shape: ellipse, at: [480, 180], size: [1100, 380], fill: "#3e7834" }
        - { shape: ellipse, at: [1480, 190], size: [1050, 380], fill: "#48853d" }
        - { shape: rect, at: [960, 950], size: [1920, 260], fill: "#557d3e" }
use: cartoon
scenes:
  - background: glade
    places: { mole: off-left, rabbit: right }
    faces: { rabbit: left }
    beats:
      - name: spring-morning
        says:
          - { who: narrator, text: "All morning, Mole whitewashed his home." }
          - { who: narrator, text: "Spring called him up into the sunlight." }
      - name: mole-bursts-out
        walk: { who: mole, to: left }
        says:
          - { who: mole, text: "Hang spring-cleaning! This is fine!" }
      - name: mole-hops
        jump: { who: mole, times: 2 }
      - name: mole-trots
        walk: { who: mole, to: middle }
        says:
          - { who: narrator, text: "He trotted across the moss to a thicket." }
      - name: rabbit-demands
        pose: { rabbit: point }
        says:
          - { who: rabbit, text: "Sixpence for passing by the private path!" }
      - name: mole-jeers
        pose: { rabbit: stand }
        jump: { who: mole, times: 1 }
        says:
          - { who: mole, text: "Acorn-sauce!" }
      - name: rabbit-retreats
        turn: { who: rabbit }
      - name: rabbit-runs
        walk: { who: rabbit, to: off-right }
        says:
          - { who: narrator, text: "Mole bowled past the grumpy old rabbit." }
      - name: mole-rambles
        walk: { who: mole, to: off-right }
        says:
          - { who: narrator, text: "He rambled on through sunlit clearings." }
  - background: oak-foot
    places: { mole: off-left, squirrel: off-right }
    faces: { squirrel: left }
    beats:
      - name: mole-arrives-oak
        walk: { who: mole, to: middle }
        says:
          - { who: narrator, text: "Soon he stood beneath a colossal oak." }
          - { who: narrator, text: "Never had he seen the Deep Forest Canopy." }
      - name: squirrel-appears
        walk: { who: squirrel, to: right }
        says:
          - { who: narrator, text: "From a beech hollow peered a Red Squirrel." }
      - name: squirrel-greets
        pose: { squirrel: wave }
        says:
          - { who: squirrel, text: "Hullo, Mole! Would you like to come up?" }
      - name: mole-answers-ground
        pose: { squirrel: stand }
        says:
          - { who: mole, text: "Oh, it's all very well to talk." }
      - name: basket-ride
        says:
          - { who: narrator, text: "Squirrel lowered a mossy basket on vines." }
          - { who: narrator, text: "He hauled Mole smoothly into the boughs." }
  - background: canopy
    places: { mole: left, squirrel: right }
    faces: { squirrel: left }
    beats:
      - name: mole-rapture
        jump: { who: mole, times: 1 }
        says:
          - { who: mole, text: "I've never been up in the trees before!" }
      - name: squirrel-wisdom
        says:
          - { who: squirrel, text: "Nothing is half so worth doing," }
          - { who: squirrel, text: "as simply messing about in the treetops." }
      - name: mole-warns
        pose: { mole: point }
        says:
          - { who: mole, text: "Look above, Squirrel!" }
      - name: branch-bump
        pose: { mole: stand }
        jump: { who: squirrel, times: 1 }
        says:
          - { who: narrator, text: "Too late! The basket struck a stout limb." }
      - name: squirrel-laughs
        says:
          - { who: squirrel, text: "Or with branches! Shall we travel together?" }
      - name: mole-delighted
        jump: { who: mole, times: 2 }
        says:
          - { who: narrator, text: "Mole waggled his toes in pure bliss." }

```

```yaml
episode: forest1-2
library:
  characters:
    marten: # sleek brown-golden pine marten, 210 by 310
      voice: am_eric
      shoulder: [85, -180]
      parts:
        body:
          - { shape: rect, at: [-78, -140], size: [74, 180], round: 37, fill: "#694528" }
          - { shape: rect, at: [0, -155], size: [180, 310], round: 90, fill: "#855936" }
          - { shape: ellipse, at: [45, -145], size: [75, 110], fill: "#f2c97d" }
        arm:
          - { shape: rect, at: [85, -130], size: [36, 120], round: 18, fill: "#694528" }
        eyes:
          - { shape: ellipse, at: [-36, -225], size: [40, 48], fill: "#ffffff" }
          - { shape: ellipse, at: [36, -225], size: [40, 48], fill: "#ffffff" }
          - { shape: ellipse, at: [-24, -222], size: [16, 22], fill: "#1c1917" }
          - { shape: ellipse, at: [48, -222], size: [16, 22], fill: "#1c1917" }
        mouth:
          - { shape: ellipse, at: [0, -162], size: [54, 14], fill: "#5b2333" }
    badger: # broad black-and-white striped badger, 250 by 320
      voice: bm_lewis
      shoulder: [105, -185]
      parts:
        body:
          - { shape: rect, at: [0, -160], size: [250, 320], round: 115, fill: "#3b3e45" }
          - { shape: rect, at: [-35, -245], size: [26, 110], round: 13, fill: "#f0f2f5" }
          - { shape: rect, at: [35, -245], size: [26, 110], round: 13, fill: "#f0f2f5" }
        arm:
          - { shape: rect, at: [105, -135], size: [44, 130], round: 22, fill: "#282a2e" }
        eyes:
          - { shape: ellipse, at: [-38, -235], size: [42, 48], fill: "#ffffff" }
          - { shape: ellipse, at: [38, -235], size: [42, 48], fill: "#ffffff" }
          - { shape: ellipse, at: [-26, -232], size: [18, 22], fill: "#14151a" }
          - { shape: ellipse, at: [50, -232], size: [18, 22], fill: "#14151a" }
        mouth:
          - { shape: ellipse, at: [0, -165], size: [64, 15], fill: "#5b2333" }
  backgrounds:
    elm-bower: # mossy platform high in an ancient elm beside a dark thicket
      fill: "#96cf86"
      shapes:
        - { shape: ellipse, at: [1650, 360], size: [620, 740], fill: "#263d29" }
        - { shape: ellipse, at: [620, 170], size: [1200, 360], fill: "#3e7834" }
        - { shape: rect, at: [960, 950], size: [1920, 260], fill: "#4d7839" }
use: cartoon
scenes:
  - background: elm-bower
    places: { mole: left, squirrel: middle, marten: off-right, badger: off-right }
    faces: { squirrel: left, marten: left, badger: left }
    beats:
      - name: luncheon-basket
        says:
          - { who: narrator, text: "Squirrel swung the car along a ropeway." }
          - { who: mole, text: "What's inside that fat wicker basket?" }
      - name: squirrel-menu
        says:
          - { who: squirrel, text: "Chestnuts, hazelnuts, honeycomb, berries," }
          - { who: squirrel, text: "birch-sap, and elderflower wine!" }
      - name: mole-forest
        jump: { who: mole, times: 1 }
        says:
          - { who: mole, text: "O stop, stop! So this is a Forest!" }
      - name: squirrel-corrects
        says:
          - { who: squirrel, text: "The Forest! My world, and I want no other." }
      - name: mole-asks-thicket
        pose: { mole: point }
        says:
          - { who: mole, text: "What lies over there in those dark yews?" }
      - name: squirrel-warns-thicket
        pose: { mole: stand }
        turn: { who: squirrel }
      - name: squirrel-points-thicket
        pose: { squirrel: point }
        says:
          - { who: squirrel, text: "Just the Deep Thicket. Dear Badger lives there." }
          - { who: squirrel, text: "Never trust the weasels, stoats, or foxes." }
      - name: squirrel-turns-back
        pose: { squirrel: stand }
        turn: { who: squirrel }
      - name: lunch-begins
        says:
          - { who: squirrel, text: "Now, here's our mossy platform for lunch!" }
          - { who: mole, text: "O my! What a feast!" }
      - name: marten-arrives
        walk: { who: marten, to: right }
        says:
          - { who: narrator, text: "A sleek Pine Marten hauled onto the bough." }
          - { who: marten, text: "Greedy beggars! All the world is out today." }
      - name: badger-peeps
        says:
          - { who: squirrel, text: "Come on up, old Badger!" }
          - { who: badger, text: "H'm! Company." }
      - name: badger-gone
        says:
          - { who: narrator, text: "Badger vanished back into the ferns." }
          - { who: squirrel, text: "Simply hates Society. Who else is out?" }
      - name: marten-toad
        says:
          - { who: marten, text: "Toad's out in his new gliding-contraption!" }
          - { who: narrator, text: "A canvas glider flashed wildly overhead." }
          - { who: marten, text: "He'll be out of that in a minute!" }
      - name: marten-vanishes
        turn: { who: marten }
      - name: marten-bolts
        walk: { who: marten, to: off-right }
        says:
          - { who: narrator, text: "A beetle buzzed past. Snap! Marten vanished." }
          - { who: narrator, text: "Politely, Mole repacked the lunch basket." }

```

```yaml
episode: forest1-3
library:
  backgrounds:
    squirrel-drey: # warm cozy tree hollow lit by a golden resin-lamp
      fill: "#3b2416"
      shapes:
        - { shape: ellipse, at: [960, 520], size: [1480, 860], fill: "#593722" }
        - { shape: ellipse, at: [1520, 420], size: [260, 260], fill: "#f7c85c" }
        - { shape: rect, at: [960, 950], size: [1920, 260], fill: "#6e472b" }
use: cartoon
scenes:
  - background: canopy
    places: { mole: left, squirrel: right }
    faces: { squirrel: left }
    beats:
      - name: afternoon-restless
        says:
          - { who: narrator, text: "As the sun dipped, Mole grew restless." }
          - { who: mole, text: "Squirrelly! Let me work the hoist-rope now!" }
      - name: squirrel-refuses
        says:
          - { who: squirrel, text: "Not yet, my friend. Wait for lessons." }
      - name: mole-grabs-rope
        jump: { who: mole, times: 1 }
        says:
          - { who: narrator, text: "Proud Mole jumped up and yanked the brake!" }
          - { who: narrator, text: "Whoosh! Over tipped the car through the leaves." }
      - name: mole-apologizes
        says:
          - { who: narrator, text: "Squirrel caught him and righted the basket." }
          - { who: mole, text: "Squirrelly, I am sorry! I was a complete ass." }
          - { who: mole, text: "Will you forgive me?" }
      - name: squirrel-forgives
        pose: { squirrel: wave }
        says:
          - { who: squirrel, text: "Bless you, what's a little tumble to me?" }
          - { who: squirrel, text: "Stay with me, and I'll teach you to climb." }
      - name: mole-relieved
        pose: { squirrel: stand }
        jump: { who: mole, times: 1 }
        says:
          - { who: narrator, text: "Touched, Mole wiped a tear and cheered up." }
  - background: squirrel-drey
    places: { squirrel: left, mole: right }
    faces: { mole: left }
    beats:
      - name: cozy-evening
        says:
          - { who: narrator, text: "At home, Squirrel lit a bright resin-lamp." }
          - { who: narrator, text: "He told thrilling tales before the fire." }
      - name: squirrel-goodnight
        pose: { squirrel: wave }
        says:
          - { who: squirrel, text: "Sleep well in the bedroom-hollow, Mole." }
      - name: mole-goodnight
        pose: { squirrel: stand }
        says:
          - { who: mole, text: "Thank you, my friend. Goodnight." }
      - name: forest-whispers
        takes: 2
        says:
          - { who: narrator, text: "That day was the first of many in the canopy." }

```

All episodes written.

What was left out or condensed:

* Detailed visual descriptions of Mole's underground whitewashing and the physical rigging of pulleys, counterweights, and falling through the branches (summarized briefly by the narrator, since the stage does not support sitting, climbing, falling, or props).
* The exact item-by-item inventory left behind when Mole repacked the picnic (the leaf-plate, wooden fork, and honey-pot), as well as the specific story Marten started telling about Toad and the forest-warden.
* The brief banter with the two sniggering jays before entering the Squirrel's home, and the specific topics of Squirrel's fireside stories (hawks, woodcutters, and night-foragings).