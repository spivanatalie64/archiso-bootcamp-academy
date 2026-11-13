/**
 * Connecting a learner to their own build repository.
 *
 * The build lab is the one lab that touches real infrastructure. The learner
 * connects their GitLab account, the academy creates a project for them in
 * the learner group on our instance, and GitLab CI/CD builds their flavour
 * and publishes it as a release.
 *
 * When there is no worker — a plain static deployment, or a learner who has
 * not connected — the build lab falls back to a sandbox build so the lesson
 * can still be taught. The sandbox build is clearly labelled as one. It never
 * pretends to be a real pipeline.
 */

const STORAGE_KEY = 'academy.project.v1';

/**
 * Where the worker lives.
 *
 * Resolved lazily rather than at module scope, so this module can be
 * imported in Node — the lab verifier runs there, and a browser-only global
 * at import time would break it.
 */
function apiBase() {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector('meta[name="academy-api"]');
  if (meta && meta.content) return meta.content.replace(/\/$/, '');
  return '';
}

export function endpoint(path) {
  return `${apiBase()}${path}`;
}

/** The project this learner has connected, if any. */
export function connectedProject() {
  try {
    return JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null');
  } catch {
    return null;
  }
}

/** Remember the project. */
export function setConnectedProject(project) {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
  } catch {
    /* Private mode. The learner can still use the sandbox build. */
  }
}

/**
 * Send the learner to the worker to begin the OAuth flow.
 * The worker redirects back to /index.html#connect=done when it is finished.
 */
export function startConnect(labId) {
  const url = endpoint(`/api/connect/start${labId ? `?lab=${encodeURIComponent(labId)}` : ''}`);
  window.location.href = url;
}

/**
 * Finish the connect, if the worker redirected back with a result.
 *
 * The worker sends the learner back to the site with the project in the URL.
 * This reads it out, remembers it, and clears it from the address bar so a
 * refresh does not replay it.
 *
 * Returns the project, or null.
 */
export function finishConnect() {
  const raw = window.location.hash.replace(/^#/, '');
  const hash = new URLSearchParams(raw);
  const status = hash.get('connect');

  if (status !== 'done' && status !== 'error') return null;

  let project = null;
  if (status === 'done') {
    const path = hash.get('project');
    if (path) {
      project = { path, url: hash.get('url') || null };
      setConnectedProject(project);
    }
  }

  // Clear the marker, keeping the route the learner was on.
  const rest = raw.split('?')[0];
  const route = rest.startsWith('connect=') ? '#/' : rest;
  window.history.replaceState(null, '', window.location.pathname + route);

  return project;
}

/**
 * Ask the worker to trigger a pipeline on the learner's project and report
 * what is happening.
 *
 * @param {Object} project  the connected project
 * @param {Object} handlers {onState(state, detail), onLog(line), onDone(result), onError(message)}
 */
export async function runPipeline(project, handlers) {
  handlers.onState('queued', 'Your build is queued. Builds run in line, like a lab machine.');

  let response;
  try {
    response = await fetch(endpoint('/api/connect/build'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: project.path }),
    });
  } catch {
    handlers.onError(
      'I could not reach the build service. Check your connection and try again.'
    );
    return;
  }

  if (!response.ok) {
    handlers.onError('The build service refused the request. It may still be starting up.');
    return;
  }

  const data = await response.json();
  if (!data.job) {
    handlers.onError('The build service did not give me a job to watch.');
    return;
  }

  handlers.onState('running', 'Building.');

  // Follow the job until it finishes.
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(4000);

    let status;
    try {
      const statusResponse = await fetch(
        endpoint(`/api/connect/build/${encodeURIComponent(data.job.id)}`)
      );
      if (!statusResponse.ok) continue;
      status = await statusResponse.json();
    } catch {
      continue;
    }

    if (status.log) handlers.onLog(status.log);
    if (status.status === 'failed') {
      handlers.onError('The build failed. The job log has the details.');
      return;
    }
    if (status.status === 'done') {
      handlers.onDone(status.iso || {});
      return;
    }
  }

  handlers.onError(
    'The build has been going a long time. It is probably still running — ' +
    'check CI/CD → Pipelines in your project.'
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
