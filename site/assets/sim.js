/**
 * A deterministic virtual machine for the academy labs.
 *
 * The labs that teach pacman, git, devtools and PKGBUILDs run against this.
 * It is a simulation, and it is deliberately an honest one: it has a
 * filesystem, it has installed packages, it has a git repository, and the
 * commands change that state. It is not a real Linux, and it does not pretend
 * to be. The brief asks for simulation where simulation teaches the thing
 * honestly, and the real thing — a real Linux, a real build — comes later in
 * the build lab.
 *
 * The one rule this file exists to enforce: **checks look at state, never at
 * commands.** There is more than one right way to install a package, and a
 * learner who used a different one has still learned it.
 */

const PATH_SEP = '/';

/** Normalise a path relative to a working directory. */
export function resolvePath(cwd, path) {
  if (!path) return cwd;
  if (path.startsWith('/')) return path.replace(/\/+/g, PATH_SEP);
  const parts = (cwd + PATH_SEP + path).split(PATH_SEP).filter(Boolean);
  const out = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  return PATH_SEP + out.join(PATH_SEP);
}

/** The parent directory of a path. */
export function dirname(path) {
  const idx = path.lastIndexOf(PATH_SEP);
  if (idx <= 0) return PATH_SEP;
  return path.slice(0, idx);
}

/** The last component of a path. */
export function basename(path) {
  const idx = path.lastIndexOf(PATH_SEP);
  return idx < 0 ? path : path.slice(idx + 1);
}

export class Sim {
  /**
   * @param {Object} [options]
   * @param {Object} [options.files]     initial files, keyed by absolute path
   * @param {string[]} [options.packages] initially installed packages
   * @param {Object} [options.state]     arbitrary facts the labs assert on
   */
  constructor(options = {}) {
    this.fs = new Map();
    this.state = {
      packages: new Set(options.packages || []),
      installed: new Set(options.packages || []),
      // Facts a lab asserts on that are not packages or files.
      repos: {},
      git: {},
      built: {},
      ...(options.state || {}),
    };
    this.cwd = options.cwd || '/home/learner';
    this.history = [];
    this.env = { HOME: '/home/learner', USER: 'learner', ...(options.env || {}) };

    // A home to be in, so `cd ~` works and relative paths behave.
    this.mkdirp('/home/learner');
    this.mkdirp('/tmp');
    this.mkdirp('/var/lib/pacman');
    this.mkdirp('/etc');

    for (const [path, content] of Object.entries(options.files || {})) {
      this.writeFile(path, content);
    }
  }

  // ---------------------------------------------------------------- files

  /** Write a file, creating parent directories as needed. */
  writeFile(path, content = '', mode = '644') {
    const full = resolvePath(this.cwd, path);
    this.mkdirp(dirname(full));
    this.fs.set(full, { content: String(content), mode });
    return full;
  }

  /** Remove a file. Returns true if it existed. */
  removeFile(path) {
    const full = resolvePath(this.cwd, path);
    return this.fs.delete(full);
  }

  /** Read a file's contents, or null if it does not exist. */
  readFile(path) {
    const full = resolvePath(this.cwd, path);
    const entry = this.fs.get(full);
    return entry ? entry.content : null;
  }

  /** The mode of a file, e.g. '644'. */
  fileMode(path) {
    const full = resolvePath(this.cwd, path);
    const entry = this.fs.get(full);
    return entry ? entry.mode : null;
  }

  /** Create a directory. */
  mkdirp(path) {
    const full = resolvePath(this.cwd, path);
    const parts = full.split(PATH_SEP).filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += PATH_SEP + part;
      if (!this.fs.has(current)) {
        this.fs.set(current, { content: null, mode: '755', dir: true });
      }
    }
    return full;
  }

  /** List a directory's entries. */
  listDir(path) {
    const full = resolvePath(this.cwd, path);
    const prefix = full === PATH_SEP ? PATH_SEP : full + PATH_SEP;
    const out = new Map();
    for (const [p, entry] of this.fs) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      if (!rest) continue;
      const name = rest.split(PATH_SEP)[0];
      if (!out.has(name)) {
        out.set(name, { name, dir: rest.includes(PATH_SEP) });
      }
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every file path in the filesystem, sorted. */
  allFiles() {
    return [...this.fs.entries()]
      .filter(([, e]) => !e.dir)
      .map(([p]) => p)
      .sort();
  }

  // -------------------------------------------------------------- commands

  /**
   * Run a command line. Returns {stdout, stderr, code}.
   * Never throws: a command that fails is a command that failed, and the
   * learner should see the error, not a broken lab.
   */
  run(input) {
    const line = String(input || '').trim();
    if (!line) return { stdout: '', stderr: '', code: 0 };

    this.history.push(line);

    // Handle chained commands, the way a shell does.
    const segments = splitOnOperators(line);
    let stdout = '';
    let stderr = '';
    let code = 0;
    for (const segment of segments) {
      const result = this.runOne(segment.text, segment.redirect);
      stdout += result.stdout;
      stderr += result.stderr;
      code = result.code;
      if (result.stop) break;
    }
    return { stdout, stderr, code };
  }

  runOne(text, redirect) {
    const tokens = tokenize(text);
    if (!tokens.length) return { stdout: '', stderr: '', code: 0 };

    const command = tokens[0];
    const handler = this.handlers[command];
    if (!handler) {
      return {
        stdout: '',
        stderr: `${command}: command not found\n`,
        code: 127,
      };
    }

    let result;
    try {
      result = handler.call(this, tokens.slice(1));
    } catch (err) {
      result = { stdout: '', stderr: `${command}: ${err.message}\n`, code: 1 };
    }

    if (redirect) {
      const { mode, target } = redirect;
      if (mode === '>>') {
        const existing = this.readFile(target) || '';
        this.writeFile(target, existing + result.stdout);
      } else {
        this.writeFile(target, result.stdout);
      }
      result.stdout = '';
    }
    return result;
  }

  // ------------------------------------------------------------- handlers

  get handlers() {
    if (!this._handlers) this._handlers = buildHandlers();
    return this._handlers;
  }
}

