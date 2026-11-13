# Deploying the academy

Three pieces, deployed separately. All of them are free.

## 1. The site (static)

`site/` is plain static files with no build step. It runs anywhere that serves
files.

**GitHub Pages**

```sh
# from the repository root
cp -r site/* .github/ 2>/dev/null || true
```

Or, more simply, keep `site/` where it is and point Pages at the branch and
directory: **Settings → Pages → Build and deployment → Source: Deploy from a
branch**, branch `main`, folder `/site`.

**Cloudflare Pages** — new project, connect the repository, build command
leave it empty, output directory `site`.

**Netlify** — new project, build command empty, publish directory `site`.

One setting matters. The site calls the worker for the helper, and the worker
lives on a different origin, so the worker needs to know where the site is.
Set it in `worker/wrangler.toml`:

```
[vars]
ALLOWED_ORIGINS = "https://your-site.example"
```

Add a `<meta name="academy-api" content="https://your-worker.example">` to
`site/index.html` and `site/lesson.html` if the worker is not on the same
origin.

## 2. The worker

```sh
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

Then set the secrets. **Each value is put in with `wrangler secret put` and
never appears in the repository, in a chat message, or in a log.**

```sh
npx wrangler secret put HAPPY_TOKEN
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put GITLAB_OAUTH_CLIENT_ID
npx wrangler secret put GITLAB_OAUTH_CLIENT_SECRET
npx wrangler secret put GITLAB_OAUTH_REDIRECT_URI
```

If you use an OpenAI-compatible model instead of Workers AI, also set
`OPENAI_BASE_URL` and `OPENAI_API_KEY`, and change `AGENT_MODEL` in
`wrangler.toml`.

Check it came up:

```sh
curl -s https://your-worker.example/api/health
```

`{"ok":true,"agent":true,"gitlab":true}` means both halves are wired.

## 3. GitLab

On `gitlab.acreetionos.org`:

### The group

Create a group called `archiso-bootcamp-academy`. This is the fence: learner
build projects live here and nowhere else.

### The bot

Create a user `academy-build-bot`. Add it to that group as **Maintainer** and
to nothing else — no other group, no other project, and no permission to
create groups.

Generate an access token for it with `api` scope and write it into secure
storage. That is the `HAPPY_TOKEN`. **The value is born in the admin UI and
never crosses chat, a repository, or a log.**

If the token ever leaks, the blast radius is one group of learner build
projects, and revoking it touches nothing else on the instance.

### The runner

The pipeline in `template/.gitlab-ci.yml` asks for a runner tagged
`academy`. Builds queue on one machine — the course should say so honestly:
your build runs in line, like a lab machine, not a vending machine.

```sh
# on the build machine, as root
gitlab-runner register \
  --url https://gitlab.acreetionos.org \
  --token "$RUNNER_TOKEN" \
  --executor docker \
  --docker-image archlinux:latest \
  --tag-list academy
```

### The OAuth application

Register an application with the redirect URI pointing at the worker's
callback:

```
https://your-worker.example/api/connect/callback
```

The scopes needed are `read_user` and `openid`. The client id and secret go
into the worker's secrets.

### The template project

Create a project in the `archiso-bootcamp-academy` group from `template/`.
This is what the connect flow copies for each learner.

The bot can copy it through the API:

```sh
curl --request POST \
  --header "PRIVATE-TOKEN: $HAPPY_TOKEN" \
  --form "name=<learner>-flavour" \
  --form "path=<learner>-flavour" \
  --form "namespace_id=<group id>" \
  --form "default_branch=main" \
  "https://gitlab.acreetionos.org/api/v4/projects/<template id>/fork"
```

## The order of things

1. Deploy the site. The labs work immediately; the helper will say it cannot
   reach its wiki, which is honest.
2. Deploy the worker and set the secrets.
3. Set up the group, the bot, the runner and the OAuth application on GitLab.
4. Create the template project from `template/`.
5. Point the connect flow at it.

Steps 1 and 2 are enough for a learner to do every lab except the build one.
That is the shape the brief asks for anyway — no setup cliff, with the
account arriving at the build lab.

## Verifying a deployment

```sh
# the site serves
curl -sI https://your-site.example | head -1

# the worker is alive
curl -s https://your-worker.example/api/health

# the course text the helper grounds on is published
curl -s https://your-site.example/content/course.json | head -c 120
```

And the end to end check that matters: connect a GitLab account, get a
project, push a commit, and watch the pipeline produce a release with an ISO
in it that boots.
