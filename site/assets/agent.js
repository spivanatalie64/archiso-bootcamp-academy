/**
 * The helper agent's face.
 *
 * The agent answers from our wiki. It runs in a small worker — the one piece
 * of the academy that cannot be a static file, because it needs a secret to
 * talk to the model and a place to keep the wiki content.
 *
 * This file is only the client. It knows how to ask and how to render the
 * answer. It does not know how to answer.
 *
 * When the worker is not reachable — which is the case for a plain static
 * deployment, and for anyone running the academy locally — the agent says so
 * and points at the human doors. It never pretends to have answered.
 */

/**
 * Where the worker lives.
 *
 * Resolved lazily, so this module can be imported outside a browser — the
 * lab verifier runs in Node, and a browser-only global read at import time
 * would break it.
 */
function apiBase() {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector('meta[name="academy-api"]');
  if (meta && meta.content) return meta.content.replace(/\/$/, '');
  return '';
}

function endpoint(path) {
  return `${apiBase()}${path}`;
}

export function mountAgent() {
  const toggle = document.querySelector('[data-agent-toggle]');
  const panel = document.querySelector('[data-agent-panel]');
  const body = document.querySelector('[data-agent-body]');
  const form = document.querySelector('[data-agent-form]');
  const input = document.querySelector('[data-agent-input]');
  const close = document.querySelector('[data-agent-close]');

  if (!toggle || !panel || !body || !form || !input) return;

  const open = () => {
    panel.classList.add('open');
    input.focus();
  };
  const hide = () => panel.classList.remove('open');

  toggle.addEventListener('click', () => {
    if (panel.classList.contains('open')) hide();
    else open();
  });
  if (close) close.addEventListener('click', hide);

  // The lab the learner is on, so the agent has context. The route carries it.
  const currentLab = () => {
    const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
    return parts[0] === 'lab' ? parts[1] : null;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = '';
    appendMessage(body, 'me', question);
    const pending = appendMessage(body, 'them', 'Thinking…');

    try {
      const response = await fetch(endpoint('/api/agent'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question,
          lab: currentLab(),
          transcript: readTranscript(body),
        }),
      });

      if (!response.ok) {
        pending.className = 'agent-msg error';
        pending.textContent = offlineText(response.status);
        return;
      }

      const data = await response.json();
      pending.className = 'agent-msg them';
      pending.textContent = data.answer || 'I do not have an answer for that.';
    } catch {
      pending.className = 'agent-msg error';
      pending.textContent = offlineText(null);
    }
  });
}

function appendMessage(container, who, text) {
  const node = document.createElement('div');
  node.className = `agent-msg ${who}`;
  node.textContent = text;
  container.appendChild(node);
  container.scrollTop = container.scrollHeight;
  return node;
}

function readTranscript(container) {
  return [...container.querySelectorAll('.agent-msg')]
    .map((n) => ({ who: n.classList.contains('me') ? 'learner' : 'helper', text: n.textContent }))
    .slice(-12);
}

/**
 * When the worker cannot answer, say so plainly and hand the learner to a
 * person. The brief is explicit that the human doors are always visible and
 * never buried.
 */
function offlineText(status) {
  if (status === 429) {
    return 'I have been asked too many questions in a row. Wait a moment, or ask a human: ' +
      'natalie@acreetionos.org or https://discord.acreetionos.org';
  }
  return 'I cannot reach my wiki right now, so I cannot answer honestly. ' +
    'A human can: natalie@acreetionos.org or https://discord.acreetionos.org';
}
