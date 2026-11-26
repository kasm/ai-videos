```yaml
episode: forest1-uk-1
use: cartoon
language: uk
script: |
  tune loop
scenes:
  - background: glade
    places: { mole: off-left, rabbit: middle }
    faces: { rabbit: left }
    script: |
      narrator say: Глибоко під лісовою галявиною жив собі Кріт.
      narrator say: Цілий ранок він прибирав свою нірку.
      narrator say: У горлі пил, хутро в бризках вапна,
      narrator say: а спина болить так, що й не розігнутися.
      narrator say: Але весна пробралася навіть у темну нірку.
      narrator say: І збудила в ньому солодкий неспокій.
      mole say: А, хай йому грець, тому прибиранню!
      rustle play
      & narrator say: Кріт кинув щітку й помчав угору тунелем.
      narrator say: Він шкрябався й дерся, аж нарешті — хоп!
      mole walk to=left
      & narrator say: Його ніс вигулькнув на сонячну галявину.
      together:
        mole jump times=3
        mole say: Оце так! Оце краса!
      narrator say: Кріт аж підстрибує від радості життя.
      mole walk to=left-of(rabbit, near)
      & narrator say: Він дріботить по моху до ожинових кущів.
      rabbit point
      & rabbit say: Шість монет за прохід приватною стежкою!
      together:
        mole walk to=right-of(rabbit, near) speed=fast
        rabbit look-at target=mole
        rabbit stand @ block.start + 0.2s
        rabbit jump @ block.start + 0.2s
        narrator say: Та нетерплячий Кріт просто збиває його з ніг.
      mole turn
      & narrator say: Кролики визирають з нірок, і Кріт гукає їм.
      mole say: Жолудевий соус вам!
      mole turn
      mole walk to=off-right
      & narrator say: І мандрує далі, крізь папороть і галявини.
      narrator say: Усі навколо метушаться й мостять гнізда.
      narrator say: А він тут єдиний ледар, і як же це чудово!
```

```yaml
episode: forest1-uk-2
use: cartoon
language: uk
script: |
  tune loop
scenes:
  - background: oak-foot
    places: { mole: off-left, squirrel: off-right }
    faces: { squirrel: left }
    values: { beech: 1560 }
    script: |
      ending together:
        mole walk to=left
        narrator say: Кріт мандрував лісом усе далі й далі.
      narrator say: Аж раптом опинився під старезним дубом.
      narrator say: Ніколи ще він не бачив Лісової Крони.
      narrator say: Живий зелений храм гойдався й зітхав.
      narrator say: Він кидав тіні й ловив сонячні промені.
      narrator say: Зачарований Кріт слухав, як шепочуть гілки.
      narrator say: Вони розповідали казки з самого серця землі.
      narrator say: Аж ось у дуплі сусіднього бука щось блиснуло.
      narrator say: Мов крихітна зірочка. А тоді підморгнуло.
      squirrel walk to=beech
      & narrator say: І довкола нього з'явилася руда мордочка.
      narrator say: Кругла, жвава мордочка з вусами.
      narrator say: Вушка з китичками й пишний хвіст.
      narrator say: Це була Руда Білка!
      squirrel wave
      & squirrel say: Привіт, Кроте! Хочеш до мене нагору?
      squirrel stand
      & mole say: Ой, тобі легко казати!
      narrator say: Тоді Білка відв'язує плетену лозу.
      narrator say: І спускає ліщиновий кошик на блоках.
      squirrel walk to=right-of(mole, near)
      & narrator say: Вона допомагає Кротові залізти в кошик.
      narrator say: І плавно тягне їх обох угору, у гілля.
  - background: canopy
    places:
      mole: left-of(car, near)
      squirrel: right-of(car, near)
    faces: { squirrel: left }
    values: { car: 960 }
    script: |
      narrator say: Вище й вище, аж до самої зеленої крони.
      mole jump times=2
      & mole say: Я ще ніколи в житті не був на деревах!
      narrator say: Кріт аж завмирає від захвату.
```

