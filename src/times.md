# Why the laws of time hold

The laws are in `AGENTS.md`, "What happens at once"; the code is `times.ts`. This note proves the
six things they promise. `times.test.ts` tries each on random plans.

## The formulas

A **thing** is a line or a block of the plan. `B(x)` is the block that `x` is in; *around* `x` are
`x` itself and every block it is in, up to the whole plan. *Above* is earlier in the written order,
so a block is above all that is in it. A thing is **left** when it is cut or open: its block does
not wait for it.

Two lists say who is cut where:

- `cuts(x)`: for each left `z` around `x`, the block `B(z)`. `x` is cut at the ends of these.
- `cuts(x, y)`: the same, without each `z` that is around `y` too. It is `cuts(x)` as `y` sees it.

Each thing has two cells, its start `s` and its uncut end `e`:

| | Formula |
| --- | --- |
| S | `s(plan) = 0`; else `s(x)` is the latest of `s(B(x))`, its moment or rule, and its channels |
| S, rule | in order: `e(i) + pause` for each `i` above `x` in `B(x)` that is not left, or `s(B(x)) + lead` when there is none; together: nothing more |
| S, channels | for each line `y` above `x` on a channel of `x`: `e(y)`, or when `cuts(y, x)` is not empty, `e(C)` for its outermost `C` |
| M, start | `s(w) + max(0, plus)` |
| M, a share `p` | `max(s(w), s(w) + round(p (e(w) - s(w))) + plus)` |
| M, end | `max(s(w), min(e(w), e(C) for each C in cuts(w, x)) + plus)` |
| E, block | the latest of `s(x)` and `e(i)` for each `i` in it that is not left, `+ tail` |
| E, fixed | `s(x) + length` |
| E, open | `max(s(x), e(B(x)))` |
| E, fitted | `min(max(t, s(x) + least), s(x) + most)`, where `t` is the moment it arrives at, or the latest `e(v)` of the voices its block waits for; `s(x) + own` when there is neither |

`w` is the thing an anchor of `x` names, above `x`. The voices a block waits for are those reached
from it, however deep, through things that are not left.

What is heard and seen runs from `s(x)` to `stop(x) = max(s(x), min(e(x), e(C) for each C in
cuts(x)))`. A line is **there** when `stop(x) > s(x)`.

The lengths, `pause`, `lead`, `tail` and `plus` are whole frames, a length 1 or more and the pauses 0
or more; `least <= own <= most`; `0 <= p <= 1`. A plan is **accepted** when it has none of the four
refusals: a name that nothing above has, a channel held, a cut move, a loop.

## 1. One timing for any lengths

Which cells a formula reads depends on the blocks, the kinds of lines, the channels, the marks and
the anchors. No length is among them. An accepted plan has no loop, so its cells can be put in an
order where each reads only earlier ones. By induction along it, each has exactly one value: the
formulas are `max`, `min`, `+` and a rounded share, defined for all whole numbers and giving whole
numbers. The same order serves for any lengths. ∎

So what is refused is refused for any lengths too, and is known before the voices.

## 2. Nothing begins before what it comes after

`s(x)` is the latest of its terms, so it is no earlier than any of them:

- its block's start;
- in order, with no anchor: `pause` after the end of everything above it in its block, the left out;
- with an anchor: its moment, and as M is at least `s(w)` in all three forms, the start of what it
  names;
- everything above on its channels (6). ∎

## 3. A block ends after all it waits for

`e(B)` is the latest of `e(i)` over all `i` in `B` that are not left, plus a tail of 0 or more: so
`e(B) >= e(i)`. And none that is there goes on after the block stops: as `i` is not left, it is cut
by the same blocks as `B` is, `cuts(i) = cuts(B)`, so `stop(i) = min(e(i), …) <= min(e(B), …) <=
stop(B)`. ∎

## 4. What is cut ends with its block and moves nothing else

*It ends with its block.* Let `z` be left, and `x` be `z` or in `z`. Then `B(z)` is in `cuts(x)`, so
when `x` is there, `stop(x) <= e(B(z))`.

*It moves nothing else.* Let `z` be left. Which formulas of things outside `z` read a cell of `z` or
of something in it?

- `s(B(x))` and, for an open line, `e(B(x))`: no. If `B(x)` were `z` or in `z`, `x` would be in `z`.
- The rule, and a block's end: they read things directly in one block that are not left. One of those
  in `z` is either `z`, which is left, or has its block in `z`, and then `x` is in `z` too.
- A fit: it reads voices reached through things that are not left, so never through `z`.
- A channel: let `y` be in `z`, and `x` outside it. Then `z` is around `y` and not around `x`, so
  `cuts(y, x)` is not empty, and `x` reads `e(C)` for the outermost `C`. That is the block of `z` or
  of something around `z`, so it is not in `z`.
- A moment: when it names `z` or something in it, and only then. (An end reads `e(C)` for `C` around
  `w`, and if `C` is in `z` then so is `w`.)

So unless something outside names it, no length in `z` is read outside `z`, even through other
cells: whatever it is, all the rest has the same values. ∎

*What it being there does.* It holds its channel while its block lasts, and that may delay what
follows on the channel outside the block (inside, it is refused). Its own block and all that block
waits for are still the same with it and without it, when the block `P` is in nothing that is left
itself. Then `P` is the outermost block that cuts `z`, so what the hold delays reads `e(P)`. And
`e(P)` reads, directly or through others, every cell of what `P` waits for: if one of those read what
is delayed, that would be a loop. ∎

## 5. A longer voice begins nothing earlier

Every formula is non-decreasing in every cell it reads and in every length:

- `max`, `min` and `+` are.
- The fit, `min(max(t, s + least), s + most)`, is made of them. Which voices `t` is of, and whether
  there is a `t`, depends on no length: so there is no jump, as there would be from "fitted while
  something is left to fit to" to "its own length".
- The share, `f(s, e) = s + round(p (e - s))`. In `e`, as rounding is non-decreasing. In `s`, take
  one frame more, and let `u = p (e - s)`: `f(s + 1, e) - f(s, e) = 1 + round(u - p) - round(u)`. As
  `p <= 1`, `round(u - p) >= round(u - 1) = round(u) - 1`, so the difference is 0 or more.

By induction along the order of (1), every start and every uncut end is a non-decreasing function of
every length; so is every `stop`, a `max` and a `min` of them. ∎

This needs a length to be a number, or to grow with what it is worked out from. A length such as
`5s - a.length` would break it.

## 6. A channel never does two things

Let `y` be above `x`, on one channel, and both there. `cuts(y, x)` is one of two:

- Empty. Then `s(x) >= e(y) >= stop(y)`.
- Not empty, and `C` is its outermost. `x` is not in `C`, as that is refused (held). So the formula
  reads `e(C)`, and as `C` is in `cuts(y)`: `s(x) >= e(C) >= stop(y)`.

So `x` begins no earlier than `y` has stopped, and what is written later is later. This holds for
every `y` above, not the last alone: a last one that is not there may have an end before that of an
older one that still sounds. ∎

Why a held channel is refused: `x` is in `C`, and would begin after `C` has ended. If `C` waits for
it, that is a loop; if not, it is never there.

## The plain solver

It repeats the laws, as they read, until nothing changes. What it stops at satisfies every formula,
and by (1) only one timing does. So where the two agree, the cells say what the laws do.
