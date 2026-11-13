/**
 * The lab runner.
 *
 * A lab has five parts, in the shape the brief asks for:
 *
 *   scenario   a real reason to build the thing, not "do steps 1 through 9"
 *   teaches    the lesson in plain words, before anything is asked
 *   tasks      the task list; each task checks itself off as the state
 *              becomes true
 *   env        the environment: an editor, a terminal, or a real build
 *   report     at the end, what you completed, what you missed, and why the
 *              right state is the right state
 *
 * Hints are always available and cost nothing. Reset is always available and
 * costs nothing. Getting stuck and starting over is normal use, not failure.
 */

import { Sim } from './sim.js';
import * as checks from './checks.js';
import { connectedProject, runPipeline, startConnect } from './connect.js';

export class LabRunner {
  /**
   * @param {Object} lab    the lab definition
   * @param {HTMLElement} root  where to render
   * @param {Object} [opts]
   * @param {(progress: Object) => void} [opts.onProgress]
   * @param {(event: Object) => void} [opts.onEvent]
   */
  constructor(lab, root, opts = {}) {
    this.lab = lab;
    this.root = root;
    this.opts = opts;
    this.hintsShown = new Set();
    this.reset();
  }

  // ------------------------------------------------------------- lifecycle

  /** Put the lab back to its starting state. Free, and always allowed. */
  reset() {
    const env = this.lab.env || {};
    this.sim = new Sim({
      files: env.files ? { ...env.files } : {},
      packages: env.packages ? [...env.packages] : ['base', 'pacman', 'bash'],
      state: env.state ? JSON.parse(JSON.stringify(env.state)) : {},
      cwd: env.cwd || '/home/learner',
    });

    // The editor keeps its own copy so the filesystem and the text the
    // learner is looking at cannot drift apart.
    this.editorFiles = {};
    for (const [path, content] of Object.entries(env.files || {})) {
      this.editorFiles[path] = content;
    }

    this.terminalLines = [];
    this.buildState = env.build ? { ...env.build } : null;

    if (typeof this.lab.start === 'function') {
      this.lab.start({ sim: this.sim, runner: this });
    }

    this.render();
    this.evaluate();
  }

  // ------------------------------------------------------------ evaluation

  /** Run every task check and update the task list. */
  evaluate() {
    const state = this.labState();
    this.results = {};
    for (const t of this.lab.tasks || []) {
      let result;
      try {
        result = t.check(state) || { done: false };
      } catch (err) {
        result = { done: false, message: `The check for "${t.id}" failed: ${err.message}` };
      }
      this.results[t.id] = result;
    }
    this.updateTaskList();
    this.updateReport();
    if (this.opts.onProgress) this.opts.onProgress(this.progress());
  }

  /** The object handed to every task check. */
  labState() {
    return {
      sim: this.sim,
      editor: this.editorFiles,
      runner: this,
      results: this.results || {},
      build: this.buildState,
    };
  }

  /** Progress summary, for saving and for the course home page. */
  progress() {
    const tasks = this.lab.tasks || [];
    const done = tasks.filter((t) => this.results && this.results[t.id] && this.results[t.id].done);
    return {
      labId: this.lab.id,
      total: tasks.length,
      done: done.length,
      complete: tasks.length > 0 && done.length === tasks.length,
      doneIds: done.map((t) => t.id),
    };
  }

  // --------------------------------------------------------------- render

  render() {
    const lab = this.lab;
    this.root.innerHTML = '';

    this.root.appendChild(el('section', { class: 'lab-scenario' }, [
      el('p', { class: 'eyebrow' }, 'Scenario'),
      el('p', { class: 'scenario-text' }, lab.scenario || ''),
    ]));

    if (lab.teaches) {
      this.root.appendChild(el('section', { class: 'lab-teaches' }, [
        el('p', { class: 'eyebrow' }, 'Before you start'),
        el('div', { class: 'prose' }, [el('p', {}, lab.teaches)]),
      ]));
    }

    for (const section of lab.readFirst || []) {
      this.root.appendChild(el('section', { class: 'lab-reading' }, [
        el('h3', {}, section.title),
        el('div', { class: 'prose' }, (section.body || []).map((p) => el('p', {}, p))),
      ]));
    }

    // --- the task list
    this.taskListEl = el('ol', { class: 'task-list' });
    this.root.appendChild(el('section', { class: 'lab-tasks' }, [
      el('p', { class: 'eyebrow' }, 'Tasks'),
      this.taskListEl,
    ]));
    this.updateTaskList();

    // --- the environment
    this.envEl = el('section', { class: 'lab-env' });
    this.root.appendChild(this.envEl);
    this.renderEnvironment();

    // --- the report
    this.reportEl = el('section', { class: 'lab-report' });
    this.root.appendChild(this.reportEl);
    this.updateReport();
  }

