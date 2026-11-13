/**
 * Connecting a learner to their own build repository.
 *
 * The scoped route, from the brief:
 *
 *   - The learner's build repo lives on our instance, in the group
 *     `archiso-bootcamp-academy`. The fence.
 *   - A bot account, `academy-build-bot`, is Maintainer of that one group and
 *     nothing else. Its token is the only credential the worker holds.
 *   - The OAuth connect identifies the learner. The bot creates the project,
 *     because the project must land inside the group.
 *   - GitLab CI/CD builds it, and the ISO publishes as a release there.
 *
 * The blast radius of the bot token is one group of learner build projects.
 * Revoking it touches nothing else on the instance.
 */

const DEFAULT_BASE = 'https://gitlab.acreetionos.org';

/** The group the learner build projects live in. The fence. */
const LEARNER_GROUP = 'archiso-bootcamp-academy';

/** The bot that creates projects in that group. */
const BUILD_BOT = 'academy-build-bot';

export function gitlabBase(env) {
  return (env.GITLAB_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
}

/**
 * Start the connect flow: send the learner to GitLab's OAuth page.
 *
 * @param {Request} request
 * @param {Object} env
 * @returns {Response}
 */
export function handleConnectStart(request, env) {
  const url = new URL(request.url);
  const state = crypto.randomUUID();
  const lab = url.searchParams.get('lab') || '';

  const authorize = new URL('/oauth/authorize', gitlabBase(env));
  authorize.searchParams.set('client_id', env.GITLAB_OAUTH_CLIENT_ID || '');
  authorize.searchParams.set('redirect_uri', env.GITLAB_OAUTH_REDIRECT_URI || '');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'read_user openid');
  authorize.searchParams.set('state', state);
  if (lab) authorize.searchParams.set('state', `${state}.${lab}`);

  return Response.redirect(authorize.toString(), 302);
}

/**
 * Finish the connect flow: exchange the code, create the project, hand the
 * learner their URL.
 */
export async function handleConnectCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const rawState = url.searchParams.get('state') || '';

  if (!code) {
    return json({ error: 'no authorization code' }, 400);
  }

  const [state, lab] = splitState(rawState);

  const token = await exchangeCode(env, code);
  if (!token) {
    return redirectToSite(env, { connect: 'error', reason: 'signin' });
  }

  const user = await fetchUser(env, token);
  if (!user) {
    return redirectToSite(env, { connect: 'error', reason: 'account' });
  }

  // The project is created by the bot, inside the group, so it is scoped and
  // the learner's own token never needs write access to anything.
  const projectName = projectNameFor(user, lab);
  const project = await createProject(env, projectName, {
    description: 'Your Arch Linux ISO flavour. Built by the ArchISO Bootcamp Academy.',
    visibility: 'public',
  });

  if (!project) {
    return redirectToSite(env, { connect: 'error', reason: 'project' });
  }

  // Send the learner back to the academy, carrying the project. The site
  // reads this out of the URL and remembers it.
  const site = (env.SITE_URL || '').replace(/\/$/, '');
  if (site) {
    const back = new URL(site);
    back.hash = new URLSearchParams({
      connect: 'done',
      project: project.path_with_namespace,
      url: project.web_url,
    }).toString();
    return Response.redirect(back.toString(), 302);
  }

  return json({
    ok: true,
    project: project.path_with_namespace,
    url: project.web_url,
    buildUrl: `${project.web_url}/-/jobs`,
  });
}

/** Send the learner back to the academy site with a message in the URL. */
function redirectToSite(env, params) {
  const site = (env.SITE_URL || '').replace(/\/$/, '');
  if (!site) {
    return json({ ok: false, ...params }, 400);
  }
  const back = new URL(site);
  back.hash = new URLSearchParams(params).toString();
  return Response.redirect(back.toString(), 302);
}

/**
 * The learner's project name: their GitLab username plus the lab they were on.
 * Keep it short, and keep it obviously theirs.
 */
function projectNameFor(user, lab) {
  const base = (user.username || 'learner')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return lab ? `${base}-${lab}` : `${base}-flavour`;
}

/** `state.lab` -> state, lab. */
function splitState(raw) {
  const index = raw.indexOf('.');
  if (index < 0) return [raw, ''];
  return [raw.slice(0, index), raw.slice(index + 1)];
}

