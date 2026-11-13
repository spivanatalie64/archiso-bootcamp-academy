# The helper agent and the connect flow

This is the one piece of the academy that cannot be a static file. The
lessons, the labs, the checks and the pages are all static files on a free
static host. This holds the two things that need a server:

| Route | |
|---|---|
| `POST /api/agent` | the helper, answering from our wiki and the course |
| `GET  /api/connect/start` | begins the OAuth connect |
| `GET  /api/connect/callback` | finishes it and creates the learner's build repository |
| `GET  /api/health` | what is configured |

## Why a worker at all

The helper needs a model endpoint and a secret to reach it. A static page
cannot hold a secret, so one small piece exists, and it is the only piece.

It runs on a free tier. Workers AI is the default because it is on the same
free tier as the worker itself — no second account, no second bill. Any
OpenAI-compatible endpoint works too, if you would rather use another one.

## Setup

```sh
cd worker
npm install
cp .dev.vars.example .dev.vars    # fill in what you have
npx wrangler dev                   # local
npx wrangler deploy                # production
```

Secrets are set with `wrangler secret put NAME`. **The value never goes in the
repository, never in a chat message, never in a log.** The names are on the
record in `.dev.vars.example` and in `wrangler.toml`; the values are not.

## Where the helper's knowledge comes from

The wiki. `wiki.acreetionos.org`, whose content lives in the
`acreetionos-code.github.io` repository. It is fetched at request time, not
baked into the deployment, so when the wiki grows the helper's knowledge grows
with it. A copy frozen into the worker would be a copy that quietly goes stale,
and a helper that answers from a stale copy is worse than no helper.

The course is the other half. `tools/build-course-text.mjs` turns the lab
definitions into `site/content/course.json`, and the worker fetches that too.

## Honesty

The helper is instructed, in its system prompt, that the retrieved passages are
the only ground it has, and that when they do not cover the question the
correct answer is "I do not know that" plus a pointer to a human. Retrieval
is a keyword score over the wiki — predictable, and it needs no vector
database in a worker.

If retrieval finds nothing, the worker short-circuits and answers with the
refusal directly, without calling the model at all. If the model call fails,
the answer says the failure was on our side, so the learner does not think it
was theirs.

## The scoped route

The learner's build repository lives on our GitLab, in the group
`archiso-bootcamp-academy`. That group is the fence.

`academy-build-bot` is a dedicated account, Maintainer of that one group, with
no other memberships and no group-creation rights. Its token is
`HAPPY_TOKEN`. The blast radius is one group of learner build projects, and
revoking it touches nothing else on the instance.

The OAuth connect identifies the learner. The **bot** creates the project,
because the project must land inside the group — so the learner's own token
never needs write access to anything.

## The learner's repository

It is created from `template/`, which holds:

- `profile/` — a working flavour profile, so the learner's first build succeeds
- `.gitlab-ci.yml` — the pipeline: check, build, verify, release
- `README.md` — what the learner is looking at, and the errors they will hit

The pipeline builds a **commit**. Uncommitted changes never get built, and
the pipeline says so rather than quietly publishing the wrong image.