  updateTaskList() {
    if (!this.taskListEl) return;
    this.taskListEl.innerHTML = '';
    for (const t of this.lab.tasks || []) {
      const result = this.results && this.results[t.id];
      const done = Boolean(result && result.done);
      const li = el('li', { class: done ? 'task done' : 'task' }, [
        el('span', { class: 'task-mark', 'aria-hidden': 'true' }, done ? '✓' : '○'),
        el('div', { class: 'task-body' }, [
          el('p', { class: 'task-prompt' }, t.prompt),
          done ? null : (result && result.message
            ? el('p', { class: 'task-message' }, result.message)
            : null),
          done && t.why ? el('p', { class: 'task-why' }, t.why) : null,
          el('div', { class: 'task-actions' }, [
            el('button', {
              class: 'btn-link hint-btn',
              type: 'button',
              onclick: () => this.showHint(t),
            }, this.hintsShown.has(t.id) ? 'More hint' : 'Hint'),
            el('button', {
              class: 'btn-link reset-btn',
              type: 'button',
              onclick: () => this.reset(),
            }, 'Reset lab'),
          ]),
        ]),
      ]);
      this.taskListEl.appendChild(li);
    }
  }

  showHint(taskToHint) {
    const li = this.taskListEl.querySelector(`[data-task="${taskToHint.id}"]`);
    const key = taskToHint.id;
    let text;
    if (!this.hintsShown.has(key) && taskToHint.hint) {
      text = taskToHint.hint;
    } else if (taskToHint.hint2) {
      text = taskToHint.hint2;
    } else if (taskToHint.hint) {
      text = taskToHint.hint;
    } else {
      text = 'There is no hint for this one. Reset the lab and try a different approach.';
    }
    this.hintsShown.add(key);

    const holder = el('p', { class: 'hint-text' }, text);
    const existing = this.taskListEl.querySelector('.hint-text[data-for="' + key + '"]');
    if (existing) existing.remove();
    holder.dataset.for = key;
    const target = [...this.taskListEl.querySelectorAll('li')].find((n) =>
      n.textContent.includes(taskToHint.prompt.slice(0, 30))
    );
    if (target) target.querySelector('.task-body').appendChild(holder);
    void li;
  }

  updateReport() {
    if (!this.reportEl) return;
    this.reportEl.innerHTML = '';
    const p = this.progress();
    if (!p.complete) {
      this.reportEl.appendChild(el('p', { class: 'report-pending' },
        `The lab report appears when all ${p.total} tasks are done. ` +
        `${p.done} of ${p.total} so far. Nothing here is scored, and you can reset and try again as often as you like.`));
      return;
    }

    const rows = (this.lab.tasks || []).map((t) => el('li', { class: 'report-row' }, [
      el('span', { class: 'report-mark' }, '✓'),
      el('div', {}, [
        el('p', { class: 'report-prompt' }, t.prompt),
        t.why ? el('p', { class: 'report-why' }, t.why) : null,
      ]),
    ]));

    this.reportEl.appendChild(el('div', { class: 'report-card' }, [
      el('p', { class: 'eyebrow' }, 'Lab report'),
      el('h3', {}, 'You completed every task.'),
      el('p', { class: 'report-lede' },
        this.lab.report?.lede ||
        'The environment is now in the state it needed to be in. That state, not the commands you typed, is what the lab checked.'),
      el('ul', { class: 'report-list' }, rows),
      el('div', { class: 'report-next' }, [
        el('p', {}, this.lab.report?.next || 'Carry on to the next lab when you are ready.'),
        el('div', { class: 'report-actions' }, [
          el('button', { class: 'btn', type: 'button', onclick: () => this.reset() }, 'Run it again'),
        ]),
      ]),
    ]));
  }

