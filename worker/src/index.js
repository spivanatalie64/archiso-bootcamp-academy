/**
 * The academy worker.
 *
 * This is the one piece of the academy that cannot be a static file. The
 * lessons, the labs, the checks and the pages are all static files on a free
 * static host. This holds the two things that need a server:
 *
 *   /api/agent        the helper that answers from our wiki
 *   /api/connect/*    the OAuth connect that gives a learner their own
 *                     build repository on our GitLab
 *
 * Everything else — CORS, routing, the honest error handling — is here.
 */

import { ask } from './agent.js';
import {
  handleConnectStart, handleConnectCallback, handleBuildStart, handleBuildStatus, json,
} from './gitlab.js';

const ALLOWED_ORIGINS = (env) => (env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim());

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // The academy is a static site on some host and this worker is on
    // another, so CORS has to be answered here. It is answered from an
    // allow-list, not from a wildcard, unless the deployment says otherwise.
    const origin = request.headers.get('origin');
    const allowed = ALLOWED_ORIGINS(env);
    const corsOrigin = allowed.includes('*')
      ? (origin || '*')
      : (origin && allowed.includes(origin) ? origin : allowed[0]);

    const withCors = (response) => {
      const headers = new Headers(response.headers);
      headers.set('access-control-allow-origin', corsOrigin);
      headers.set('access-control-allow-headers', 'content-type');
      headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
      headers.set('vary', 'origin');
      return new Response(response.body, { status: response.status, headers });
    };

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }));
    }

    try {
      if (url.pathname === '/api/health') {
        return withCors(json({
          ok: true,
          agent: Boolean(env.CF_API_TOKEN || env.OPENAI_API_KEY),
          gitlab: Boolean(env.HAPPY_TOKEN),
        }));
      }

      if (url.pathname === '/api/agent' && request.method === 'POST') {
        return withCors(await handleAgent(request, env));
      }

      if (url.pathname === '/api/connect/start') {
        return withCors(handleConnectStart(request, env));
      }

      if (url.pathname === '/api/connect/callback') {
        return withCors(await handleConnectCallback(request, env));
      }

      if (url.pathname === '/api/connect/build' && request.method === 'POST') {
        return withCors(await handleBuildStart(request, env));
      }

      const buildStatus = url.pathname.match(/^\/api\/connect\/build\/([^/]+)$/);
      if (buildStatus) {
        return withCors(await handleBuildStatus(request, env, decodeURIComponent(buildStatus[1])));
      }

      return withCors(json({ error: 'not found' }, 404));
    } catch (err) {
      console.error('worker error:', err);
      return withCors(json({ error: 'the worker had a problem' }, 500));
    }
  },
};

async function handleAgent(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }

  const question = String(payload.question || '').trim();
  if (!question) {
    return json({ error: 'no question' }, 400);
  }

  if (question.length > 2000) {
    return json({ error: 'question too long' }, 400);
  }

  try {
    const result = await ask(question, env, payload.lab || null);
    return json(result);
  } catch (err) {
    console.error('agent error:', err);
    // The agent failing is not the learner's fault and must not look like
    // their fault either.
    return json({
      error: 'the helper could not answer right now',
      answer:
        'Something went wrong on my side, so I cannot answer honestly. ' +
        'A human can: natalie@acreetionos.org or https://discord.acreetionos.org',
    }, 502);
  }
}
