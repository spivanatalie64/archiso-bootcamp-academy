/**
 * The course material, for grounding.
 *
 * The agent's knowledge is the wiki *and* the course. A learner asking "why
 * does the build fail here?" is asking about a lab, and the lab's own prose
 * is the best answer.
 *
 * The material is generated from the lab definitions into a single JSON file
 * by tools/build-course-text.mjs, so the worker does not have to parse
 * JavaScript modules. The file is regenerated whenever the labs change.
 */

const DEFAULT_URL =
  'https://raw.githubusercontent.com/spivanatalie64/archiso-bootcamp-academy/main/site/content/course.json';

const CACHE_TTL_MS = 15 * 60 * 1000;

let cache = null;
let cachedAt = 0;

export async function loadCourseText(env) {
  const now = Date.now();
  if (cache && now - cachedAt < CACHE_TTL_MS) return cache;

  const url = env.COURSE_TEXT_URL || DEFAULT_URL;
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'acreetionos-academy-agent' },
      cf: { cacheTtl: 900 },
    });
    if (!response.ok) throw new Error(`course text returned ${response.status}`);
    const data = await response.json();
    cache = (data.pieces || []).map((p) => ({ label: p.label, text: p.text }));
    cachedAt = now;
  } catch {
    // The course material is a nice-to-have. The wiki alone is still a
    // grounding, and the agent's honesty rules still apply without it.
    cache = cache || [];
  }
  return cache;
}
