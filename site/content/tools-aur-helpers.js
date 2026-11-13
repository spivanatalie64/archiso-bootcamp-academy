/**
 * Track: tools — the AUR, and the helpers that build it for you.
 *
 * The lesson: the AUR is user-submitted build recipes, unofficial and
 * unsupported; read the recipe; a helper is a wrapper; and none of that puts
 * anything on an ISO.
 */

import { task, ok, no } from '../assets/checks.js';

const NOTE = 'aur-to-iso.txt';

/** Everything the learner has seen on the terminal so far. */
function terminalText(state) {
  const runner = state.runner;
  const lines = (runner && runner.terminalLines) || [];
  const shown = lines.map((l) => l.text || '').join('\n');
  const typed = (state.sim.history || []).join('\n');
  return shown ? `${shown}\n${typed}` : typed;
}

/** The note file, wherever the learner put it. */
function findNote(sim) {
  return sim.allFiles().find((p) => p.endsWith('/' + NOTE) || p === NOTE) || null;
}

/** The recipe a helper left on disk, if it downloaded one. */
function downloadedRecipe(sim) {
  return sim.allFiles().find((p) => /\/PKGBUILD\.[\w.+-]+$/.test(p)) || null;
}

/** The packages a helper installed, by whatever state the simulator keeps. */
function aurInstalled(sim) {
  const aur = sim.state.aur;
  if (aur && Array.isArray(aur.installed)) return aur.installed;
  return [];
}

/** The names in the official repositories. */
function officialPackages(sim) {
  if (typeof sim.packageIndex !== 'function') return [];
  return sim.packageIndex().map((p) => p.name);
}

/**
 * Type a command, the way the terminal does: run it, and put what came back
 * on the screen. Used by the solution, so that what the learner would have
 * seen is on the screen afterwards too.
 */
function type(state, command) {
  const result = state.sim.run(command);
  const lines = state.runner && state.runner.terminalLines;
  if (lines) {
    lines.push({ kind: 'input', text: command });
    if (result.stdout) lines.push({ kind: 'stdout', text: result.stdout });
    if (result.stderr) lines.push({ kind: 'stderr', text: result.stderr });
  }
  return result;
}