  // ----------------------------------------------------------- environment

  renderEnvironment() {
    const env = this.lab.env || {};
    this.envEl.innerHTML = '';

    // The learner's files are shown in every environment that has any. A
    // build lab is useless if you cannot see the profile you are building.
    //
    // A terminal lab is the exception: in Lesson Zero the point is that you
    // explore with `ls` and `cat`, and an editor sitting there invites you to
    // type the answer instead of finding it. A terminal lab opts in with
    // env.showFiles.
    const wantsFiles =
      env.type === 'editor' ||
      env.type === 'build' ||
      (env.type === 'terminal' && env.showFiles === true);

    if (wantsFiles) {
      const files = Object.keys(env.files || {});
      if (files.length) {
        this.envEl.appendChild(el('p', { class: 'eyebrow' }, 'Your files'));
        this.envEl.appendChild(el('p', { class: 'env-lede' },
          env.filesPrompt ||
          (env.type === 'editor'
            ? 'These are the files this lab is about. Edit them; the tasks are checked ' +
              'against what they contain, not against how you got there.'
            : 'These are the files the build uses. Edit them, then build again.')));

        this.editorAreas = {};
        for (const path of files) {
          const area = el('textarea', {
            class: 'code-editor',
            spellcheck: 'false',
            'aria-label': path,
          });
          area.value = env.files[path];
          area.addEventListener('input', () => {
            this.editorFiles[path] = area.value;
            this.writeEditorFile(path, area.value);
            this.scheduleEvaluate();
          });
          this.editorAreas[path] = area;
          this.envEl.appendChild(el('div', { class: 'editor-wrap' }, [
            el('p', { class: 'editor-path' }, path),
            area,
          ]));
        }
      }
    }

    if (env.type === 'editor') {
      // A terminal as well, because writing a recipe and then trying to
      // build it is the whole point of a packaging lab.
      this.envEl.appendChild(el('p', { class: 'eyebrow' }, 'Terminal'));
      this.envEl.appendChild(el('p', { class: 'env-lede' },
        'Try what you have written. The files you edit above are the files this terminal sees.'));
      this.renderTerminalInto(this.envEl);
      return;
    }

    if (env.type === 'terminal') {
      this.envEl.appendChild(el('p', { class: 'eyebrow' }, 'Terminal'));
      this.envEl.appendChild(el('p', { class: 'env-lede' },
        env.prompt || 'A Linux machine to work on. The tasks are checked against the state of the machine, not against the commands you typed.'));
      this.renderTerminalInto(this.envEl);
      return;
    }

    if (env.type === 'build') {
      this.envEl.appendChild(el('p', { class: 'eyebrow' }, 'Build'));
      this.envEl.appendChild(el('p', { class: 'env-lede' },
        env.prompt || 'This lab builds a real image on a real machine.'));
      this.buildEl = el('div', { class: 'build-panel' });
      this.envEl.appendChild(this.buildEl);
      this.renderBuild();
      return;
    }

    this.envEl.appendChild(el('p', { class: 'env-lede' }, 'This lab has no environment. Read, think, answer.'));
  }

  /** The terminal widget, shared by the terminal and editor environments. */
  renderTerminalInto(container) {
    this.terminalEl = el('div', { class: 'terminal' });
    container.appendChild(this.terminalEl);

    const input = el('input', {
      class: 'terminal-input',
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': 'command',
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const command = input.value;
      input.value = '';
      this.runCommand(command);
    });
    container.appendChild(el('div', { class: 'terminal-bar' }, [
      el('span', { class: 'terminal-prompt' }, 'learner@academy:~$'),
      input,
    ]));
    this.renderTerminal();
  }

  writeEditorFile(path, content) {
    this.sim.writeFile(path, content);
  }

  runCommand(command) {
    const result = this.sim.run(command);
    this.terminalLines.push({ kind: 'input', text: command });
    if (result.stdout) this.terminalLines.push({ kind: 'stdout', text: result.stdout });
    if (result.stderr) this.terminalLines.push({ kind: 'stderr', text: result.stderr });
    this.renderTerminal();
    this.evaluate();
    if (this.opts.onEvent) this.opts.onEvent({ type: 'command', command, result });
  }

