/**
 * Reusable state assertions for the academy labs.
 *
 * Every check in every lab is written against these, or against a plain
 * function that returns `{done, message}`. The rule they all obey:
 *
 *   **A check looks at the state of the world, never at how the learner got
 *   there.**
 *
 * So a check asks "is `nano` installed?", not "did they type `pacman -S nano`?".
 * There is more than one right way to install a package, and a learner who
 * found a different one has still learned it.
 *
 * A check returns `{done: boolean, message?: string}`. When `done` is false,
 * the message is what the learner is shown, and it must explain the *state*
 * that is missing, not restate the task.
 */

import { parseAssignments, parseArray, resolvePath } from './sim.js';

// ------------------------------------------------------------------ results

/** The task is done. */
export const ok = (message) => ({ done: true, message: message || '' });

/** The task is not done, and here is what is missing. */
export const no = (message) => ({ done: false, message: message || '' });

/**
 * Build a task.
 *
 * @param {Object} spec
 * @param {string} spec.id       stable identifier
 * @param {string} spec.prompt   what the learner is asked to do
 * @param {(state: LabState) => {done: boolean, message?: string}} spec.check
 * @param {string} [spec.hint]   a hint that teaches, not one that gives up
 * @param {string} [spec.hint2]  a stronger hint, revealed after the first
 * @param {string} [spec.why]    why the right state is the right state; used in the lab report
 */
export function task(spec) {
  return {
    id: spec.id,
    prompt: spec.prompt,
    check: spec.check,
    hint: spec.hint || '',
    hint2: spec.hint2 || '',
    why: spec.why || '',
  };
}

// -------------------------------------------------------------------- files

/** True if a path exists in the simulator's filesystem. */
export function fileExists(sim, path) {
  return sim.fs.has(resolvePath(sim.cwd, path));
}

/** Read a file, or null. */
export function readFile(sim, path) {
  return sim.readFile(path);
}

/**
 * True if a file exists and its contents match a regular expression.
 * The expression is matched against the whole file, so use `^`/`$` or `m`
 * flags deliberately.
 */
export function fileMatches(sim, path, pattern, flags = 'm') {
  const content = sim.readFile(path);
  if (content === null) return false;
  try {
    return new RegExp(pattern, flags).test(content);
  } catch {
    return false;
  }
}

/** True if a file exists and its contents are exactly the expected text. */
export function fileEquals(sim, path, expected) {
  const content = sim.readFile(path);
  return content !== null && content.trim() === String(expected).trim();
}

/** True if a file's mode matches, e.g. '755'. */
export function fileModeIs(sim, path, mode) {
  return sim.fileMode(path) === mode;
}

/** Every file in the filesystem, relative to the learner's home. */
export function listFiles(sim) {
  const home = sim.env.HOME + '/';
  return sim.allFiles().map((p) => (p.startsWith(home) ? p.slice(home.length) : p));
}

/**
 * A check that a file contains a given assignment, e.g. `iso_name="vesper"`.
 * Returns a check function so it reads well at the call site.
 */
export function fileHasAssignment(sim, path, key, value) {
  const content = sim.readFile(path);
  if (content === null) return false;
  const assignments = parseAssignments(content);
  return assignments[key] === value;
}

// ----------------------------------------------------------------- packages

/** True if a package is installed. */
export function packageInstalled(sim, name) {
  return sim.state.packages.has(name);
}

/** True if a package is not installed. */
export function packageNotInstalled(sim, name) {
  return !sim.state.packages.has(name);
}

/** Every installed package, sorted. */
export function installedPackages(sim) {
  return [...sim.state.packages].sort();
}

// --------------------------------------------------------------- packaging

/** The parsed variables of a PKGBUILD-style file. */
export function pkgbuildAssignments(sim, path = 'PKGBUILD') {
  const content = sim.readFile(path);
  return content === null ? {} : parseAssignments(content);
}

/** The parsed array variables of a PKGBUILD-style file. */
export function pkgbuildArray(sim, key, path = 'PKGBUILD') {
  const content = sim.readFile(path);
  return content === null ? [] : parseArray(content, key);
}

/** The functions defined in a PKGBUILD-style file. */
export function pkgbuildFunctions(sim, path = 'PKGBUILD') {
  const content = sim.readFile(path);
  if (content === null) return [];
  const found = [];
  const re = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\)\s*\{/gm;
  let match;
  while ((match = re.exec(content)) !== null) found.push(match[1]);
  return found;
}

/** True if a package file was built. */
export function packageBuilt(sim, name) {
  return Object.values(sim.state.built).some((b) => b.name === name);
}

// -------------------------------------------------------------------- git

/** True if the learner's working directory is a git repository. */
export function gitRepository(sim) {
  return Boolean(sim.state.git && sim.state.git.initialised);
}

/** True if at least one commit exists. */
export function gitHasCommits(sim) {
  return Boolean(sim.state.git && sim.state.git.committed && sim.state.git.committed.length);
}

/** The commit messages, oldest first. */
export function gitCommitMessages(sim) {
  if (!sim.state.git || !sim.state.git.committed) return [];
  return sim.state.git.committed.map((c) => c.message);
}

/** True if git is configured with a user name and email. */
export function gitHasIdentity(sim) {
  const config = (sim.state.git && sim.state.git.config) || {};
  return Boolean(config['user.name'] && config['user.email']);
}

// -------------------------------------------------------------------- ISO

/** The facts a build lab records about the image it produced. */
export function isoFacts(sim) {
  return sim.state.iso || {};
}

/** True if an image was built at all. */
export function isoBuilt(sim) {
  return Boolean(sim.state.iso && sim.state.iso.path);
}

/** True if the built image carries a package. */
export function isoHasPackage(sim, name) {
  const iso = sim.state.iso;
  if (!iso || !iso.packages) return false;
  return iso.packages.includes(name);
}

/** True if the built image has the given volume label. */
export function isoLabelIs(sim, label) {
  const iso = sim.state.iso;
  return Boolean(iso && iso.label === label);
}

/** True if the built image was verified to boot. */
export function isoBooted(sim) {
  const iso = sim.state.iso;
  return Boolean(iso && iso.booted);
}

// ------------------------------------------------------- combined helpers

/**
 * Combine checks so that a task passes when any of its parts pass.
 * Used where a learner has genuinely more than one route to the same state.
 */
export function anyOf(...checks) {
  return (state) => {
    const results = checks.map((c) => c(state));
    if (results.some((r) => r.done)) {
      return ok(results.find((r) => r.done).message);
    }
    return no(results.map((r) => r.message).filter(Boolean).join(' '));
  };
}

/**
 * Combine checks so that a task passes only when every part passes.
 * The message is the first failure's message, which is the one the learner
 * most needs to hear.
 */
export function allOf(...checks) {
  return (state) => {
    for (const c of checks) {
      const result = c(state);
      if (!result.done) return result;
    }
    return ok('');
  };
}