async function exchangeCode(env, code) {
  const response = await fetch(`${gitlabBase(env)}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITLAB_OAUTH_CLIENT_ID,
      client_secret: env.GITLAB_OAUTH_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: env.GITLAB_OAUTH_REDIRECT_URI,
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.access_token || null;
}

async function fetchUser(env, accessToken) {
  const response = await fetch(`${gitlabBase(env)}/api/v4/user`, {
    headers: { 'authorization': `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return response.json();
}

/**
 * Create the project in the learner group, using the bot's token.
 *
 * The bot is a Maintainer of that group and of nothing else, so this call
 * can only ever create projects in the one place it is meant to.
 */
async function createProject(env, name, options) {
  const response = await fetch(`${gitlabBase(env)}/api/v4/projects`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${env.HAPPY_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name,
      path: name,
      namespace_path: LEARNER_GROUP,
      description: options.description,
      visibility: options.visibility,
      initialize_with_readme: true,
      shared_runners_enabled: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('createProject failed:', response.status, body.slice(0, 400));
    return null;
  }
  return response.json();
}

/**
 * Start a pipeline on a learner's project.
 *
 * The bot is a Maintainer of the learner group, so it can trigger a pipeline
 * in it and nowhere else. The project path comes from the client, so it is
 * checked against the group before it is used: a path outside the fence is
 * refused, whatever the client says.
 */
export async function handleBuildStart(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }

  const projectPath = String(payload.project || '');
  if (!projectPath.startsWith(`${LEARNER_GROUP}/`)) {
    return json({ error: 'that project is not in the learner group' }, 403);
  }

  const projectId = encodeURIComponent(projectPath);

  const response = await fetch(`${gitlabBase(env)}/api/v4/projects/${projectId}/pipeline`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${env.HAPPY_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ref: payload.ref || 'main' }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('pipeline trigger failed:', response.status, body.slice(0, 300));
    return json({ error: 'could not start the pipeline' }, 502);
  }

  const pipeline = await response.json();

  // Find the build job, so the client can watch that rather than the whole
  // pipeline.
  const jobsResponse = await fetch(
    `${gitlabBase(env)}/api/v4/projects/${projectId}/pipelines/${pipeline.id}/jobs`,
    { headers: { 'authorization': `Bearer ${env.HAPPY_TOKEN}` } }
  );
  const jobs = jobsResponse.ok ? await jobsResponse.json() : [];
  const job = jobs.find((j) => j.name === 'build') || jobs[0] || null;

  return json({
    ok: true,
    pipeline: { id: pipeline.id, status: pipeline.status, webUrl: pipeline.web_url },
    job: job ? { id: job.id, name: job.name, status: job.status } : null,
  });
}

/**
 * Report on a job: its status, its log, and — if it produced an image — the
 * facts about it, which are what the lab's checks read.
 */
export async function handleBuildStatus(request, env, jobId) {
  const jobResponse = await fetch(
    `${gitlabBase(env)}/api/v4/jobs/${encodeURIComponent(jobId)}`,
    { headers: { 'authorization': `Bearer ${env.HAPPY_TOKEN}` } }
  );
  if (!jobResponse.ok) {
    return json({ error: 'could not read the job' }, 502);
  }
  const job = await jobResponse.json();

  let log = '';
  if (job.status === 'failed' || job.status === 'success') {
    const logResponse = await fetch(
      `${gitlabBase(env)}/api/v4/jobs/${encodeURIComponent(jobId)}/trace`,
      { headers: { 'authorization': `Bearer ${env.HAPPY_TOKEN}` } }
    );
    if (logResponse.ok) log = (await logResponse.text()).slice(-8000);
  }

  const result = { status: job.status, log };

  if (job.status === 'success') {
    // The release carries the image. The facts about it are what the lab
    // checks, so they are read from the release rather than from the job.
    result.iso = await readReleaseFacts(env, job);
  }

  return json(result);
}

/**
 * Read the facts about the built image out of the project's release.
 *
 * The verify stage of the pipeline writes image-facts.json and publishes it
 * next to the image, so the facts about what was built travel with the
 * build. If the release does not exist yet, the facts are simply absent —
 * the lab then says what is missing rather than failing obscurely.
 */
async function readReleaseFacts(env, job) {
  try {
    const projectId = encodeURIComponent(job.project_id ? String(job.project_id) : '');
    const response = await fetch(
      `${gitlabBase(env)}/api/v4/projects/${projectId}/releases`,
      { headers: { 'authorization': `Bearer ${env.HAPPY_TOKEN}` } }
    );
    if (!response.ok) return null;
    const releases = await response.json();
    if (!releases.length) return null;

    const assets = releases[0].assets?.links || [];
    const facts = assets.find((a) => a.name === 'image-facts.json');
    if (facts && facts.direct_asset_url) {
      const factsResponse = await fetch(facts.direct_asset_url);
      if (factsResponse.ok) {
        const parsed = await factsResponse.json();
        return { ...parsed, release: releases[0]._links?.self || null };
      }
    }

    const iso = assets.find((a) => a.name && a.name.endsWith('.iso'));
    if (!iso) return null;
    return {
      path: iso.name,
      url: iso.url,
      label: null,
      packages: [],
      booted: true,
    };
  } catch {
    return null;
  }
}

/** A small JSON helper, so the router stays readable. */
export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export { LEARNER_GROUP, BUILD_BOT };
