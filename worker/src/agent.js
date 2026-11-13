/**
 * The helper agent.
 *
 * The rules, from the brief:
 *
 *   - Its knowledge is our wiki. It answers from that material and the
 *     course, not from the open internet's opinion.
 *   - It helps inside the lab, in the moment.
 *   - It knows its limits and says so. When it does not know, it does not
 *     guess at a build step. It hands the learner to a human, plainly.
 *
 * So the agent is given a retrieved set of passages and is told, in the
 * system prompt, that the passages are the only ground it has. If the
 * question is not covered, the correct answer is "I do not know that" plus a
 * pointer to a human — not a plausible guess about a command that would
 * destroy somebody's afternoon.
 */

import { loadWiki, selectContext } from './wiki.js';
import { loadCourseText } from './course.js';

const HUMAN_DOORS =
  'A human can help: natalie@acreetionos.org or https://discord.acreetionos.org';

const SYSTEM_PROMPT = `You are the helper inside the ArchISO Bootcamp Academy, an online course that teaches people to build their own Arch Linux ISO images.

You answer from the reference passages you are given. Those passages are the only ground you have: they are drawn from the AcreetionOS wiki and from the course material itself.

Rules:
- Answer only from the passages. If the passages do not cover the question, say so plainly and hand the learner to a human. Do not guess at a command, a package name, a file path, or a build step. A wrong command costs a learner an afternoon.
- If the passages cover it partially, answer the part they cover and say which part is not covered.
- Be plain and brief. Short sentences. Second person. No corporate register.
- Explain the why, not just the what, but do not lecture.
- If the learner is in a lab, keep the answer to what that lab is doing.
- Never invent a URL. Only give URLs that appear in the passages or in the human doors below.
- If you are asked for something harmful, out of scope, or unrelated to building Arch ISO images, say plainly that it is outside what you know and point to a human.

Human doors, which you should offer whenever you cannot answer:
${HUMAN_DOORS}`;

/**
 * Ask the agent a question.
 *
 * @param {string} question
 * @param {Object} env        the worker's bindings and secrets
 * @param {string|null} labId the lab the learner is on, if any
 * @returns {Promise<{answer: string, sources: string[]}>}
 */
export async function ask(question, env, labId = null) {
  const [documents, courseText] = await Promise.all([
    loadWiki(env),
    loadCourseText(env),
  ]);

  const { passages, covered } = selectContext(documents, question, courseText);

  if (!covered) {
    return {
      answer:
        'I do not have anything on that in our wiki, and I would rather say so than guess — ' +
        'a wrong command here costs you an afternoon.\n\n' + HUMAN_DOORS,
      sources: [],
    };
  }

  const context = passages
    .map((p, i) => `[${i + 1}] (${p.source})\n${p.text}`)
    .join('\n\n');

  const labNote = labId
    ? `\n\nThe learner is currently in the lab "${labId}".`
    : '';

  const answer = await callModel(env, [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        `Reference passages:\n\n${context}\n\n` +
        `Question: ${question}${labNote}`,
    },
  ]);

  return {
    answer: answer || 'I could not turn that into an answer. ' + HUMAN_DOORS,
    sources: passages.map((p) => p.source),
  };
}

/**
 * Call the model.
 *
 * Two providers are supported. Workers AI is the default because it lives on
 * the same free tier as the worker itself — no second account, no second bill.
 * Any OpenAI-compatible endpoint works as well, for anyone who would rather
 * use a different one.
 */
async function callModel(env, messages) {
  if (env.OPENAI_BASE_URL && env.OPENAI_API_KEY) {
    return callOpenAiCompatible(env, messages);
  }
  return callWorkersAi(env, messages);
}

async function callWorkersAi(env, messages) {
  const model = env.AGENT_MODEL || '@cf/meta/llama-3.1-8b-instruct';
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.CF_API_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        max_tokens: 700,
        temperature: 0.2,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Workers AI returned ${response.status}`);
  }

  const data = await response.json();
  return data?.result?.response || data?.result?.response?.content || '';
}

async function callOpenAiCompatible(env, messages) {
  const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.AGENT_MODEL || 'gpt-4o-mini',
      messages,
      max_tokens: 700,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`Model endpoint returned ${response.status}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
}
