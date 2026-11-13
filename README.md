# ArchISO Bootcamp Academy

An online teaching environment with exactly one scope:

**Teaching people how to build Arch Linux ISO images, so they can build their own flavours.**

Not a general Linux course. Not a general programming course. ISO building,
start to finish.

The format is the bootcamp shape — short lesson, do the thing right there, get
checked, move on. The reference point is TestOut: a scenario at the top, a task
list that checks itself off as the environment's state becomes true, a lab
report at the end that says what you completed and why the right state is the
right state. Reset is free and unlimited. Getting stuck and starting over is
normal use, not failure.

The standard the whole academy is judged by: **a brand-new user can come to
this and be able to use it.** No setup cliff — the first labs run in the
browser with nothing to install. A real Lesson Zero, where nothing is assumed
and no term is used before it is explained in plain words. Checks that teach:
when a check fails it says what is wrong and why, and `mkarchiso` errors get
translated the same way. The error is part of the lesson.

## What is here

```
site/            the academy itself — static files, no build step
  index.html       the course home
  lesson.html      the lab runner
  assets/          the framework: shell, lab runner, simulator, checks, agent client
  content/         the labs, one module each
worker/          the one piece that cannot be static — the helper agent and the connect flow
template/        what a learner's build repository is created from
docs/            how to write a lab, how to deploy
tools/           helpers
```

## The three lab kinds

| | |
|---|---|
| **Editor labs** | the learner edits real profile files in the page, and the checker validates what they wrote |
| **Terminal labs** | a Linux machine to work on. The checker looks at the state of the machine — what files exist, what they contain — not at whether they typed a particular command |
| **Build labs** | a real `mkarchiso` build on a real runner, cut by GitLab CI, published as a release |

## The one rule every check obeys

**A check looks at the state of the world, never at how the learner got
there.**

There is more than one right way to install a package. A learner who used
`pacman -Sy && pacman -S nano`, or `pacman -S --needed nano`, has still learned
it, and the lab says so. See `docs/authoring-labs.md`.

## Hosting

The rule is **offsite and free**. The lessons live on static hosting, and the
hands-on environments run on other people's free tiers — in the learner's
browser or the learner's own account. Nothing here depends on a personal
server staying up, and nobody has to pay for somebody else's lesson time.

The academy site is plain static files with no build step. It runs on GitHub
Pages, Cloudflare Pages, Netlify, or anything else that serves files.

The single piece that cannot be static is `worker/`: the helper agent needs a
model endpoint and a secret, and the connect flow needs to talk to GitLab.
That is a small worker on a free tier. See `docs/deployment.md`.

## The build

The learner's build runs on our own GitLab, in the group
`archiso-bootcamp-academy`, cut by GitLab CI/CD and published as a release in
the learner's own repository. The scoped route: a bot account
(`academy-build-bot`) is Maintainer of that one group and of nothing else, so
the blast radius of its token is one group of learner build projects.

The pipeline verifies its own image before it hands it over — it hashes it,
it checks the volume label, and it boots it headlessly and waits for a login
prompt. A learner's first build failing for infrastructure reasons they cannot
see is the worst outcome this academy can produce.

## The helper

The helper in the corner answers from our wiki — `wiki.acreetionos.org`, whose
content lives in the `acreetionos-code.github.io` repository — plus the course
itself. Not the open internet's opinion. When the wiki grows, the helper's
knowledge grows with it, because the wiki is fetched at request time.

It knows its limits and says so. When it does not know something, it does not
guess at a build step. It hands the learner to a human, plainly, and the human
doors are always visible:

- [natalie@acreetionos.org](mailto:natalie@acreetionos.org)
- [discord.acreetionos.org](https://discord.acreetionos.org)

## Running it locally

```sh
cd site
python3 -m http.server 8000
# then open http://localhost:8000/
```

The worker is optional for local work — the helper will say it cannot reach
its wiki and point at the human doors, which is the honest behaviour.

To run the worker locally too:

```sh
cd worker
cp .dev.vars.example .dev.vars   # fill in what you have
npx wrangler dev
```

## Regenerating the course text

The helper grounds on the course as well as the wiki. The course text is
generated from the lab definitions:

```sh
node tools/build-course-text.mjs
```

## Status

The academy site, the whole course, the lab framework, the build pipeline and
the worker are all here and all checked.

**What is finished**

- Fifteen labs across three tracks, from Lesson Zero to making the flavour
  yours. Every one is verified to be completable and verified *not* to be
  already completed before the learner starts.
- The framework: a lab runner with a live task list, hints, free reset and a
  lab report; a deterministic simulator; and a set of state assertions.
- The build side: the template repository a learner's project is created from,
  and a GitLab CI pipeline that checks the tree is clean, builds the image,
  hashes it, checks its volume label, **boots it headlessly**, and publishes
  it as a release.
- The worker: the helper, which answers from our wiki and refuses when it
  does not know; and the connect flow, which gives a learner their own
  project in the learner group on our instance.
- A wiki guide on building your own ISO, so the helper has something real to
  ground on.

**What is not finished, and what it needs**

| | needs |
|---|---|
| The worker's deployment | a Cloudflare account, and `wrangler deploy` |
| The helper's model | a Cloudflare API token for Workers AI, or an OpenAI-compatible endpoint |
| The connect flow | a GitLab OAuth application, registered on our instance |
| The build pipeline | a runner tagged `academy` on `gitlab.acreetionos.org` |
| The learner group and bot | the `archiso-bootcamp-academy` group, and an `academy-build-bot` account with a token in secure storage |

None of those are code. They are credentials and one machine, and they are
written down in `docs/deployment.md` in the order they have to be done.

The plan and the open decisions live in the parent repository:
<https://github.com/spivanatalie64/archiso-teaching-environment/issues/2>
