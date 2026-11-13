#!/usr/bin/env node
/**
 * Generate the course text the helper agent grounds on.
 *
 * The agent's knowledge is the wiki *and* the course. The wiki is fetched at
 * request time so it stays current. The course text is generated from the lab
 * definitions into one JSON file, so the worker does not have to parse
 * JavaScript modules.
 *
 * Run it whenever the labs change:
 *
 *     node tools/build-course-text.mjs
 *
 * The output is committed, because the worker fetches it from the repository.
 * It is deterministic on purpose — no timestamps — so CI can regenerate it
 * and expect to get exactly what was committed.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..', 'site');

const { labs } = await import(resolve(siteRoot, 'content', 'index.js'));

const pieces = [];

for (const lab of labs) {
  const label = `${lab.title}`;

  if (lab.scenario) {
    pieces.push({ label: `${label} — scenario`, text: lab.scenario });
  }
  if (lab.teaches) {
    pieces.push({ label: `${label} — the lesson`, text: lab.teaches });
  }
  for (const section of lab.readFirst || []) {
    pieces.push({
      label: `${label} — ${section.title}`,
      text: (section.body || []).join('\n\n'),
    });
  }
  for (const t of lab.tasks || []) {
    pieces.push({
      label: `${label} — task: ${t.prompt}`,
      text: [t.prompt, t.hint, t.hint2, t.why].filter(Boolean).join('\n\n'),
    });
  }
  if (lab.report?.lede) {
    pieces.push({ label: `${label} — the point`, text: lab.report.lede });
  }
}

const output = {
  labs: labs.length,
  pieces,
};

const target = resolve(siteRoot, 'content', 'course.json');
writeFileSync(target, JSON.stringify(output, null, 2) + '\n');

console.log(`Wrote ${pieces.length} pieces from ${labs.length} labs to ${target}`);
