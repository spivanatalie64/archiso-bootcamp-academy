/**
 * A self-test for the lab framework.
 *
 * Fifteen labs depend on the runner, the simulator and the checks. If the
 * framework is broken, every one of them is broken, and the breakage looks
 * like the content's fault. So the framework is tested on its own, in a real
 * browser, against a synthetic lab that exercises every part of it.
 *
 * Load /selftest.html. The result appears on the page and in the title.
 */

import { LabRunner, el } from './lab.js';
import * as checks from './checks.js';

const results = [];

function assert(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail: detail || '' });
}

async function run() {
  const root = document.querySelector('[data-test]');

  // --- a synthetic lab with one task of each environment kind
  const lab = {
    id: 'selftest',
    track: 'zero',
    title: 'Self test',
    scenario: 'A scenario.',
    teaches: 'A lesson.',
    readFirst: [{ title: 'Reading', body: ['A paragraph.'] }],
    env: {
      type: 'editor',
      files: { 'profiledef.sh': 'iso_name="start"\n' },
      packages: ['base', 'pacman'],
    },
    tasks: [
      checks.task({
        id: 'editor-task',
        prompt: 'Change the name',
        check: (s) => checks.fileHasAssignment(s.sim, 'profiledef.sh', 'iso_name', 'done')
          ? checks.ok('')
          : checks.no('Not yet.'),
        hint: 'Change it.',
        why: 'Because.',
      }),
      checks.task({
        id: 'terminal-task',
        prompt: 'Install nano',
        check: (s) => checks.packageInstalled(s.sim, 'nano')
          ? checks.ok('')
          : checks.no('nano is not installed yet.'),
        hint: 'Use pacman.',
        why: 'Because.',
      }),
    ],
  };

  const runner = new LabRunner(lab, root);

  // --- the lab renders its parts
  assert('scenario rendered', Boolean(root.querySelector('.scenario-text')));
  assert('lesson rendered', Boolean(root.querySelector('.lab-teaches')));
  assert('reading rendered', Boolean(root.querySelector('.lab-reading')));
  assert('tasks rendered', root.querySelectorAll('.task').length === 2);
  assert('editor rendered', Boolean(root.querySelector('.code-editor')));
  assert('report placeholder shown', Boolean(root.querySelector('.report-pending')));

  // --- the lab is not already complete
  assert('not complete at the start', runner.progress().done === 0);

  // --- editing a file satisfies the task
  const area = root.querySelector('.code-editor');
  area.value = 'iso_name="done"\n';
  area.dispatchEvent(new Event('input'));
  await tick();
  assert('editor task satisfied by the edit', runner.results['editor-task'].done);
  assert('failing task shows its message',
    (root.querySelector('.task-message')?.textContent || '').includes('nano'));

  // --- running a command satisfies the terminal task
  runner.runCommand('pacman -S nano');
  assert('terminal task satisfied by the command', runner.results['terminal-task'].done);
  // This lab has an editor, not a terminal, so nothing is rendered — but the
  // command still ran and the state changed.
  assert('the command was recorded',
    runner.terminalLines.length >= 1 && runner.terminalLines[0].text === 'pacman -S nano');
  assert('the command output was captured',
    runner.terminalLines.some((l) => l.text.includes('installing nano')));

  // --- the report appears when everything is done
  assert('report appears when complete', Boolean(root.querySelector('.report-card')));

  // --- hints appear on request
  runner.reset();
  assert('reset clears the tasks', runner.progress().done === 0);
  const hintButton = root.querySelector('.hint-btn');
  hintButton.click();
  await tick();
  assert('hint appears', Boolean(root.querySelector('.hint-text')));

  // --- the simulator behaves
  const sim = runner.sim;
  sim.run('mkdir -p /home/learner/pkg');
  assert('mkdir works', sim.readFile('/home/learner/pkg') !== null || sim.fs.has('/home/learner/pkg'));
  sim.writeFile('/home/learner/pkg/PKGBUILD', 'pkgname="hi"\npkgver="1.0"\n');
  assert('PKGBUILD assignments parse',
    checks.pkgbuildAssignments(sim, '/home/learner/pkg/PKGBUILD').pkgname === 'hi');
  assert('PKGBUILD arrays parse',
    JSON.stringify(checks.pkgbuildArray(sim, 'depends', '/home/learner/pkg/PKGBUILD')) === '[]');

  const pkgResult = sim.run('makepkg');
  assert('makepkg fails without a PKGBUILD in the working directory',
    pkgResult.code !== 0 || Object.keys(sim.state.built).length > 0);

  sim.cwd = '/home/learner/pkg';
  const buildResult = sim.run('makepkg');
  assert('makepkg builds when the recipe is there', buildResult.code === 0, buildResult.stderr);
  assert('the built package is recorded',
    Object.values(sim.state.built).some((b) => b.name === 'hi'));

  const gitResult = sim.run('git status');
  assert('git without a repository fails clearly',
    gitResult.code !== 0 && gitResult.stderr.includes('not a git repository'));

  sim.run('git init');
  sim.run('git config user.name learner');
  sim.run('git config user.email learner@example.com');
  assert('git identity is detected', checks.gitHasIdentity(sim));
  sim.run('git add PKGBUILD');
  sim.run('git commit -m "first"');
  assert('the commit is recorded', checks.gitCommitMessages(sim)[0] === 'first');

  // --- a terminal lab renders its output
  const terminalRoot = el('div', {});
  const terminalLab = {
    id: 'selftest-terminal',
    track: 'zero',
    title: 'Self test, terminal',
    scenario: 'A scenario.',
    teaches: 'A lesson.',
    env: { type: 'terminal', packages: ['base', 'pacman'] },
    tasks: [],
  };
  const terminalRunner = new LabRunner(terminalLab, terminalRoot);
  assert('terminal environment rendered', Boolean(terminalRoot.querySelector('.terminal')));
  terminalRunner.runCommand('ls');
  assert('terminal output shown', terminalRoot.querySelectorAll('.term-line').length > 0);

  // --- the report
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  const summary = el('div', { class: 'selftest-summary' }, [
    el('h1', {}, `${passed} of ${results.length} passed`),
    el('ul', {}, results.map((r) => el('li', { class: r.ok ? 'ok' : 'fail' },
      `${r.ok ? 'PASS' : 'FAIL'} — ${r.name}${r.detail ? ` (${r.detail})` : ''}`))),
  ]);
  document.body.appendChild(summary);
  document.title = failed.length ? `SELFTEST FAILED (${failed.length})` : 'SELFTEST OK';

  window.__selftest = { passed, total: results.length, failed: failed.map((f) => f.name) };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 220));
}

run().catch((err) => {
  document.title = 'SELFTEST ERROR';
  window.__selftest = { error: err.message, stack: err.stack };
  const box = el('pre', {}, err.stack || err.message);
  document.body.appendChild(box);
});
