# Why the laws of time hold

The laws are in `AGENTS.md`, "What happens at once"; the code is `times.ts`. This note proves the
five things they promise, and what is said to have surely begun (6). `times.test.ts` tries each on random
plans, and `scripts.test.ts` on random scripts, compiled.

## The formulas

A **thing** is a line or a block of the plan. `B(x)` is the block that `x` is in; *around* `x` are
`x` itself and every block it is in, up to the whole plan. *Above* is earlier in the written order,
so a block is above all that is in it. A thing is **left** when it is cut or open: its block does
not wait for it. A **closing** block is one whose lines end together, and `L(x)` is how long a line
directly in one lasts by itself: its length, or a move's own.

Two lists say who is cut where:

- `cuts(x)`: for each left `z` around `x`, the block `B(z)`. `x` is cut at the ends of these.
- `cuts(x, y)`: the same, without each `z` that is around `y` too. It is `cuts(x)` as `y` sees it.

Each thing has two cells, its start `s` and its uncut end `e`:

| | Formula |
| --- | --- |
| S | `s(plan) = 0`; else `s(x)` is the latest of `s(B(x))`, its moment or rule, and its channels |
| S, rule | in order: `e(i) + pause` for each `i` above `x` in `B(x)` that is not left, or `s(B(x)) + lead` when there is none; together: nothing more; closing: `e(B(x)) - tail - L(x)`, and nothing more when `x` is left |
| S, channels | for each line `y` above `x` on a channel of `x`: `e(y)`, or when `cuts(y, x)` is not empty, `e(C)` for its outermost `C`; `free(x)` is the latest of these |
| M, start | `s(w) + max(0, plus)` |
| M, a share `p` | `max(s(w), s(w) + round(p (e(w) - s(w))) + plus)` |
| M, end | `max(s(w), min(e(w), e(C) for each C in cuts(w, x)) + plus)` |
| E, block | the latest of `s(x)` and `e(i)` for each `i` in it that is not left, `+ tail` |
| E, closing | the latest of `s(x)` and `max(s(x), free(i)) + L(i)` for each `i` in it that is not left, `+ tail` |
| E, fixed | `s(x) + length` |
| E, open | `max(s(x), e(B(x)))` |
| E, fitted | `min(max(t, s(x) + least), s(x) + most)`, where `t` is the moment it arrives at, or the latest `e(v)` of the voices its block waits for; `s(x) + own` when there is neither, and in a closing block |

`w` is the thing an anchor of `x` names, above `x`. The voices a block waits for are those reached
from it, however deep, through things that are not left.

What is heard and seen runs from `s(x)` to `stop(x) = max(s(x), min(e(x), e(C) for each C in
cuts(x)))`. A line is **there** when `stop(x) > s(x)`.

The lengths, `pause`, `lead`, `tail` and `plus` are whole frames, a length 1 or more and the pauses 0
or more; `least <= own <= most`; `0 <= p <= 1`. One that is worked out from the lengths of lines above
is a number by then too (`compile.ts`). A plan is **accepted** when it has none of the six refusals: a
name that nothing above has, a channel held, a move that is cut or in what is cut, an open one too, a loop;
a channel twice, directly in a closing
block, or in one together, the later line with no anchor; and in a closing block, what has its times in
itself (a block, an anchor, an arrival). So all that is directly in a closing block is lines, with no
moment of their own, no two on one channel.