// --------------------------------------------------------------- helpers

/** Split a command line on ;, && and ||, keeping the operators. */
function splitOnOperators(line) {
  const segments = [];
  let current = '';
  let operator = null;
  let i = 0;
  while (i < line.length) {
    const two = line.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      segments.push({ text: current, redirect: null, operator });
      current = '';
      operator = two;
      i += 2;
      continue;
    }
    const ch = line[i];
    if (ch === ';') {
      segments.push({ text: current, redirect: null, operator });
      current = '';
      operator = null;
      i += 1;
      continue;
    }
    if (ch === '>' && line[i + 1] === '>') {
      current += ' >> ';
      i += 2;
      continue;
    }
    if (ch === '>') {
      current += ' > ';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  segments.push({ text: current, redirect: null, operator });
  return segments.map((s) => {
    const { text, redirect } = extractRedirect(s.text);
    return { ...s, text, redirect };
  });
}

/** Pull a trailing `> file` or `>> file` out of a command. */
function extractRedirect(text) {
  const match = text.match(/\s(>>?)\s*(\S+)\s*$/);
  if (!match) return { text, redirect: null };
  // The redirect has to come off the command text, or the target ends up as
  // an ordinary argument — `echo hello > f` would write "hello > f" into f.
  return {
    text: text.slice(0, match.index).trim(),
    redirect: { mode: match[1], target: match[2] },
  };
}

/** Split a command line into words, honouring quotes. */
export function tokenize(text) {
  const out = [];
  let current = '';
  let quote = null;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (/\s/.test(ch)) {
      if (current) { out.push(current); current = ''; }
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

/** Parse a PKGBUILD-ish key/value assignment out of shell text. */
export function parseAssignments(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[match[1]] = value;
    }
  }
  return out;
}

/** Parse a shell-style array assignment, e.g. `depends=(a b c)`. */
export function parseArray(text, key) {
  const match = String(text || '').match(
    new RegExp(`^\\s*${key}\\s*=\\s*\\(([^)]*)\\)`, 'm')
  );
  if (!match) return [];
  return match[1]
    .split(/\s+/)
    .map((s) => s.replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

// ---------------------------------------------------------------- commands

function buildHandlers() {
  return {
    // --- filesystem
    ls(args) {
      const flags = args.filter((a) => a.startsWith('-')).join('');
      const paths = args.filter((a) => !a.startsWith('-'));
      const targets = paths.length ? paths : ['.'];
      let out = '';
      for (const target of targets) {
        const full = resolvePath(this.cwd, target);
        if (this.fs.has(full) && !this.fs.get(full).dir) {
          out += full + '\n';
          continue;
        }
        const entries = this.listDir(target);
        if (!entries.length && !this.fs.has(full)) {
          return { stdout: '', stderr: `ls: cannot access '${target}': No such file or directory\n`, code: 2 };
        }
        if (flags.includes('l')) {
          for (const e of entries) {
            out += `${e.dir ? 'd' : '-'}rw-r--r--  1 learner learner  0 Jan  1 00:00 ${e.name}\n`;
          }
        } else {
          out += entries.map((e) => e.name).join('  ') + '\n';
        }
      }
      return { stdout: out, stderr: '', code: 0 };
    },

    cat(args) {
      let out = '';
      for (const arg of args.filter((a) => !a.startsWith('-'))) {
        const content = this.readFile(arg);
        if (content === null) {
          return { stdout: out, stderr: `cat: ${arg}: No such file or directory\n`, code: 1 };
        }
        out += content;
        if (!out.endsWith('\n')) out += '\n';
      }
      return { stdout: out, stderr: '', code: 0 };
    },

    echo(args) {
      return { stdout: args.join(' ') + '\n', stderr: '', code: 0 };
    },

    printf(args) {
      const format = (args[0] || '').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      return { stdout: format + args.slice(1).join(' '), stderr: '', code: 0 };
    },

    pwd() {
      return { stdout: this.cwd + '\n', stderr: '', code: 0 };
    },

    cd(args) {
      const target = args[0] || '~';
      let full = resolvePath(this.cwd, target === '~' ? this.env.HOME : target);
      if (!this.fs.has(full)) {
        return { stdout: '', stderr: `cd: ${target}: No such file or directory\n`, code: 1 };
      }
      if (!this.fs.get(full).dir) {
        return { stdout: '', stderr: `cd: ${target}: Not a directory\n`, code: 1 };
      }
      this.cwd = full;
      return { stdout: '', stderr: '', code: 0 };
    },

    mkdir(args) {
      const dirs = args.filter((a) => !a.startsWith('-'));
      for (const dir of dirs) this.mkdirp(dir);
      return { stdout: '', stderr: '', code: 0 };
    },

    touch(args) {
      for (const arg of args.filter((a) => !a.startsWith('-'))) {
        if (this.readFile(arg) === null) this.writeFile(arg, '');
      }
      return { stdout: '', stderr: '', code: 0 };
    },

    rm(args) {
      const targets = args.filter((a) => !a.startsWith('-'));
      for (const target of targets) {
        this.removeFile(resolvePath(this.cwd, target));
      }
      return { stdout: '', stderr: '', code: 0 };
    },

    cp(args) {
      const files = args.filter((a) => !a.startsWith('-'));
      if (files.length < 2) return { stdout: '', stderr: 'cp: missing operand\n', code: 1 };
      const content = this.readFile(files[0]);
      if (content === null) {
        return { stdout: '', stderr: `cp: cannot stat '${files[0]}': No such file or directory\n`, code: 1 };
      }
      this.writeFile(files[1], content);
      return { stdout: '', stderr: '', code: 0 };
    },

    mv(args) {
      const files = args.filter((a) => !a.startsWith('-'));
      if (files.length < 2) return { stdout: '', stderr: 'mv: missing operand\n', code: 1 };
      const content = this.readFile(files[0]);
      if (content === null) {
        return { stdout: '', stderr: `mv: cannot stat '${files[0]}': No such file or directory\n`, code: 1 };
      }
      this.writeFile(files[1], content);
      this.removeFile(files[0]);
      return { stdout: '', stderr: '', code: 0 };
    },

    head(args) {
      const n = args.includes('-n') ? Number(args[args.indexOf('-n') + 1]) : 10;
      const file = args.filter((a) => !a.startsWith('-') && !/^\d+$/.test(a) && a !== String(n))[0];
      const content = this.readFile(file);
      if (content === null) return { stdout: '', stderr: `head: ${file}: No such file or directory\n`, code: 1 };
      return { stdout: content.split('\n').slice(0, n).join('\n') + '\n', stderr: '', code: 0 };
    },

    tail(args) {
      const n = args.includes('-n') ? Number(args[args.indexOf('-n') + 1]) : 10;
      const file = args.filter((a) => !a.startsWith('-') && a !== String(n))[0];
      const content = this.readFile(file);
      if (content === null) return { stdout: '', stderr: `tail: ${file}: No such file or directory\n`, code: 1 };
      const lines = content.split('\n');
      return { stdout: lines.slice(Math.max(0, lines.length - 1 - n)).join('\n') + '\n', stderr: '', code: 0 };
    },

    wc(args) {
      const file = args.filter((a) => !a.startsWith('-'))[0];
      const content = this.readFile(file);
      if (content === null) return { stdout: '', stderr: `wc: ${file}: No such file or directory\n`, code: 1 };
      const lines = content.split('\n').length - 1;
      const words = content.split(/\s+/).filter(Boolean).length;
      return { stdout: `${lines} ${words} ${content.length} ${file}\n`, stderr: '', code: 0 };
    },

    grep(args) {
      const flags = args.filter((a) => a.startsWith('-'));
      const rest = args.filter((a) => !a.startsWith('-'));
      const pattern = rest[0];
      const file = rest[1];
      const content = this.readFile(file);
      if (content === null) return { stdout: '', stderr: `grep: ${file}: No such file or directory\n`, code: 2 };
      const invert = flags.includes('-v');
      const ignoreCase = flags.includes('-i');
      let re;
      try {
        re = new RegExp(pattern, ignoreCase ? 'i' : '');
      } catch {
        return { stdout: '', stderr: `grep: invalid pattern\n`, code: 2 };
      }
      const matches = content
        .split('\n')
        .filter((line) => (re.test(line) !== invert));
      return {
        stdout: matches.length ? matches.join('\n') + '\n' : '',
        stderr: '',
        code: matches.length ? 0 : 1,
      };
    },

    sed(args) {
      // Supports: sed -i 's/A/B/g' file
      const inPlace = args.includes('-i');
      const script = args.find((a) => !a.startsWith('-') && a.includes('s/'));
      const file = args.filter((a) => !a.startsWith('-') && a !== script)[0];
      if (!script || !file) return { stdout: '', stderr: 'sed: missing arguments\n', code: 1 };
      const content = this.readFile(file);
      if (content === null) return { stdout: '', stderr: `sed: ${file}: No such file or directory\n`, code: 1 };
      const m = script.match(/s(.)(.*?[^\\])\1(.*?)\1([gi]*)/);
      if (!m) return { stdout: '', stderr: 'sed: invalid expression\n', code: 1 };
      let re;
      try {
        re = new RegExp(m[2], m[4].includes('g') ? 'g' : '');
      } catch {
        return { stdout: '', stderr: 'sed: invalid expression\n', code: 1 };
      }
      const result = content.replace(re, m[3]);
      if (inPlace) {
        this.writeFile(file, result);
        return { stdout: '', stderr: '', code: 0 };
      }
      return { stdout: result, stderr: '', code: 0 };
    },

    find(args) {
      const pathArg = args[0] || '.';
      const nameIdx = args.indexOf('-name');
      const pattern = nameIdx >= 0 ? args[nameIdx + 1] : '*';
      const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      const matches = this.allFiles().filter((p) => re.test(basename(p)));
      return { stdout: matches.join('\n') + (matches.length ? '\n' : ''), stderr: '', code: 0 };
    },

    which(args) {
      const known = ['pacman', 'git', 'makepkg', 'pkgctl', 'yay', 'paru', 'sudo', 'man', 'uname', 'curl'];
      const out = [];
      for (const arg of args) {
        if (known.includes(arg)) out.push(`/usr/bin/${arg}`);
        else return { stdout: '', stderr: '', code: 1 };
      }
      return { stdout: out.join('\n') + '\n', stderr: '', code: 0 };
    },

    uname(args) {
      if (args.includes('-a')) {
        return { stdout: 'Linux academy-vm 6.9.1-arch1-1 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n', stderr: '', code: 0 };
      }
      return { stdout: 'Linux\n', stderr: '', code: 0 };
    },

    // --- package management
    pacman(args) {
      const sub = args[0];
      const rest = args.slice(1);
      const installed = this.state.packages;

      if (sub === '-Sy') {
        // Synchronise the package databases and nothing else.
        return {
          stdout: ':: Synchronizing package databases...\ncore is up to date\nextra is up to date\n',
          stderr: '',
          code: 0,
        };
      }

      if (sub === '-Syu' || sub === '-Syyu' || sub === '-Sua') {
        // A full upgrade. With no package named, this is the whole system.
        const names = rest.filter((a) => !a.startsWith('-'));
        let out = ':: Synchronizing package databases...\ncore is up to date\nextra is up to date\n';
        if (!names.length) {
          out += ':: Starting full system upgrade...\nresolving dependencies...\nlooking for conflicting packages...\n';
          out += ' there is nothing to upgrade\n';
          out += '\nTotal Installed Size:  0.00 B\n';
          return { stdout: out, stderr: '', code: 0 };
        }
        return this.handlers.pacman.call(this, ['-S', ...rest]);
      }

      if (sub === '-S') {
        const names = rest.filter((a) => !a.startsWith('-'));
        if (!names.length) {
          return {
            stdout: '',
            stderr: 'error: no targets specified (use -h for help)\n',
            code: 1,
          };
        }
        let out = '';
        for (const name of names) {
          if (!this.knownPackage(name)) {
            return {
              stdout: out,
              stderr: `error: package '${name}' was not found\nerror: failed to prepare transaction (invalid target)\n`,
              code: 1,
            };
          }
          out += `resolving dependencies...\nlooking for conflicting packages...\n`;
          installed.add(name);
          this.state.installed.add(name);
          out += `installing ${name} ...\n`;
        }
        out += '\nTotal Installed Size:  12.34 MiB\n';
        return { stdout: out, stderr: '', code: 0 };
      }

      if (sub === '-Ss' || sub === '-S') {
        const term = rest.join(' ');
        const hits = this.packageIndex().filter((p) =>
          !term || p.name.includes(term) || p.desc.toLowerCase().includes(term.toLowerCase())
        );
        if (!hits.length) {
          return { stdout: '', stderr: `no results found for '${term}'\n`, code: 1 };
        }
        return {
          stdout: hits.map((p) => `core/${p.name} ${p.version}\n    ${p.desc}`).join('\n') + '\n',
          stderr: '',
          code: 0,
        };
      }

      if (sub === '-Qi') {
        const name = rest[0];
        const pkg = this.packageIndex().find((p) => p.name === name);
        if (!pkg) return { stdout: '', stderr: `error: package '${name}' was not found\n`, code: 1 };
        return {
          stdout: [
            `Name            : ${pkg.name}`,
            `Version         : ${pkg.version}`,
            `Description     : ${pkg.desc}`,
            `Architecture    : ${pkg.arch}`,
            `Repository      : ${pkg.repo}`,
            `Installed Size  : ${pkg.size}`,
            `Groups          : None`,
            `Provides        : None`,
            `Depends On      : ${pkg.deps.join('  ')}`,
            `Required By     : None`,
            `Optional For    : None`,
            `Conflicts With  : None`,
            `Replaces        : None`,
            `Installed Size  : ${pkg.size}`,
            `Packager        : ${pkg.packager}`,
            `Build Date      : Tue 01 Jan 2025 00:00:00 +0000`,
            `Install Date    : Tue 01 Jan 2025 00:00:00 +0000`,
            `Install Reason  : Explicitly installed`,
            `Install Script  : No`,
            `Validated By    : ${pkg.packager}`,
          ].join('\n') + '\n',
          stderr: '',
          code: 0,
        };
      }

      if (sub === '-Q') {
        const names = rest.filter((a) => !a.startsWith('-'));
        if (!names.length) {
          return { stdout: [...installed].sort().join('\n') + '\n', stderr: '', code: 0 };
        }
        let out = '';
        for (const name of names) {
          if (!installed.has(name)) {
            return { stdout: out, stderr: `error: package '${name}' was not found\n`, code: 1 };
          }
          out += `${name}\n`;
        }
        return { stdout: out, stderr: '', code: 0 };
      }

      if (sub === '-R' || sub === '-Rs') {
        const names = rest.filter((a) => !a.startsWith('-'));
        let out = '';
        for (const name of names) {
          if (!installed.has(name)) {
            return { stdout: out, stderr: `error: package '${name}' was not found\n`, code: 1 };
          }
          installed.delete(name);
          this.state.installed.delete(name);
          out += `removing ${name} ...\n`;
        }
        return { stdout: out, stderr: '', code: 0 };
      }

      if (sub === '-Sy') {
        return { stdout: ':: Synchronizing package databases...\ncore is up to date\nextra is up to date\n', stderr: '', code: 0 };
      }

      return { stdout: '', stderr: `pacman: invalid option '${sub}'\n`, code: 1 };
    },

    // --- git
    git(args) {
      const sub = args[0];
      const repo = this.state.git;

      if (sub === 'init') {
        repo.initialised = true;
        repo.staged = new Set();
        repo.committed = [];
        repo.config = { ...(repo.config || {}) };
        return { stdout: 'Initialized empty Git repository in /home/learner/.git/\n', stderr: '', code: 0 };
      }

      if (!repo.initialised && sub !== 'clone') {
        return {
          stdout: '',
          stderr: 'fatal: not a git repository (or any of the parent directories): .git\n',
          code: 128,
        };
      }

      if (sub === 'status') {
        const lines = ['On branch ' + (repo.branch || 'main')];

        const staged = [...(repo.staged || [])];
        if (staged.length) {
          lines.push('', 'Changes to be committed:');
          for (const f of staged) {
            lines.push(`\tmodified:   ${f}`);
          }
        }

        const unstaged = this.unstagedChanges(repo);
        const modified = unstaged.modified || [];
        const untracked = unstaged.untracked || [];

        if (modified.length) {
          lines.push('', 'Changes not staged for commit:');
          for (const f of modified) {
            lines.push(`\tmodified:   ${f}`);
          }
        }
        if (untracked.length) {
          lines.push('', 'Untracked files:');
          for (const f of untracked) {
            lines.push(`\t${f}`);
          }
          lines.push('', 'no changes added to commit (use "git add" and/or "git commit -a")');
        }
        if (!staged.length && !modified.length && !untracked.length) {
          lines.push('nothing to commit, working tree clean');
        }

        return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
      }

      if (sub === 'add') {
        const files = args.slice(1).filter((a) => !a.startsWith('-'));
        for (const f of files) {
          if (f === '.') {
            for (const p of this.allFiles()) repo.staged.add(p.replace(/^\/home\/learner\//, ''));
          } else {
            repo.staged.add(f.replace(/^\//, ''));
          }
        }
        return { stdout: '', stderr: '', code: 0 };
      }

      if (sub === 'commit') {
        if (!repo.staged || !repo.staged.size) {
          return { stdout: '', stderr: 'nothing to commit, working tree clean\n', code: 1 };
        }
        // Git refuses to commit without an identity, and says so plainly.
        // This is one of the most common first-time errors there is, so the
        // simulator reproduces it rather than quietly succeeding.
        const config = repo.config || {};
        if (!config['user.name'] || !config['user.email']) {
          return {
            stdout: '',
            stderr:
              'Author identity unknown\n\n' +
              '*** Please tell me who you are.\n\n' +
              'Run\n\n' +
              '  git config --global user.email "you@example.com"\n' +
              '  git config --global user.name "Your Name"\n\n' +
              'to set your account\'s default identity.\n' +
              'Omit --global to set the identity only in this repository.\n',
            code: 128,
          };
        }
        const message = (args.find((a) => a.startsWith('-m')) && args[args.indexOf('-m') + 1]) || 'commit';
        const files = [...repo.staged];
        const contents = {};
        for (const f of files) {
          const content = this.readFile(f);
          if (content !== null) contents[f] = content;
        }
        repo.committed.push({ message, files, contents });
        repo.staged = new Set();
        return {
          stdout: `[${repo.committed.length} (root-commit) ${config['user.name']}] ${message}\n 1 file changed, 1 insertion(+)\n`,
          stderr: '',
          code: 0,
        };
      }

      if (sub === 'reset') {
        // Un-stage. `git reset` with no arguments unstages everything;
        // `git reset <file>` unstages one file.
        const files = args.slice(1).filter((a) => !a.startsWith('-'));
        if (!repo.staged) repo.staged = new Set();
        if (!files.length) {
          repo.staged = new Set();
          return { stdout: 'Unstaged changes after reset:\n', stderr: '', code: 0 };
        }
        for (const f of files) repo.staged.delete(f.replace(/^\//, ''));
        return { stdout: 'Unstaged changes after reset:\n', stderr: '', code: 0 };
      }

      if (sub === 'restore' || sub === 'checkout') {
        // Put a file back the way the last commit left it.
        const files = args.slice(1).filter((a) => !a.startsWith('-'));
        const last = repo.committed && repo.committed.length
          ? repo.committed[repo.committed.length - 1]
          : null;
        if (!last || !last.contents) {
          return { stdout: '', stderr: `error: pathspec did not match any file(s) known to git\n`, code: 1 };
        }
        for (const f of files) {
          const key = f.replace(/^\//, '');
          if (key in last.contents) this.writeFile(key, last.contents[key]);
        }
        return { stdout: '', stderr: '', code: 0 };
      }

      if (sub === 'log') {
        if (!repo.committed.length) {
          return { stdout: '', stderr: "fatal: your current branch 'main' does not have any commits yet\n", code: 128 };
        }
        const out = repo.committed
          .slice()
          .reverse()
          .map((c, i) => `commit ${String(c.hash || 'abc123').slice(0, 7)}\nAuthor: learner <learner@example.com>\nDate:   Tue Jan 1 00:00:00 2025 +0000\n\n    ${c.message}\n`);
        return { stdout: out.join('\n') + '\n', stderr: '', code: 0 };
      }

      if (sub === 'config') {
        const key = args[1];
        const value = args[2];
        if (!key) return { stdout: '', stderr: 'error: no config key given\n', code: 1 };
        repo.config = repo.config || {};
        if (value === undefined) {
          const out = repo.config[key];
          return out
            ? { stdout: out + '\n', stderr: '', code: 0 }
            : { stdout: '', stderr: '', code: 1 };
        }
        repo.config[key] = value;
        return { stdout: '', stderr: '', code: 0 };
      }

      if (sub === 'branch') {
        const name = args[1];
        if (!name) return { stdout: (repo.branch || 'main') + '\n', stderr: '', code: 0 };
        repo.branch = name;
        return { stdout: "Switched to a new branch '" + name + "'\n", stderr: '', code: 0 };
      }

      if (sub === 'clone') {
        const url = args[0];
        repo.initialised = true;
        repo.staged = new Set();
        repo.committed = [];
        repo.clonedFrom = url;
        this.mkdirp('/home/learner/' + basename(url || 'repo').replace(/\.git$/, ''));
        return { stdout: `Cloning into '${basename(url || 'repo')}'...\ndone.\n`, stderr: '', code: 0 };
      }

      return { stdout: '', stderr: `git: '${sub}' is not a git command\n`, code: 1 };
    },

    // --- packaging
    makepkg(args) {
      const pkgbuild = this.readFile('PKGBUILD') || this.readFile('PKGBUILD') || '';
      if (!pkgbuild) {
        return {
          stdout: '',
          stderr: '==> ERROR: PKGBUILD does not exist.\n==> ERROR: Skipping build.\n',
          code: 1,
        };
      }
      const assignments = parseAssignments(pkgbuild);
      const name = assignments.pkgname || 'unknown';
      const version = assignments.pkgver || '0';
      // arch is an array in a real recipe: arch=('any')
      const archArray = parseArray(pkgbuild, 'arch');
      const arch = archArray.length ? archArray[0] : (assignments.arch || 'x86_64');
      const missing = [];
      for (const dep of parseArray(pkgbuild, 'depends')) {
        if (!this.state.packages.has(dep)) missing.push(dep);
      }
      if (missing.length) {
        return {
          stdout: `==> ERROR: 'makepkg' was unable to satisfy dependencies and will not continue.\n==> ERROR: Missing dependency '${missing[0]}'\n`,
          stderr: '',
          code: 1,
        };
      }
      const pkg = `${name}-${version}-${arch}.pkg.tar.zst`;
      this.state.built[pkg] = { name, version, arch, source: 'local', tool: 'makepkg' };
      return {
        stdout: `==> Making package: ${name} ${version}-1\n==> Checking dependencies... OK\n==> Starting build... OK\n==> Installing package in build root... OK\n==> Creating package... OK\n==> Finished making: ${name}-${version}-${arch}.pkg.tar.zst\n`,
        stderr: '',
        code: 0,
      };
    },

    pkgctl(args) {
      const sub = args[0];
      if (sub === 'build') {
        const result = this.handlers.makepkg.call(this, args.slice(1));
        // pkgctl is the front door to devtools. The build it drives is the
        // same build, but knowing which door it came through is useful.
        const built = Object.keys(this.state.built);
        if (result.code === 0 && built.length) {
          const pkg = this.state.built[built[built.length - 1]];
          pkg.tool = 'pkgctl';
        }
        return result;
      }
      if (sub === 'repo') {
        return { stdout: 'no repo subcommands available\n', stderr: '', code: 1 };
      }
      return { stdout: '', stderr: `pkgctl: '${sub}' is not a command\n`, code: 1 };
    },

    // --- AUR helpers
    yay(args) {
      const sub = args[0];
      if (sub === '-S' || sub === '-Ss' || sub === '-Y') {
        const term = args.slice(1).filter((a) => !a.startsWith('-')).join(' ');
        const hits = this.aurIndex().filter((p) =>
          !term || p.name.includes(term) || p.desc.toLowerCase().includes(term.toLowerCase())
        );
        if (!hits.length) {
          return { stdout: '', stderr: `error: Failed to look up '${term}' in AUR\n`, code: 1 };
        }
        if (sub === '-Ss') {
          return {
            stdout: hits.map((p) => `aur/${p.name} ${p.version}\n    ${p.desc}`).join('\n') + '\n',
            stderr: '',
            code: 0,
          };
        }
        // A helper downloads the recipe first, so you can read it, and then
        // builds it. The recipe is left on disk and the package ends up
        // installed, so the state says what happened.
        let out = '';
        for (const p of hits) {
          out += `==> Downloading PKGBUILD: ${p.name}\n`;
          this.writeFile(`PKGBUILD.${p.name}`, aurPkgbuild(p));
          out += `==> Reviewing PKGBUILD: ${p.name}\n`;
          out += `==> Building ${p.name}...\n`;
          out += `==> Installing ${p.name}... Done\n`;
          this.state.packages.add(p.name);
          this.state.installed.add(p.name);
          this.state.aur = this.state.aur || { installed: [] };
          if (!this.state.aur.installed.includes(p.name)) {
            this.state.aur.installed.push(p.name);
          }
        }
        return { stdout: out, stderr: '', code: 0 };
      }
      return { stdout: '', stderr: `yay: '${sub}' is not a yay command\n`, code: 1 };
    },

    paru(args) {
      return this.handlers.yay.call(this, args);
    },

    // --- misc
    sudo(args) {
      if (!args.length) {
        return { stdout: '', stderr: 'sudo: a terminal is required to read the password\n', code: 1 };
      }
      const handler = this.handlers[args[0]];
      if (!handler) return { stdout: '', stderr: `sudo: ${args[0]}: command not found\n`, code: 1 };
      return handler.call(this, args.slice(1));
    },

    man(args) {
      const topic = (args[0] || '').replace(/^\/usr\/share\/man\/man\d\//, '');
      const pages = this.manPages()[topic];
      if (!pages) {
        return { stdout: '', stderr: `No manual entry for ${topic}\n`, code: 0 };
      }
      return { stdout: pages, stderr: '', code: 0 };
    },

    curl(args) {
      return {
        stdout: 'curl: (6) Could not resolve host in the academy sandbox\n',
        stderr: '',
        code: 6,
      };
    },

    true() { return { stdout: '', stderr: '', code: 0 }; },
    false() { return { stdout: '', stderr: '', code: 1 }; },
  };
}

// ------------------------------------------------------------ package data

const CORE_PACKAGES = [
  { name: 'base', version: '1-1', desc: 'Minimal package set with a basic system', arch: 'any', repo: 'core', deps: [], size: '0.00 B', packager: 'Jan Alexander' },
  { name: 'linux', version: '6.9.1.arch1-1', desc: 'The Linux kernel and modules', arch: 'x86_64', repo: 'core', deps: [], size: '130.00 MiB', packager: 'Jan Alexander' },
  { name: 'linux-lts', version: '6.6.20.arch1-1', desc: 'The Linux kernel and modules (longterm)', arch: 'x86_64', repo: 'core', deps: [], size: '125.00 MiB', packager: 'Jan Alexander' },
  { name: 'mkinitcpio', version: '37-1', desc: 'Tools for generating an initial ramdisk environment', arch: 'x86_64', repo: 'core', deps: ['kmod', 'zstd'], size: '0.20 MiB', packager: 'Jan Alexander' },
  { name: 'mkinitcpio-archiso', version: '73-1', desc: 'Initcpio scripts used by archiso', arch: 'any', repo: 'extra', deps: ['mkinitcpio'], size: '0.01 MiB', packager: 'Jan Alexander' },
  { name: 'arch-install-scripts', version: '32-1', desc: 'Scripts for installing Arch Linux', arch: 'any', repo: 'extra', deps: ['pacman'], size: '0.05 MiB', packager: 'Jan Alexander' },
  { name: 'grub', version: '2:2.12-1', desc: 'GNU GRUB boot loader', arch: 'x86_64', repo: 'extra', deps: [], size: '12.00 MiB', packager: 'Jan Alexander' },
  { name: 'syslinux', version: '6.04-4', desc: 'Bootloader for x86 systems', arch: 'any', repo: 'extra', deps: [], size: '4.00 MiB', packager: 'Jan Alexander' },
  { name: 'git', version: '2.44.1-1', desc: 'Distributed version control system', arch: 'x86_64', repo: 'extra', deps: [], size: '9.00 MiB', packager: 'Jan Alexander' },
  { name: 'nano', version: '8.0-1', desc: 'A small and friendly text editor', arch: 'x86_64', repo: 'core', deps: [], size: '0.90 MiB', packager: 'Jan Alexander' },
  { name: 'vim', version: '9.1.0-1', desc: 'Vi Improved, a highly configurable text editor', arch: 'x86_64', repo: 'extra', deps: [], size: '3.50 MiB', packager: 'Jan Alexander' },
  { name: 'devtools', version: '1.0.26-1', desc: 'Tools for building Arch Linux packages', arch: 'any', repo: 'extra', deps: [], size: '1.20 MiB', packager: 'Jan Alexander' },
  { name: 'pkgconf', version: '2.3.0-1', desc: 'Tool for querying and modifying pkg-config files', arch: 'x86_64', repo: 'core', deps: [], size: '0.30 MiB', packager: 'Jan Alexander' },
  { name: 'openssl', version: '3.3.1-1', desc: 'Toolkit for Transport Layer Security and Cryptography', arch: 'x86_64', repo: 'core', deps: [], size: '6.00 MiB', packager: 'Jan Alexander' },
  { name: 'curl', version: '8.8.0-1', desc: 'A utility for transferring data with URLs', arch: 'x86_64', repo: 'core', deps: [], size: '2.00 MiB', packager: 'Jan Alexander' },
  { name: 'qemu-desktop', version: '8.2.2-1', desc: 'Qemu desktop GUI', arch: 'x86_64', repo: 'extra', deps: [], size: '180.00 MiB', packager: 'Jan Alexander' },
  { name: 'bash', version: '5.2.026-1', desc: 'The GNU Bourne Again shell', arch: 'x86_64', repo: 'core', deps: [], size: '1.80 MiB', packager: 'Jan Alexander' },
  { name: 'systemd', version: '255.3-1', desc: 'System and service manager', arch: 'x86_64', repo: 'core', deps: [], size: '22.00 MiB', packager: 'Jan Alexander' },
];

const AUR_PACKAGES = [
  { name: 'yay', version: '12.3.5-1', desc: 'Yet another yogurt. Pacman wrapper and AUR helper', arch: 'any' },
  { name: 'paru', version: '2.0.4-1', desc: 'Feature packed AUR helper and pacman wrapper', arch: 'any' },
  { name: 'ttf-jetbrains-mono', version: '2.304-1', desc: 'JetBrains Mono font', arch: 'any' },
  { name: 'spotify-tui', version: '0.27.0-1', desc: 'A Spotify client for the terminal', arch: 'x86_64' },
  { name: 'pikaur', version: '1.0.6-1', desc: 'A minimal AUR helper', arch: 'any' },
];

/** The recipe an AUR helper downloads, so the learner can read it. */
function aurPkgbuild(pkg) {
  return `# Maintainer: Somebody <somebody@example.com>
pkgname=${pkg.name}
pkgver=${pkg.version}
pkgrel=1
pkgdesc="${pkg.desc}"
arch=('${pkg.arch}')
url="https://aur.archlinux.org/packages/${pkg.name}"
license=('MIT')
depends=()
optdepends=()
source=("https://aur.archlinux.org/packages/${pkg.name}/${pkg.name}-${pkg.version}.tar.gz")
sha256sums=('SKIP')

build() {
  cd "$pkgname-$pkgver"
  make
}

package() {
  cd "$pkgname-$pkgver"
  install -Dm755 "$pkgname" "$pkgdir/usr/bin/$pkgname"
}
`;
}

Sim.prototype.packageIndex = function packageIndex() {
  return CORE_PACKAGES;
};

/**
 * The files that have changed on disk since the last commit.
 *
 * Git distinguishes three things, and the academy teaches the difference:
 * a file that is *staged* (you have told git about it), a file that is
 * *modified* (it differs from the last commit and git does not know yet),
 * and a file that is *untracked* (git has never heard of it).
 */
Sim.prototype.unstagedChanges = function unstagedChanges(repo) {
  const home = (this.env.HOME || '/home/learner') + '/';
  const last = repo && repo.committed && repo.committed.length
    ? repo.committed[repo.committed.length - 1]
    : null;
  if (!last || !last.contents) return [];

  const modified = [];
  const untracked = [];
  for (const [path, entry] of this.fs) {
    if (entry.dir) continue;
    if (!path.startsWith(home)) continue;
    const key = path.slice(home.length);
    const content = entry.content === null ? '' : entry.content;
    if (!(key in last.contents)) {
      untracked.push(key);
    } else if (last.contents[key] !== content) {
      modified.push(key);
    }
  }
  return { modified: modified.sort(), untracked: untracked.sort() };
};

Sim.prototype.aurIndex = function aurIndex() {
  return AUR_PACKAGES;
};

Sim.prototype.knownPackage = function knownPackage(name) {
  return CORE_PACKAGES.some((p) => p.name === name) ||
         AUR_PACKAGES.some((p) => p.name === name);
};

Sim.prototype.manPages = function manPages() {
  return {
    'pacman': `NAME
       pacman - package manager utility

SYNOPSIS
       pacman <operation> [...]

DESCRIPTION
       pacman is a package manager that handles the installation and removal
       of software packages. It also handles upgrades of installed packages.

OPERATIONS
       pacman -S <package>      install a package
       pacman -R <package>      remove a package
       pacman -Ss <search>      search the repositories
       pacman -Qi <package>     show information about an installed package
       pacman -Q                list installed packages
       pacman -Sy               synchronise the package databases
`,
    'makepkg': `NAME
       makepkg - build packages from PKGBUILD files

SYNOPSIS
       makepkg [options]

DESCRIPTION
       makepkg reads a PKGBUILD file and builds the package it describes,
       installing the result into a package file.

       The build happens in a clean chroot, so the build environment does not
       inherit anything from your system.
`,
    'pkgctl': `NAME
       pkgctl - a front end to devtools

SYNOPSIS
       pkgctl <command> [...]

DESCRIPTION
       pkgctl is the current front door to devtools. pkgctl build is the
       one-command version of a clean chroot build.
`,
    'git': `NAME
       git - the stupid content tracker

SYNOPSIS
       git <command> [...]

DESCRIPTION
       git records the history of a directory of files. Every commit is a
       snapshot; every commit has a parent.
`,
  };
};
