#!/usr/bin/env node
/**
 * Verify every lab.
 *
 * A lab that can never be completed is worse than no lab, and a lab whose
 * checks can be satisfied by accident is not a check. So every lab carries a
 * `solution(state)` — the state that a learner who did it properly ends up
 * in — and this walks every lab, applies the solution, and asserts that every
 * task then passes.
 *
 * It also asserts the opposite: that with the environment in its starting
 * state, the lab is not already complete. A lab that is finished before the
 * learner starts teaches nothing.
 *
 *     node tools/verify-labs.mjs
 *
 * Exit status is non-zero if any lab is broken.
 */

import { labs } from '../site/content/index.js';
import { Sim } from '../site/assets/sim.js';

let failures = 0;
let warnings = 0;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

for (const lab of labs) {
  const problems = [];
  const notes = [];

  if (!lab.solution) {
    problems.push('the lab has no solution(state), so it cannot be verified');
  }

  if (!Array.isArray(lab.tasks) || !lab.tasks.length) {
    problems.push('the lab has no tasks');
  }

  if (!lab.scenario) {
    problems.push('the lab has no scenario');
  }

  if (!lab.teaches) {
    problems.push('the lab has no lesson text');
  }

  // --- 1. The lab must not be finished before the learner starts.
  const startState = buildState(lab, null);
  const startResults = evaluate(lab, startState);
  const doneAtStart = startResults.filter((r) => r.done).length;
  if (doneAtStart > 0) {
    problems.push(
      `${doneAtStart} of ${lab.tasks.length} tasks are already satisfied ` +
      'before the learner does anything'
    );
  }

  // --- 2. The solution must satisfy every task.
  if (lab.solution) {
    const solvedState = buildState(lab, lab.solution);
    const solvedResults = evaluate(lab, solvedState);
    for (const result of solvedResults) {
      if (!result.done) {
        problems.push(
          `the solution does not satisfy "${result.prompt}" — ` +
          (result.message ? `the check says: ${result.message}` : 'the check failed')
        );
      }
    }
  }

  // --- 3. Quality: every task needs a hint and a why.
  for (const task of lab.tasks || []) {
    if (!task.hint) notes.push(`task "${task.id}" has no hint`);
    if (!task.why) notes.push(`task "${task.id}" has no why`);
    if (!task.check) problems.push(`task "${task.id}" has no check`);
  }

  const label = `${lab.id.padEnd(28)} ${String(lab.tasks?.length || 0).padStart(2)} tasks`;

  if (problems.length) {
    failures += problems.length;
    console.log(`${RED}FAIL${OFF} ${label}`);
    for (const problem of problems) console.log(`       ${RED}${problem}${OFF}`);
  } else {
    console.log(`${GREEN}ok  ${OFF} ${label}`);
  }

  for (const note of notes) {
    warnings += 1;
    console.log(`       ${YELLOW}note:${OFF} ${note}`);
  }
}

console.log('');
if (failures) {
  console.log(`${RED}${failures} problem(s) found.${OFF}`);
} else {
  console.log(`${GREEN}All ${labs.length} labs verified.${OFF}`);
}
if (warnings) {
  console.log(`${YELLOW}${warnings} note(s).${OFF}`);
}

process.exit(failures ? 1 : 0);

/**
 * Build the state a task check sees, optionally with the solution applied.
 */
function buildState(lab, solution) {
  const env = lab.env || {};

  const sim = new Sim({
    files: env.files ? { ...env.files } : {},
    packages: env.packages ? [...env.packages] : ['base', 'pacman', 'bash'],
    state: env.state ? JSON.parse(JSON.stringify(env.state)) : {},
    cwd: env.cwd || '/home/learner',
  });

  const editor = {};
  for (const [path, content] of Object.entries(env.files || {})) {
    editor[path] = content;
  }

  // A lab's start() may hook into the runner — to add a button, or an
  // editor of its own. Give it a stub with the same shape, so those hooks
  // run rather than crash. The stub has no DOM, so anything that reaches for
  // one finds nothing and backs off, which is what the labs are written to
  // expect.
  const runner = {
    sim,
    editor,
    envEl: null,
    buildEl: null,
    results: {},
    renderBuild() {},
    startBuild() {},
    evaluate() {},
    scheduleEvaluate() {},
  };

  const state = { sim, editor, runner, results: {}, build: env.build || null };

  if (typeof lab.start === 'function') {
    lab.start(state);
  }

  if (solution) {
    const applied = solution(state);
    if (applied && typeof applied === 'object') {
      // A solution may hand back the editor contents it wants to set.
      for (const [path, content] of Object.entries(applied)) {
        state.editor[path] = content;
      }
    }
  }

  // The editor and the filesystem must agree — but only where the editor
  // actually changed. A terminal lab's solution changes files on the
  // filesystem, and writing the editor's original contents back over them
  // would undo the very change being checked.
  const starting = env.files || {};
  for (const [path, content] of Object.entries(state.editor)) {
    if (content !== starting[path]) {
      sim.writeFile(path, content);
    }
  }

  return state;
}

function evaluate(lab, state) {
  const results = [];
  for (const task of lab.tasks || []) {
    let result;
    try {
      result = task.check(state) || { done: false };
    } catch (err) {
      result = { done: false, message: `the check threw: ${err.message}` };
    }
    results.push({ prompt: task.prompt, done: Boolean(result.done), message: result.message });
  }
  return results;
}