  renderTerminal() {
    if (!this.terminalEl) return;
    this.terminalEl.innerHTML = '';
    for (const line of this.terminalLines) {
      if (line.kind === 'input') {
        this.terminalEl.appendChild(el('div', { class: 'term-line term-input' },
          `learner@academy:~$ ${line.text}`));
      } else {
        this.terminalEl.appendChild(el('div', { class: `term-line term-${line.kind}` }, line.text));
      }
    }
    this.terminalEl.scrollTop = this.terminalEl.scrollHeight;
  }

  renderBuild() {
    if (!this.buildEl) return;
    const build = this.buildState || {};
    const state = build.status || 'idle';
    const project = connectedProject();

    const label = {
      idle: project
        ? 'Ready to build. Your image will be built from your own repository.'
        : 'Ready to build. This is the sandbox build — connect your GitLab to build for real.',
      queued: 'Your build is queued. Builds run in line, like a lab machine.',
      running: 'Building...',
      done: 'Done.',
      failed: 'The build failed.',
    }[state] || '';

    this.buildEl.innerHTML = '';
    this.buildEl.appendChild(el('p', { class: 'build-status' }, label));

    if (!project && state === 'idle') {
      this.buildEl.appendChild(el('div', { class: 'build-actions' }, [
        el('button', {
          class: 'btn btn-primary',
          type: 'button',
          onclick: () => startConnect(this.lab.id),
        }, 'Connect GitLab and build for real'),
      ]));
      this.buildEl.appendChild(el('p', { class: 'build-note' },
        'Connecting gives you your own repository on our GitLab, where the ' +
        'pipeline builds your flavour and publishes it as a release you can ' +
        'download. Until then, the sandbox build runs here and behaves the ' +
        'same way.'));
    }

    if (build.log) {
      this.buildEl.appendChild(el('pre', { class: 'build-log' }, build.log));
    }
    // The build button is always there, because the loop this lab teaches is
    // build, read the report, fix what it found, build again. A panel that
    // goes empty after the first build cannot teach that.
    if (state !== 'running' && state !== 'queued') {
      this.buildEl.appendChild(el('div', { class: 'build-actions' }, [
        el('button', {
          class: 'btn',
          type: 'button',
          onclick: () => this.startBuild(),
        }, state === 'idle' ? 'Start the sandbox build' : 'Build again'),
      ]));
    }
  }

  startBuild() {
    this.buildState = { status: 'running', log: '' };
    this.renderBuild();
    this.scheduleEvaluate();

    const ctx = {
      state: this.buildState,
      // The simulator, so a build lab can read the profile it is building.
      sim: this.sim,
      update: (patch) => {
        this.buildState = { ...this.buildState, ...patch };
        this.renderBuild();
        this.scheduleEvaluate();
      },
      finish: (result) => {
        this.sim.state.iso = result.iso || null;
        this.buildState = {
          status: 'done',
          log: result.log || '',
          iso: result.iso || null,
        };
        this.renderBuild();
        this.evaluate();
        if (this.opts.onEvent) this.opts.onEvent({ type: 'build', result });
      },
    };

    // A connected learner gets a real build: a pipeline on their own
    // repository, on our runner, publishing a release they can download.
    // Everyone else gets the sandbox build, which behaves the same way and is
    // labelled as what it is.
    const project = connectedProject();
    if (project) {
      runPipeline(project, {
        onState: (status) => ctx.update({ status }),
        onLog: (log) => ctx.update({ log }),
        onDone: (iso) => ctx.finish({ iso, log: this.buildState.log || '' }),
        onError: (message) => {
          ctx.update({ status: 'failed', log: (this.buildState.log || '') + '\n' + message });
        },
      });
      return;
    }

    // The sandbox build: the same sequence, driven here.
    if (typeof this.lab.onBuild === 'function') {
      this.lab.onBuild(ctx);
    }
  }

  // ------------------------------------------------------------- plumbing

  scheduleEvaluate() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.evaluate(), 120);
  }
}

// ------------------------------------------------------------------ DOM

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined) continue;
    if (key === 'onclick') node.addEventListener('click', value);
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export { checks };
