/**
 * Tools: pacman.
 *
 * A profile for an ISO is, underneath everything else, a list of package names.
 * The build hands that list to pacman inside an empty filesystem and pacman
 * decides what actually appears on the image. So this lab is not "learn some
 * package manager commands" — it is "understand what happens to the list you
 * are about to write".
 *
 * Every check here is on the state of the machine: what is installed, what is
 * not. Never on the commands the learner typed, because there is more than one
 * right way to install a package.
 */

import { ok, no, task, packageInstalled, packageNotInstalled } from '../assets/checks.js';

export const toolsPacman = {
  id: 'tools-pacman',
  track: 'tools',
  title: 'pacman: searching, installing, removing',
  subtitle: 'The program that decides what is on the machine — and what goes on the ISO.',

  scenario:
    'Your profile says which packages belong on the image. Every one of those names is a ' +
    'package that pacman knows about, and pacman is what turns the names into files on a ' +
    'filesystem. Before you write a single line of a profile, you need to know what pacman ' +
    'actually does with that list: how to find a package, how to look at one before you ' +
    'trust it, how to install it, how to take it away again, and what a full update really ' +
    'means. This lab is a practice machine with pacman on it, and it is deliberately built ' +
    'so that some of the things you try will fail — because the errors are where the ' +
    'real understanding comes from.',

  teaches:
    'A package is one piece of software, packaged up so that it can be installed and ' +
    'removed as a single unit: a text editor, a web browser, a kernel. A package manager ' +
    'is the program that works with those packages — it downloads them, checks what they ' +
    'need, installs them, removes them, and keeps a list of what is installed. On Arch ' +
    'Linux the package manager is pacman, and the places it downloads from are called ' +
    'repositories. Here is why an ISO builder cares about any of this: the package list in ' +
    'a profile is a pacman list. When the image is built, that list is handed to pacman ' +
    'inside a brand new, empty filesystem, and pacman installs every name in it. So a name ' +
    'in your profile is not a label — it is an instruction, and pacman will stop the whole ' +
    'build on a name it does not recognise. Nobody should edit one of those lists without ' +
    'knowing what pacman does with it. The commands in this lab are the ones you will use ' +
    'every single time: pacman -Ss searches the repositories for a name, pacman -Qi shows ' +
    'you everything pacman knows about one package, pacman -S installs one, pacman -R ' +
    'removes one, pacman -Q lists what is installed, and pacman -Syu is a full update — ' +
    'the -Sy part refreshes pacman\'s copy of the repository lists and the -u part ' +
    'upgrades everything that is installed. A full update is a step of its own, done on ' +
    'purpose, not bundled into every install.',

  readFirst: [
    {
      title: 'The commands, and what each one is for',
      body: [
        'pacman -Ss <word> — search the repositories. It prints the exact package name, its ' +
        'version, and one line describing it. You use this when you know roughly what you ' +
        'want but not what it is called.',
        'pacman -Qi <name> — show information about one package: name, version, ' +
        'description, which repository it comes from, how big it is, and what it depends ' +
        'on. It works before the package is installed.',
        'pacman -S <name> — install. pacman -R <name> — remove. pacman -Q — list every ' +
        'installed package, one name per line. pacman -Q <name> — ask about that one ' +
        'package.',
        'pacman -Syu — the full update. -Sy refreshes the repository lists, -u upgrades ' +
        'the installed packages.',
      ],
    },
    {
      title: 'Reading a pacman error',
      body: [
        'Pacman refuses things. It will not install a package whose name it does not know, ' +
        'because it will not guess: a name that is one character off is not "nearly right", ' +
        'it is a different thing that does not exist.',
        'When that happens, pacman says so plainly: "error: package \'something\' was not ' +
        'found". The name in the message is the name pacman could not find. Usually the ' +
        'name you wanted is one search away.',
        'The same message comes back when you ask about a package that is not installed. ' +
        'That failure is not a fault. It is how pacman says "no, and here is what I do ' +
        'know".',
        'The removal in this lab is done on the base package that came with the machine, ' +
        'because that is the one package already here to take off. On a real system you ' +
        'would remove something you had installed yourself.',
      ],
    },
    {
      title: 'What an update really is',
      body: [
        'Pacman keeps a local copy of the lists of packages the repositories offer. Those ' +
        'copies go stale, and when they are stale pacman is working from yesterday\'s idea ' +
        'of what exists.',
        'A full update fixes that in two moves: -Sy refreshes the copies, -u upgrades ' +
        'everything already installed against the fresh copies. Do it as its own step, ' +
        'deliberately, so you know the database was current before you chose what to ' +
        'install. On a real machine `pacman -Syu` on its own updates everything; on this ' +
        'practice machine an update needs a package name to act on.',
      ],
    },
  ],

  env: {
    type: 'terminal',
    prompt:
      'A practice Linux machine with pacman on it. Type a command and press Enter. The ' +
      'tasks are checked against what is actually installed, not against the commands you ' +
      'typed.',
    packages: ['base', 'pacman', 'bash'],
    files: {
      '/home/learner/README.txt':
        'A practice machine with pacman on it.\nThe official repositories hold a small, ' +
        'fixed set of packages here.\nTry `pacman -Ss` with no word to see them all.\n',
    },
    cwd: '/home/learner',
  },

  tasks: [
    task({
      id: 'search-then-install',
      prompt:
        'Look before you install. Search the repositories for a text editor with ' +
        '`pacman -Ss nano` — it prints the package name, its version, and one line ' +
        'describing it — and then install it with `pacman -S nano`.',
      check: (s) => {
        if (packageInstalled(s.sim, 'nano')) return ok('');
        return no(
          'nano is not installed on the machine yet. `pacman -Ss nano` searches the ' +
          'repositories and shows you what is there; `pacman -S nano` installs it. Search ' +
          'first, then install.'
        );
      },
      hint:
        'The search flag is a capital S with a small s: -Ss. The install flag is a capital ' +
        'S on its own: -S. The word you search for goes after the flag.',
      hint2: '`pacman -Ss nano` to look, then `pacman -S nano` to install.',
      why:
        'Searching first tells you the exact name and what the package claims to be. ' +
        'Pacman will not guess at a name for you, so one wrong character in a profile is a ' +
        'build that stops halfway. Five seconds of searching now is the difference later.',
    }),

    task({
      id: 'look-before-you-install',
      prompt:
        'Now do it the careful way, with a second package. Look at curl before you install ' +
        'it: `pacman -Qi curl` shows its version, its description, which repository it ' +
        'comes from and how big it is. Read it, then install it.',
      check: (s) => {
        if (packageInstalled(s.sim, 'curl')) return ok('');
        return no(
          'curl is not installed on the machine yet. `pacman -Qi curl` shows you what a ' +
          'package is before you commit to it — name, version, description, repository, ' +
          'installed size — and `pacman -S curl` installs it. Read it first, then install.'
        );
      },
      hint:
        'A capital Q with a small i means "give me information about this package". It works ' +
        'on a package that is not installed yet, which is exactly when you want it.',
      hint2: '`pacman -Qi curl` to read about it, then `pacman -S curl` to install it.',
      why:
        'A package name in a profile is a promise about what will be on the image. Reading ' +
        'the description before you install is how you find out whether you are promising ' +
        'the right thing — and whether the thing is really in the official repositories.',
    }),

    task({
      id: 'list-what-is-installed',
      prompt:
        'Now see the whole picture. `pacman -Q` lists every installed package, one name per ' +
        'line. Look at that list, then add one more package to it: `pacman -S vim`.',
      check: (s) => {
        if (packageInstalled(s.sim, 'vim')) return ok('');
        return no(
          'vim is not installed yet. `pacman -Q` prints the list of everything installed — ' +
          'one name per line — and `pacman -S vim` adds vim to it. Look at the list, then ' +
          'grow it.'
        );
      },
      hint:
        'A capital Q with nothing after it lists everything. A capital S with a package ' +
        'name after it installs that package.',
      hint2: '`pacman -Q` to read the list, then `pacman -S vim`.',
      why:
        'That list is the profile. When an ISO is built, pacman is handed exactly this list ' +
        'and installs each name into a brand new filesystem. On a real machine you would ' +
        'save it into a file and hand that file to the profile — which is why it is worth ' +
        'knowing how to read it.',
    }),

    task({
      id: 'remove-and-confirm',
      prompt:
        'Now take something back off. This machine came with a small set already installed: ' +
        'base, bash and pacman. Remove the base package with `pacman -R base`, then ask ' +
        'pacman about it again with `pacman -Q base`. This time it should fail, and that ' +
        'failure is the confirmation that it is gone.',
      check: (s) => {
        if (packageNotInstalled(s.sim, 'base')) return ok('');
        return no(
          'base is still installed. `pacman -R base` removes it. After that, `pacman -Q base` ' +
          'fails with "package not found" — and that error is not a fault, it is how pacman ' +
          'tells you the package is no longer there.'
        );
      },
      hint:
        'Removal is a capital R. The capital Q afterwards is the same command that lists ' +
        'installed packages — with a name after it, it asks about that one package only.',
      hint2: '`pacman -R base`, then `pacman -Q base`, and read what it says.',
      why:
        'An image is only as good as the list that built it, and knowing how to take things ' +
        'off is how you keep a profile honest. Learning that a package which is gone reports ' +
        'an error rather than silence is how you notice, before a build, that a name in ' +
        'your list is not real. (base is a metapackage — really a list of other packages — ' +
        'so removing it does not take the rest of the system with it.)',
    }),

    task({
      id: 'full-update',
      prompt:
        'Now the update. A full update is `pacman -Syu`: the -Sy part refreshes pacman\'s ' +
        'copy of the repository lists, and the -u part upgrades everything that is ' +
        'installed. It is a step of its own, not something you bundle into every install. ' +
        'On this machine an update needs a package to act on, so run a full update that ' +
        'brings the longterm kernel in: `pacman -Syu linux-lts`.',
      check: (s) => {
        if (packageInstalled(s.sim, 'linux-lts')) return ok('');
        return no(
          'linux-lts is not installed yet. On this practice machine the full update needs ' +
          'something to act on: `pacman -Syu linux-lts` refreshes the repository lists and ' +
          'brings the longterm kernel in at the same time.'
        );
      },
      hint:
        'The three letters go together: -Syu. On a real machine `pacman -Syu` on its own ' +
        'updates everything that is installed. Here you name a package so there is ' +
        'something for it to do.',
      hint2: '`pacman -Syu linux-lts`',
      why:
        'Updating refreshes what pacman believes is available, and doing it deliberately, ' +
        'as its own step, is what keeps a build reproducible: you know the repository ' +
        'lists were current before you chose the versions. It is also why a profile pins ' +
        'what it wants instead of trusting whatever is newest on the day.',
    }),

    task({
      id: 'when-pacman-says-no',
      prompt:
        'Now meet an error on purpose. Try to install a package that does not exist: type ' +
        '`pacman -S devtool` — the real name has an s on the end. Read what pacman says. ' +
        'It refuses; it will not guess a name for you. Then search for the real one with ' +
        '`pacman -Ss devtools` and install it.',
      check: (s) => {
        if (packageInstalled(s.sim, 'devtools')) return ok('');
        return no(
          'devtools is not installed yet. Pacman refused the name you gave it, and that ' +
          'refusal is the lesson: a wrong name in a profile is a build that stops halfway, ' +
          'so pacman will not guess. Search for the real name with `pacman -Ss devtools`, ' +
          'then install it exactly: `pacman -S devtools`.'
        );
      },
      hint:
        'Read the error carefully: it names the package it could not find. That name is ' +
        'usually one search away from the one you wanted.',
      hint2: '`pacman -Ss devtools` to see the real name and version, then `pacman -S devtools`.',
      why:
        'This is the failure you will meet in a real build, and the error message is ' +
        'written for exactly this moment. Read it and it tells you the name pacman wanted, ' +
        'which is almost always the name you nearly typed.',
    }),
  ],

  /**
   * The state a learner who did this properly ends up in.
   *
   * This is the worked example: the commands a person would actually type,
   * in the order they would type them — including the one that fails on
   * purpose, because reading that error is the point of the last task.
   */
  solution: (s) => {
    s.sim.run('pacman -Ss nano');
    s.sim.run('pacman -S nano');
    s.sim.run('pacman -Qi curl');
    s.sim.run('pacman -S curl');
    s.sim.run('pacman -Q');
    s.sim.run('pacman -S vim');
    s.sim.run('pacman -R base');
    s.sim.run('pacman -Q base');
    s.sim.run('pacman -Syu linux-lts');
    s.sim.run('pacman -S devtool');
    s.sim.run('pacman -Ss devtools');
    s.sim.run('pacman -S devtools');
  },

  report: {
    lede:
      'You now know what pacman does with a list of names: it searches for them, it will ' +
      'tell you what each one actually is, it installs them, it removes them, it refuses ' +
      'names it does not recognise, and it updates itself on its own schedule. That list is ' +
      'your profile. From here on, every name you put in it is an instruction to pacman, ' +
      'not a label.',
    next:
      'A profile is a set of files that a pipeline builds from. The next lab is git, ' +
      'because the pipeline builds a commit — and a change you have not committed is a ' +
      'change that never gets built.',
  },
};