```yaml
episode: forest1-uk-3
use: cartoon
language: uk
script: |
  tune loop
scenes:
  - background: canopy
    places:
      mole: left-of(car, near)
      squirrel: right-of(car, near)
    faces: { squirrel: left }
    values: { car: 960 }
    script: |
      narrator say: Високо в кронах пливе кошик з Білкою і Кротом.
      squirrel say: Повір мені, юний друже, нема нічого кращого,
      squirrel say: ніж просто вовтузитися на верхівках дерев.
      [mess] squirrel say: Просто вовтузитися... на... верхівках...
      mole say @ mess.word(верхівках): Білко, глянь угору!
      & mole jump
      narrator say: Запізно. Кошик з розгону б'ється об гілку.
      squirrel jump
      & narrator say: Білка падає на спину, лапками догори.
      narrator say: Та вона, сміючись, підводиться й веде далі.
      squirrel say: ...на верхівках чи серед гілля.
      squirrel say: Дістанешся до крони, чи нікуди не доберешся,
      squirrel say: ти завжди при ділі, а нічого й не робиш.
      squirrel say: Помандруємо разом гілками на цілий день?
      mole jump times=3
      & narrator say: Кріт аж підстрибує від щастя.
      narrator say: Білка приносить з дупла товстий кошик з обідом.
      narrator say: І вагончик рушає далі, канатною дорогою.
      mole say: А що там усередині?
      squirrel say: Смажені каштани, лісові й кедрові горіхи,
      squirrel say: буковий горішок, мариновані жолуді, мед,
      [list] squirrel say: ягоди, березовий сік, вино з бузини...
      mole say @ list.word(сік): Ой, годі, годі!
      & mole jump times=2
      narrator say: Зелене світло й запах смоли п'янять Крота.
      mole say: Отже... оце... і є... ліс!
      squirrel say: Не просто ліс, а Ліс. Це мій світ.
      squirrel say: І іншого мені не треба.
```

```yaml
episode: forest1-uk-4
use: cartoon
language: uk
script: |
  tune loop
scenes:
  - background: canopy
    places:
      mole: left-of(car, near)
      squirrel: right-of(car, near)
    faces: { squirrel: left }
    values: { car: 960 }
    script: |
      narrator say: Кошик пливе крізь крону, а Білка розповідає.
      squirrel say: Восени буря гойдає моє гніздо, мов корабель.
      squirrel say: А навесні тане сніг, і кора пахне, як пряник.
      squirrel say: Тут завжди весело, і товариства вдосталь.
      squirrel say: Дятли, сойки, повзики, і всі чогось хочуть!
  - background: elm-bower
    places:
      squirrel: left-of(bower, near)
      mole: right-of(bower, near)
      marten: off-right
    faces: { marten: left }
    values: { bower: 760 }
    script: |
      narrator say: Вони причалюють до мохового майданчика.
      narrator say: Високо на старому в'язі, біля темних хащів.
      mole point
      & mole say: А що там, у темряві?
      mole stand
      & mole turn
      squirrel say: Та це просто Глибока Гущавина.
      squirrel say: Ми, мешканці крон, туди рідко ходимо.
      squirrel say: Під корінням там живе старий добрий Борсук.
      squirrel say: Його ніхто не чіпає.
      squirrel say: А от ласкам, горностаям і лисам — не вір.
      squirrel say: А за Гущавиною — Широкий Світ.
      squirrel say: Він нам обом байдужий. А тепер — обідати!
      narrator say: Кріт розгортає пакунки на скатертині з листя.
      mole jump
      & mole say: Ой, матінко! Оце так!
      narrator say: І вони беруться до їжі.
      rustle play
      & narrator say: Аж ось унизу гойдаються гілочки.
      squirrel wave
      & squirrel say: Куницю! Гей, Куницю, лізь до нас!
      squirrel stand
      together:
        marten walk to=right-of(mole, near)
        mole look-at target=marten
        narrator say: І на гілку вилазить гнучка лісова Куниця.
      marten say: Ах ви ж ненажери!
      marten say: Видно, сьогодні весь світ на деревах!
```

