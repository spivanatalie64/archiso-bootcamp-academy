# Writing a lab

A lab is one JavaScript module in `site/content/`. It exports one object. The
runner in `site/assets/lab.js` does everything else.

```js
export const myLab = {
  id: 'my-lab',                 // stable; used in the URL and in saved progress
  track: 'iso',                 // 'zero' | 'tools' | 'iso'
  title: 'What a profile is made of',
  subtitle: 'One sentence, for the course home page.',

  scenario: 'Why this is worth doing, in one paragraph.',
  teaches:   'The lesson itself, in plain words, before anything is asked.',

  readFirst: [
    { title: 'A heading', body: ['A paragraph.', 'Another paragraph.'] },
  ],

  env: {
    type: 'terminal',           // 'editor' | 'terminal' | 'build'
    prompt: 'What this environment is for.',
    files: {                   // editor labs: the files that start open
      'profiledef.sh': 'iso_name="x"\n',
    },
    packages: ['base', 'pacman'],   // terminal labs: what starts installed
    state: {},                      // terminal labs: arbitrary facts
    cwd: '/home/learner',
    build: { status: 'idle' },      // build labs
  },

  tasks: [
    task({
      id: 'short-slug',
      prompt: 'What the learner is asked to do.',
      check: (state) => ok(''),       // {done, message}
      hint:  'A hint that teaches.',
      hint2: 'A stronger hint, shown after the first.',
      why:   'Why the right state is the right state. Shown in the lab report.',
    }),
  ],

  start: (state) => {},           // optional, set the environment up
  onBuild: (ctx) => {},           // build labs only
  report: {
    lede: 'What the learner should take away.',
    next: 'Where to go next.',
  },
};
```

## The one rule

**A check looks at the state of the world, never at how the learner got
there.**

```js
// Wrong. The learner used a different command and knows the thing perfectly.
check: (s) => s.sim.history.includes('pacman -S nano')
  ? ok('') : no('Run pacman -S nano.')

// Right. Is nano installed?
check: (s) => packageInstalled(s.sim, 'nano')
  ? ok('')
  : no('nano is not installed yet.')
```

There is more than one right way to install a package. A learner who used
`pacman -Sy && pacman -S nano`, or `pacman -S --needed nano`, has still learned
it, and the lab must say so.

## Checking the simulator

`state.sim` is a `Sim` from `site/assets/sim.js`.

| | |
|---|---|
| `sim.fs` | Map of path → `{content, mode, dir}` |
| `sim.readFile(path)` | contents, or null |
| `sim.writeFile(path, content, mode)` | write a file |
| `sim.fileMode(path)` | `'644'`, `'755'`, … |
| `sim.allFiles()` | every file path, sorted |
| `sim.state.packages` | Set of installed package names |
| `sim.state.git` | `{initialised, staged, committed, config, branch}` |
| `sim.state.built` | packages built by `makepkg` |
| `sim.state.iso` | facts about a built image, for build labs |
| `sim.run(cmd)` | run a command, returns `{stdout, stderr, code}` |

## The facts about a built image

A build lab's checks read `sim.state.iso`. The shape is:

```js
{
  path: 'vesper-2026.11.10-x86_64.iso',   // the file name
  label: 'VESPER_202611',                  // the ISO 9660 volume label
  packages: ['base', 'linux', 'nano'],     // packages that are inside
  booted: true,                            // it booted to a login prompt
  sizeBytes: 503656448,
  release: 'https://…/-/releases/v1',      // where the download is
}
```

`isoBuilt`, `isoHasPackage`, `isoLabelIs` and `isoBooted` read those. A lab
may add its own fields — `bootMenu`, `runtimeMirror`, `keyring` — and read
them itself. The shape is a floor, not a ceiling.

## The solution

Every lab exports a `solution(state)`: the state a learner who did it
properly ends up in. `tools/verify-labs.mjs` applies it to a fresh
environment and asserts that every task then passes, and that no task was
already satisfied before it ran. A lab that cannot be completed is worse than
no lab.

For a terminal lab, the solution runs the commands. For an editor lab, it
returns the contents of every file a check reads. For a build lab, it drives
the build to a state where the facts are right.

## Helper checks

Import from `site/assets/checks.js`:

`ok(message)` `no(message)` `task(spec)` `fileExists` `fileMatches`
`fileEquals` `fileModeIs` `listFiles` `fileHasAssignment` `packageInstalled`
`packageNotInstalled` `installedPackages` `pkgbuildAssignments`
`pkgbuildArray` `pkgbuildFunctions` `packageBuilt` `gitRepository`
`gitHasCommits` `gitCommitMessages` `gitHasIdentity` `isoFacts` `isoBuilt`
`isoHasPackage` `isoLabelIs` `isoBooted` `anyOf(...)` `allOf(...)`

## Writing a check that explains itself

The message a check returns when it fails is shown to the learner next to the
task. It should say **what state is missing**, not repeat the prompt.

```js
// Weak
no('Wrong.')

// Better
no('The profile still says iso_name="archlinux-baseline". The image is named after this, so it has to say "vesper".')
```

## Registering the lab

Add it to the registry in `site/content/index.js`:

```js
import { myLab } from './my-lab.js';
export const labs = [ ...zeroLabs, ...toolsLabs, ...isoLabs, myLab ];
```

The course home page builds its path from the registry, in order.
