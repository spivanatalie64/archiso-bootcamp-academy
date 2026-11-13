# Working in this repository

This is the ArchISO Bootcamp Academy. Everything below is here because the
academy is judged against a standard, and the standard is not obvious from
the code.

## The standard

**A brand-new user can come to this and be able to use it.**

That is the test. Hand it to someone who has never opened a terminal. If they
cannot get through the first lab without asking somebody a question, the
academy is wrong, not them.

## The rules that follow from it

**No setup cliff.** The first labs run in the browser. Nothing to install, no
account, no "first, go configure your machine."

**Nothing is assumed.** No term is used before it is explained in plain words.
If a lab says "commit", it has explained what a commit is first.

**Checks that teach.** When a check fails it says what is wrong and why, in
plain language — not "incorrect." `mkarchiso` errors get translated the same
way. **The error is part of the lesson.**

**Hints teach, and reset costs nothing.** Getting stuck and starting a lab
over is normal use, not failure. A worked example is always one click away.

## The one rule every check obeys

**A check looks at the state of the world, never at how the learner got
there.**

```js
// Wrong
check: (s) => s.sim.history.includes('pacman -S nano') ? ok('') : no('Run pacman -S nano.')

// Right
check: (s) => packageInstalled(s.sim, 'nano')
  ? ok('')
  : no('nano is not installed yet.')
```

There is more than one right way to install a package. A learner who used
`pacman -Sy && pacman -S nano` has still learned it, and the lab says so.

## Secrets

**The value never goes in this repository, never in chat, never in a log.**

The names of the worker's secrets are on the record in
`worker/.dev.vars.example` and `worker/wrangler.toml`. The values live in
secure storage. `HAPPY_TOKEN` is the `academy-build-bot` token, whose reach is
one group of learner build projects — treat it accordingly.

## Hosting

**Offsite and free.** The lessons live on static hosting. The hands-on
environments run on other people's free tiers. Nothing here depends on a
personal server staying up, and nobody pays for somebody else's lesson time.

The site is plain static files with no build step. Do not add one.

## Before you commit

```sh
node tools/build-course-text.mjs     # regenerate the agent's course grounding
node tools/verify-labs.mjs           # every lab is solvable, and not already solved
```

And with a browser available:

```sh
cd site && python3 -m http.server 8765 &
node tools/browser-check.mjs
```

`verify-labs.mjs` requires every lab to export a `solution(state)` — the state
a learner who did it properly ends up in. The verifier applies it and asserts
every task then passes, and that no task was already satisfied before the
learner started. A lab that cannot be completed is worse than no lab.

## Writing

Short sentences. Second person. Plain words. Warm, but not chatty. No
corporate register, no hedging, no filler. If a paragraph could be two
sentences, it should be.

Be accurate. This teaches a real tool. When you are not sure of a fact, check
the upstream archiso source rather than guessing.