```yaml
episode: forest1-uk-5
use: cartoon
language: uk
script: |
  tune loop
scenes:
  - background: elm-bower
    places:
      squirrel: left-of(bower, near)
      mole: right-of(bower, near)
      marten: perch
      badger: off-right
    faces: { marten: left, badger: left }
    values: { bower: 760, perch: 1210 }
    script: |
      narrator say: Кріт, Білка й Куниця обідають на старому в'язі.
      together:
        rustle play
        badger walk to=right-of(marten, near)
        narrator say: Аж ось з папороті визирає смугаста голова.
      squirrel wave
      & squirrel say: Лізь до нас, старий Борсуче!
      squirrel stand
      & badger say: Гм! Товариство.
      badger turn
      badger walk to=off-right
      & narrator say: І Борсук зникає в папороті.
      squirrel say: Ох, терпіти не може товариства.
      squirrel say: Ну, а хто ще сьогодні в лісі?
      marten say: Ропух вибрався! На новій літальній штуці!
      together:
        squirrel say: Ха-ха-ха!
        marten say: Ха-ха-ха!
      narrator say: Вони сміються з Ропухових забаганок.
      narrator say: Хатки на деревах, тролеї, ночівлі в гамаках...
      narrator say: Аж тут повз крону мчить полотняний планер.
      narrator say: Він шалено хилиться то вліво, то вправо.
      marten say: За хвилину він із нього вилетить!
      marten say: Я вам розповідав про Ропуха й лісничого?
      marten say: Отже, Ропух...
      rustle play
      & narrator say: Повз пролітає заблуканий жук.
      marten turn
      together:
        marten walk to=off-right speed=fast
        narrator say: Руда смуга, клац! І нема ні жука, ні Куниці.
      narrator say: Лише листя тремтить унизу.
      narrator say: Та звірі не обговорюють раптових зникнень.
      narrator say: Тож Кріт мовчки складає кошик.
      narrator say: Він забув лише тарілку з листка й виделку.
      narrator say: А ще горщик з медом, на якому сидів.
```

```yaml
episode: forest1-uk-6
use: cartoon
language: uk
script: |
  tune loop
scenes:
  - background: elm-bower
    places:
      squirrel: left-of(bower, near)
      mole: right-of(bower, near)
    faces: { mole: left }
    values: { bower: 760 }
    script: |
      narrator say: Сонце сідає нижче, і Кротові не сидиться.
      mole say: Білочко! Будь ласка, дай мені тягнути линву!
      squirrel say: Ще ні, мій юний друже.
      squirrel say: Зачекай, поки трохи повчишся.
      narrator say: Кріт заздрить, і гордість не дає йому спокою.
      together:
        mole jump
        narrator say: Раптом він схоплюється й хапає линву.
      squirrel jump
      & narrator say: Здивована Білка валиться навзнак.
      narrator say: Кріт щосили смикає й знімає гальмо.
      narrator say: І тут... шшух! Вагончик перекидається!
      narrator say: А Кріт летить донизу, крізь гілля!
  - background: glade
    places: { mole: middle, squirrel: off-right }
    faces: { squirrel: left }
    script: |
      rustle play
      & narrator say: Листя шмагає його по вухах, а він усе падає.
      narrator say: В останню мить він хапається за тонку ліщину.
      narrator say: А вона вже тріщить...
      narrator say: Аж раптом хтось міцно хапає його за шию.
      squirrel walk to=right-of(mole, near)
      & squirrel say: Ха-ха-ха! Тримаю, тримаю!
      narrator say: Це Білка, і вона аж труситься від сміху.
      narrator say: На ліані вона спускає Крота на м'який мох.
      squirrel turn
      squirrel walk to=off-right
      & narrator say: А тоді лізе назад, ставити вагончик на місце.
      narrator say: І рятувати кошик з обідом, що застряг у гілках.
      narrator say: А Кріт стоїть на моху, весь у синцях і листі.
```