export const toolsAurHelpers = {
  id: 'tools-aur-helpers',
  track: 'tools',
  title: 'The AUR, and the helpers that build it',
  subtitle: 'User-submitted recipes, unofficial by definition, and how to survive them.',

  scenario:
    'There is something in the AUR you want — a font, a terminal client, a small ' +
    'tool — and it is not in the official Arch repositories. The AUR is where ' +
    'Arch users put recipes that nobody has audited, and helpers like yay and ' +
    'paru will fetch and build one for you in a single command. This lab is ' +
    'that AUR, those helpers, and the question that decides what ends up on ' +
    'your ISO.',

  teaches:
    'The AUR — the Arch User Repository — is a pile of build recipes written by ' +
    'users. Not packages exactly: recipes, the PKGBUILD files that describe ' +
    'how to build a package. When you install something from the AUR, your ' +
    'machine downloads the recipe, builds the package from the source it ' +
    'points at, and hands the result to pacman.',

  readFirst: [
    {
      title: 'What the AUR is',
      body: [
        'The AUR holds user-submitted build recipes. They are not official ' +
          'packages and they are not in Arch’s repositories — pacman -Ss will ' +
          'never show them to you. The official repositories are curated, ' +
          'tested and signed by the project. The AUR is whatever anybody felt ' +
          'like submitting, and the maintainers of those recipes are strangers.',
        'A helper such as yay or paru is a wrapper around the workflow. It ' +
          'fetches the recipe, builds it in a clean chroot, and installs the ' +
          'result. That convenience is the whole point, and it is also the ' +
          'reason the recipe deserves a look before you let it run.',
      ],
    },
    {
      title: 'What "unsupported" actually means',
      body: [
        'AUR packages are unsupported. That is not a formality. Nobody ' +
          'guarantees the recipe builds, that it still works with current ' +
          'dependencies, or that the source it points at is the source you ' +
          'think it is. The person who wrote the recipe is a stranger with a ' +
          'shell and your user account, and their PKGBUILD is a script that ' +
          'runs as you.',
        'Unsupported does not mean bad. Plenty of AUR packages are excellent, ' +
          'and some of them are better than anything in the repositories. It ' +
          'means the guarantee is missing, and you are the one carrying the ' +
          'risk. The habit that makes that survivable is simple: read the ' +
          'PKGBUILD before you build it. It is a short file. You are looking ' +
          'for the source URL, the depends list, and any install step that ' +
          'reaches outside the package directory.',
      ],
    },
    {
      title: 'Reading the recipe is the step people skip',
      body: [
        'When a helper runs, the first thing it does is download the PKGBUILD. ' +
          'That is your chance to look at it — and the recipe is worth reading ' +
          'even when you trust the helper, because the helper will not read it ' +
          'for you. A recipe that installs something into /etc with a curl pipe ' +
          'to a shell is not doing what its description says.',
      ],
    },
    {
      title: 'What a helper does not do',
      body: [
        'This is the part that matters for this course. A helper installs onto ' +
          'the machine you are standing on. It does not put anything on your ' +
          'ISO.',
        'An ISO is assembled from a profile, and the profile lists packages by ' +
          'name — pacman installs those names while the image is being built. ' +
          'If a package is not in the official repositories, the profile cannot ' +
          'ask for it by name, because the image builder has no way to fetch ' +
          'it. So an AUR package has to be built into a package file and served ' +
          'from a local repository that the profile can see. Build it, serve it, ' +
          'list it. Three steps, in that order.',
      ],
    },
  ],

  env: {
    type: 'terminal',
    prompt:
      'A machine with pacman and git. The AUR helpers are not installed yet, ' +
      'but they can be run from here.',
    packages: ['base', 'pacman', 'bash', 'git'],
    cwd: '/home/learner',
  },

  tasks: [
    task({
      id: 'search-the-aur',
      prompt:
        'Search the AUR. Run `yay -Ss` (or `paru -Ss`) and look at what comes ' +
        'back. Notice how each result is labelled — it does not say core/ or ' +
        'extra/ the way pacman’s own results do.',
      check: (s) => {
        if (/aur\/\S/.test(terminalText(s))) return ok('');
        // The other way to have found it: a helper has already fetched a
        // recipe out of the AUR.
        if (downloadedRecipe(s.sim) || aurInstalled(s.sim).length) return ok('');
        return no(
          'Nothing from the AUR has shown up on your screen yet. `yay -Ss` ' +
            'searches the AUR rather than the official repositories — try ' +
            'it, or narrow it with a word like `yay -Ss mono`.'
        );
      },
      hint:
        'The helper takes pacman’s search flag, but it searches a different ' +
        'place: the AUR, not the repositories.',
      hint2: '`yay -Ss` — the results come back prefixed with aur/.',
      why:
        'The AUR is a separate index from the official repositories, and it is ' +
        'worth knowing which one a search is looking at. Everything in it is ' +
        'user-submitted, which is exactly why it deserves a closer look than a ' +
        'package from extra/.',
    }),

    task({
      id: 'not-in-the-repositories',
      prompt:
        'Now ask pacman about the same thing. Search the official repositories ' +
        'for one of the packages you found in the AUR — `pacman -Ss mono`, ' +
        'say — and see what pacman says.',
      check: (s) => {
        if (/no results found|was not found/.test(terminalText(s))) return ok('');
        // The same fact, from the state: what came out of the AUR is not in
        // the official repositories.
        const official = officialPackages(s.sim);
        const unofficial = aurInstalled(s.sim).some((name) => !official.includes(name));
        if (unofficial) return ok('');
        return no(
          'Pacman has not been asked about it yet. Run `pacman -Ss` with the ' +
            'same word you searched for in the AUR. The official ' +
            'repositories are a different place from the AUR, and this is ' +
            'what it looks like when the package is not in them.'
        );
      },
      hint:
        'Same search word, different tool. `pacman -Ss mono` searches the ' +
        'official repositories only.',
      hint2: 'Try `pacman -Ss mono`, or `pacman -Qi <name>` for a package you saw in the AUR.',
      why:
        'This is the plain meaning of "unofficial": the package is not in the ' +
        'repositories, it is not signed by the project, and no maintainer is on ' +
        'the hook for it. It is a recipe somebody wrote, and it is yours to ' +
        'read before you trust it.',
    }),

    task({
      id: 'install-from-the-aur',
      prompt:
        'Install one of the AUR packages with a helper. Watch the output as it ' +
        'goes: the helper downloads the PKGBUILD first, and that file — not the ' +
        'helper’s promise — is what tells you what you are about to run.',
      check: (s) => {
        const text = terminalText(s);
        const recipe = downloadedRecipe(s.sim);
        const installed = aurInstalled(s.sim);
        if (!recipe && !/Downloading PKGBUILD/.test(text)) {
          return no(
            'Nothing has been downloaded yet. Install an AUR package with a ' +
              'helper — `yay -S <name>` for something you found in the search — ' +
              'and watch for the line where it says it is downloading the ' +
              'PKGBUILD.'
          );
        }
        if (!installed.length && !/Installing\s+\S+/.test(text)) {
          return no(
            'The recipe came down but the package was not installed yet. Let the ' +
              'helper finish — it downloads the PKGBUILD, builds it, and then ' +
              'installs the result with pacman.'
          );
        }
        return ok('');
      },
      hint:
        'The helper does the whole workflow for you: fetch the recipe, build it ' +
        'in a clean chroot, install the package.',
      hint2: '`yay -S ttf-jetbrains-mono` — pick anything you saw in the search.',
      why:
        'The helper turns a pile of shell commands into one. What it does not ' +
        'turn into one is your reading of the recipe it downloaded. The ' +
        'PKGBUILD that came down is the thing to open and read, every time.',
    }),

    task({
      id: 'onto-the-iso',
      prompt:
        'One more thing, and it is the one this course is about. A helper ' +
        'installs on this machine. Your ISO does not get it that way — the ' +
        'image only ever gets what its profile lists, and the profile can only ' +
        'ask for packages that live in a repository the image builder can see. ' +
        'Write that down for yourself in a file called ' + NOTE + ' in your home: ' +
        'what has to happen to an AUR package before it can go on an image.',
      check: (s) => {
        const path = findNote(s.sim);
        if (!path) {
          return no(
            'There is no ' + NOTE + ' file yet. Create it in your home — for ' +
              'example `printf \'...\' > ' + NOTE + '` — and write down what has ' +
              'to happen to an AUR package before it can go on an image.'
          );
        }
        const content = s.sim.readFile(path) || '';
        const builds = /build|makepkg|pkgctl|compil/i.test(content);
        const serves = /repo|server|pacman\.conf|mirror/i.test(content);
        if (!builds) {
          return no(
            'The note does not say what happens first. The AUR recipe has to be ' +
              'built into a package file — that is makepkg, or pkgctl build.'
          );
        }
        if (!serves) {
          return no(
            'The note does not say what happens second. The built package has to ' +
              'be served from a repository that the image builder can see — a ' +
              'local repo, added to the profile’s pacman.conf. Only then can the ' +
              'profile ask for it by name.'
          );
        }
        return ok('');
      },
      hint:
        'Two steps, in order: first the recipe becomes a package, then that ' +
        'package becomes something the profile can ask for.',
      hint2:
        'Write something like: "build it with makepkg, serve the package from a ' +
        'local repo the profile can see, then list it in the profile".',
      why:
        'An ISO is not a snapshot of the machine you built it on. It is the ' +
        'profile, resolved against repositories, at build time. Anything not in ' +
        'a repository the image builder can see simply is not on the image — no ' +
        'matter how many helpers you ran on your own desktop.',
    }),
  ],

  /**
   * The state a learner who did this properly ends up in.
   *
   * The verifier applies this and asserts that every task then passes, and
   * that no task was already satisfied before the learner started.
   */
  solution: (s) => {
    // The commands a learner would type, in order: look in the AUR, ask pacman
    // about the same package, let a helper install it, and write down what it
    // takes to get an AUR package onto an image.
    type(s, 'yay -Ss jetbrains');
    type(s, 'pacman -Ss mono');
    type(s, 'yay -S ttf-jetbrains-mono');
    type(
      s,
      "printf 'build it with makepkg, then serve it from a local repo the " +
        "profile can see\\n' > " + NOTE
    );
  },

  report: {
    lede:
      'You found a recipe in the AUR, confirmed that the official repositories ' +
      'never had it, and let a helper build and install it. None of that makes ' +
      'it trustworthy — it makes it convenient. The AUR is unsupported, and the ' +
      'thing that makes that survivable is reading the recipe before you let it ' +
      'run.',
    next:
      'And the part that decides what you ship: an ISO gets its packages from a ' +
      'profile and a repository, never from a helper on your desktop.',
  },
};

export default toolsAurHelpers;