**A closing block ends its lines together.** Let `i` be in the closing block `B`, not left. By its E,
`e(B) - tail` is at least `max(s(B), free(i)) + L(i)`. So of the terms of `s(i)`, the rule's, `e(B) -
tail - L(i)`, is at least the two others: `s(i)` is that, and `e(i) = e(B) - tail`. It ends them as soon
as they can all end: one of them, the one whose bound `e(B) - tail` is, begins the moment it may. ∎

## 1. One timing for any lengths

Which cells a formula reads depends on the blocks, the kinds of lines, the channels, the marks and
the anchors. No length is among them. An accepted plan has no loop, so its cells can be put in an
order where each reads only earlier ones. By induction along it, each has exactly one value: the
formulas are `max`, `min`, `+`, `-` and a rounded share, defined for all whole numbers and giving whole
numbers. The same order serves for any lengths. ∎

So what is refused is refused for any lengths too, and is known before the voices.

A closing block's end reads its own start and its lines' channels, and no cell of its lines: so a line
that begins by it is no loop.

## 2. Nothing begins before what it comes after

`s(x)` is the latest of its terms, so it is no earlier than any of them:

- its block's start;
- in order, with no anchor: `pause` after the end of everything above it in its block, the left out;
- with an anchor: its moment, and as M is at least `s(w)` in all three forms, the start of what it
  names;
- everything above on its channels (5). ∎

## 3. A block ends after all it waits for

`e(B)` is the latest of `e(i)` over all `i` in `B` that are not left, plus a tail of 0 or more; in a
closing block each `e(i)` is `e(B) - tail`. So `e(B) >= e(i)`. And none that is there goes on after the
block stops: as `i` is not left, it is cut by the same blocks as `B` is, `cuts(i) = cuts(B)`, so
`stop(i) = min(e(i), …) <= min(e(B), …) <= stop(B)`. ∎

## 4. What is cut ends with its block and moves nothing else

*It ends with its block.* Let `z` be left, and `x` be `z` or in `z`. Then `B(z)` is in `cuts(x)`, so
when `x` is there, `stop(x) <= e(B(z))`.

*It moves nothing else.* Let `z` be left. Which formulas of things outside `z` read a cell of `z` or
of something in it?

- `s(B(x))` and, for an open line or one in a closing block, `e(B(x))`: no. If `B(x)` were `z` or in
  `z`, `x` would be in `z`.
- The rule, and a block's end: they read things directly in one block that are not left, or in a closing
  block their lengths. One of those in `z` is either `z`, which is left, or has its block in `z`, and
  then `x` is in `z` too.
- A fit: it reads voices reached through things that are not left, so never through `z`.
- A channel of `x`, read by `s(x)`, and by `e(B(x))` when that is a closing block, outside `z` too: let
  `y` be in `z`, and `x` outside it. Then `z` is around `y` and not around `x`, so `cuts(y, x)` is not
  empty, and `e(C)` is read for the outermost `C`. That is the block of `z` or of something around `z`,
  so it is not in `z`.
- A moment: when it names `z` or something in it, and only then. (An end reads `e(C)` for `C` around
  `w`, and if `C` is in `z` then so is `w`.)

So unless something outside names it, no length in `z` is read outside `z`, even through other
cells: whatever it is, all the rest has the same values. ∎

*What it being there does.* It holds its channel while its block lasts, and that may delay what
follows on the channel outside the block (inside, it is refused). Its own block and all that block
waits for are still the same with it and without it, when the block `P` is in nothing that is left
itself. Then `P` is the outermost block that cuts `z`, so what the hold delays reads `e(P)`. And
`e(P)` reads, directly or through others, every cell of what `P` waits for, but the lines of closing
blocks (`P`, or ones that it waits for). Such a line's cells read only its block's end and what that
reads itself, and `e(P)` is or reads that end. So if a cell of what `P` waits for read what is delayed,
`e(P)` would too, and that would be a loop. ∎

## 5. A channel never does two things

Two lines directly in one closing block are never on one channel, as that is refused (twice). For all
others the terms of S, channels, are there, and as `s(x)` is the latest of its terms:

Let `y` be above `x`, on one channel, and both there. `cuts(y, x)` is one of two:

- Empty. Then `s(x) >= e(y) >= stop(y)`.
- Not empty, and `C` is its outermost. `x` is not in `C`, as that is refused (held). So the formula
  reads `e(C)`, and as `C` is in `cuts(y)`: `s(x) >= e(C) >= stop(y)`.

So `x` begins no earlier than `y` has stopped, and what is written later is later. This holds for
every `y` above, not the last alone: a last one that is not there may have an end before that of an
older one that still sounds. ∎

Why a held channel is refused: `x` is in `C`, and would begin after `C` has ended. If `C` waits for
it, that is a loop; if not, it is never there. A channel twice in a closing block would be a loop too:
the block's end reads when the channel of `x` is free, `e(y)`, and `y` begins by the block's end. In a
block together it would be none, and nothing here needs it refused: `x` would wait for `y`. But the block
says that it begins with it, and it does not.

## 6. What has surely begun

`surelyBegun(x, y)` says that `s(x) < e(y)` in an accepted plan, for a line `y` (`<=` for an open one),
whatever the lengths, the pauses, the leads and tails, the shares and the `plus` of its moments. It is
sound: what it says is so. It does not see all that is so, and where it says nothing, nothing is claimed.

It goes by two facts of each formula, neither of which reads a length.

*Over:* cells that a cell is no earlier than. A formula is `max`, `min`, `+` and `-` of cells.

- `max` of terms is no earlier than what any of them is no earlier than, and `min` of terms than what all
  of them are.
- A term with frames of 0 or more added (a length, `pause`, `lead`, `tail`, `least`, `most`) is no earlier
  than the cell it adds them to. One with frames taken away (a closing block's rule) is over nothing.
- A moment is no earlier than `s(w)`, in all three forms.
- A fitted end is so over `s(x)`: both sides of its `min` are `s(x)` and more. What it is fitted to is on
  one side alone.
- In a closing block, `e(i) = e(B) - tail` for all `i` that are not left (above), so `e(B)` is over each
  `e(i)`, and each `e(i)` is over the start of every other, which is before that one's end.

*Only:* a cell that is the latest of those cells, with nothing added. It is a start whose every term is a
cell: its block's start, its channels, and no pause, lead or moment; and the end of what is open.

Let `below(c)` be all that is reached from `c` by *over*: each is `<= c`, and `s(plan)` is always one of
them, as every start is over its block's. Then `a <= c` when `a` is in
`below(c)`; or when `a` is *only*, and each cell it is the latest of is `<= c` by the same two. The second
goes round nowhere, as a formula reads only cells that are worked out before it (1).

`surelyBegun(x, y)` is this, of `s(x)` and one of the cells that `e(y)` is over, or, when `s(x)` is *only*,
of each of its cells and one of those. `y` is a line: when it is not open, those are its own start, and in
a closing block the others'. A line lasts a frame at least, so each is before its own line's end, and that
is `e(y)`. ∎

That an end is not among them is what makes it *before*: of two whose walks end at once, the one who goes
on as they do has not left when the other comes.

So of two that begin with one block together, each has surely begun by the end of the other, when what it
waits for on its channels is surely over by then: what is before the block is, as `s(B)` is over it.

## The plain solver

It repeats the laws, as they read, until nothing changes. What it stops at satisfies every formula,
and by (1) only one timing does. So where the two agree, the cells say what the laws do.