```yaml
episode: forest1-uk-7
use: cartoon
language: uk
cast: { jays: uk_f5 }
script: |
  tune loop
scenes:
  - background: canopy
    places:
      mole: left-of(car, near)
      squirrel: right-of(car, near)
    faces: { squirrel: left }
    values: { car: 960 }
    script: |
      narrator say: Сумний Кріт знову в кошику, високо в кроні.
      mole say: Білочко, мій щедрий друже!
      mole say: Мені дуже соромно за мою дурну поведінку.
      mole say: Я був справжнім віслюком. Ти мені пробачиш?
      squirrel say: Та що ти! Що Рудій Білці якесь падіння?
      squirrel say: Ходи до мене, погостюй трохи.
      squirrel say: Я навчу тебе лазити й ходити по гілці.
      squirrel say: І скоро ти будеш у кронах не гірший за нас.
      narrator say: Зворушений Кріт витирає сльозу.
      narrator say: А тут над ними хихочуть дві сойки.
      jays say: Хі-хі-хі! Кріт із дерева гепнувся!
      mole say: А ви самі колись із гнізда випадали!
  - background: squirrel-drey
    places: { mole: left, squirrel: middle }
    faces: { squirrel: left }
    script: |
      narrator say: Удома Білка запалює смоляний світильник.
      narrator say: І загортає Крота в листяний халат біля вогню.
      in order:
        under volume=-12dB:
          squirrel say: А якось над моїм гніздом кружляв яструб...
          squirrel say: А лісоруби як застукають сокирами...
        narrator say: І до самої вечері розповідає лісові історії.
        narrator say: Про яструбів, лісорубів і нічні походи.
      mole turn
      together:
        mole walk to=off-left speed=slow
        squirrel walk to=off-left speed=slow
        narrator say: Після вечері Білка веде сонного Крота спати.
      narrator say: У найкращу спальню-дупло, на мохову подушку.
      narrator say: Кріт засинає, щасливий-щасливий.
      narrator say: А надворі тихо шепоче Лісова Крона.
  - background: canopy
    places: { squirrel: left, mole: middle }
    script: |
      narrator say: Той день був першим із багатьох.
      mole jump times=2
      & narrator say: Кріт навчився стрибати й лазити.
      narrator say: А ще він прикладав вухо до шорсткої кори.
      narrator say: І слухав, що шепоче вітер серед листя.
```

Усі епізоди написано.

Що з історії не ввійшло в епізоди:
- **Лише оповідач:** нірка Крота, тунель угору, кошик на блоках, поїздка канатною дорогою, удар об гілку, падіння, планер Ропуха над кроною й те, як Куниця кидається на жука. Мультфільм не вміє показати, як хтось лізе вгору, летить, падає чи сидить.
- **Немає на картинці:** Ропуха й кроликів, що визирають із нірок. Дві сойки — лише голос за кадром.
- **Пропущено:** Кріт сидить на корені, Білка ставить кошик Кротові під ноги, Кріт веде лапою по листю. Також немає вогню, вечері й ліжка, про них лише каже оповідач.
- **Змінено:**
  - Питання про Глибоку Гущавину Кріт ставить уже на майданчику на в'язі, бо хащі намальовано лише на цьому тлі.
  - У бібліотеці в Білки жіночий голос, тож Білка тут жіночого роду.
  - Замість «шести пенсів» — «шість монет».
  - Список їжі без злитих докупи слів, бо голос їх не вимовить.
  - Кілька реплік я дописав сам, бо в історії немає слів: сміх Білки, коли вона ловить Крота, казки в дуплі, перегризання із сойками.
