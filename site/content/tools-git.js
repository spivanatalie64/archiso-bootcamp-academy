/**
 * Tools: git.
 *
 * The learner's flavour profile is a git repository, and the build pipeline
 * builds a commit. That single fact is the reason this lab exists: an
 * uncommitted change is a change that never gets built. So this lab is the
 * loop once around — repository, identity, stage, commit, branch, and a change
 * you deliberately leave out of the history.
 *
 * Every check is on the state of the repository: what is staged, what is
 * committed, how the repository is configured, which branch you are on. Never on
 * the commands the learner typed.
 */

import {
  ok,
  no,
  task,
  gitRepository,
  gitHasCommits,
  gitCommitMessages,
  gitHasIdentity,
} from '../assets/checks.js';

const PROFILE = [
  'iso_name="myflavour"',
  'iso_label="MYFLAVOUR"',
  'packages=(',
  '  base',
  '  linux',
  ')',
  '',
].join('\n');

const README = [
  'This folder is the start of an ISO profile.',
  'profiledef.sh describes the image: its name, its label, and the packages it will contain.',
  '',
].join('\n');

/** The files the learner starts with, and exactly what they said. */
const ORIGINALS = {
  'profiledef.sh': PROFILE,
  'README.txt': README,
};

/** The names git currently has staged, without any folder part. */
function stagedNames(sim) {
  const staged = sim.state.git && sim.state.git.staged;
  return staged ? [...staged].map((p) => p.split('/').pop()) : [];
}

/** The names that have appeared in any commit so far. */
function committedNames(sim) {
  const commits = (sim.state.git && sim.state.git.committed) || [];
  return commits.flatMap((c) => (c.files || []).map((p) => p.split('/').pop()));
}

export const toolsGit = {
  id: 'tools-git',
  track: 'tools',
  title: 'git: the history of your ISO profile',
  subtitle: 'A commit is what gets built, so an uncommitted change is a change that never ships.',

  scenario:
    'Your ISO flavour is not a folder on a desktop. It is a repository — a folder whose ' +
    'every change is recorded, with a name and a reason attached — and the build pipeline ' +
    'builds a commit, not a folder. That one fact changes how you work. You can change ' +
    'anything you like, but until the change is committed, nothing builds it and nothing ' +
    'ships it. This lab is that loop once around: a repository, an identity, a staged file, ' +
    'a commit, a branch, and one change you deliberately leave out.',

  teaches:
    'A repository — people shorten it to a repo — is a directory that git watches. ' +
    'Alongside your files, git keeps a hidden folder called .git that holds the whole ' +
    'history: every version of every file, and who changed it and when. A commit is one ' +
    'entry in that history. It is a complete snapshot of your files at a moment in time, ' +
    'with a message saying what changed and why, and the name and email of the person who ' +
    'made it. Two more git words you will need today, and they are the ones people mix ' +
    'up: the working tree is your files as they are on disk right now, with your ' +
    'unsaved-to-history edits in them; staged means you have marked a file with git add ' +
    'as "this one belongs in my next commit"; committed means a snapshot that already ' +
    'exists in the history. Here is why any of this matters to an ISO builder: your ' +
    'profile — the recipe that becomes an image — is a repository, and the pipeline builds ' +
    'a commit. It does not build "whatever happens to be on the disk". So if you edit the ' +
    'profile and do not commit it, your edit is invisible to the build: the image will be ' +
    'built from the last commit, and your change will not be in it. That is not a flaw in ' +
    'the pipeline, it is the point of one. Builds are supposed to be reproducible, and the ' +
    'only thing about a set of files that is reproducible is a commit with a name on it. ' +
    'Git has a few other words worth knowing even though this lab does not use them: clone ' +
    'means copying somebody else\'s repository onto your machine, and push means sending ' +
    'your commits to a server so other people can have them. What follows is the local ' +
    'half of that: init, add, commit, log, branch, status.',

  readFirst: [
    {
      title: 'The files in this folder',
      body: [
        'There are two of them. profiledef.sh is the start of an ISO profile: it is a plain ' +
        'text file that says what the image is called and which packages belong on it. ' +
        'README.txt is a note about the folder.',
        'Both of them are yours to change. Git is not going to stop you — that is the whole ' +
        'point of git. It just records what you did.',
      ],
    },
    {
      title: 'The commands, and what each one is for',
      body: [
        'git init — turn this folder into a repository. It adds the hidden .git folder and ' +
        'changes nothing else.',
        'git config user.name "..." and git config user.email "..." — tell git who you are. ' +
        'Git records an author on every commit and will not commit without one.',
        'git add <file> — stage a file: mark it as part of the next commit. git add . stages ' +
        'everything in the folder you are standing in.',
        'git commit -m "..." — record everything that is staged, with a message. The -m flag ' +
        'means "message", and the message goes in quotes right after it.',
        'git log — read the history, newest commit first. git status — ask what is staged and ' +
        'what is not. git branch <name> — make a branch, and in this terminal, move onto it.',
      ],
    },
    {
      title: 'Why a message matters',
      body: [
        'A commit message is not a formality. It is the one sentence that tells whoever ' +
        'reads the history next — including you in six months, and including the pipeline ' +
        'log — what changed and why.',
        'Say what you did and, when it is not obvious, why. "add the profile stub" is fine. ' +
        '"fix" is not.',
      ],
    },
  ],

  env: {
    type: 'terminal',
    prompt:
      'A practice machine with git on it, and two files waiting to be tracked. The tasks ' +
      'are checked against the state of the repository, not against the commands you typed.',
    packages: ['base', 'pacman', 'bash', 'git'],
    files: {
      '/home/learner/profiledef.sh': PROFILE,
      '/home/learner/README.txt': README,
    },
    cwd: '/home/learner',
  },

  tasks: [
    task({
      id: 'make-a-repository',
      prompt:
        'Turn this folder into a repository: `git init`. That creates a hidden .git folder ' +
        'here, and from now on git keeps track of what you change.',
      check: (s) => {
        if (gitRepository(s.sim)) return ok('');
        return no(
          'This folder is not a repository yet. `git init` makes one. It does not change your ' +
          'files in any way — it only adds the .git folder that will hold the history. Until ' +
          'that folder exists, git refuses to do anything here.'
        );
      },
      hint: 'The command is two words: `git init`.',
      hint2: '`git init`',
      why:
        'Everything else in this lab happens inside a repository. Git will refuse to add, ' +
        'commit, or even tell you the status of a folder that is not one, because there is ' +
        'nowhere for it to put the answer.',
    }),

    task({
      id: 'tell-git-who-you-are',
      prompt:
        'Git stamps every commit with an author, and it needs to know who that is before ' +
        'it will record one. Set your name and your email: `git config user.name "Your ' +
        'Name"` and `git config user.email "you@example.com"`.',
      check: (s) => {
        if (gitHasIdentity(s.sim)) return ok('');
        return no(
          'Git still does not know your name and email, so it cannot put an author on a ' +
          'commit. Set both: `git config user.name "Your Name"` and then ' +
          '`git config user.email "you@example.com"`. One thing to watch: if you set them ' +
          'before `git init`, set them again — a new repository starts with an empty set of ' +
          'settings.'
        );
      },
      hint:
        'Two settings, two commands. The names of the settings are user.name and user.email, ' +
        'and the value goes in quotes after each one.',
      hint2:
        '`git config user.name "Your Name"` and `git config user.email "you@example.com"`',
      why:
        'The author line is what turns a pile of changes into a history a person can read. ' +
        'It is also how you know which commit — and therefore which ISO — came out of whose ' +
        'work, when a build turns up an image nobody expected.',
    }),

    task({
      id: 'stage-a-file',
      prompt:
        'Look at the two files here: profiledef.sh is the start of an ISO profile, and ' +
        'README.txt is a note. Stage profiledef.sh with `git add`. Staging means "this file ' +
        'belongs in my next commit" — it is not a commit yet.',
      check: (s) => {
        const staged = stagedNames(s.sim);
        const committed = committedNames(s.sim);
        if (staged.includes('profiledef.sh') || committed.includes('profiledef.sh')) {
          return ok('');
        }
        return no(
          'profiledef.sh has not been staged yet. `git add profiledef.sh` marks it as "part ' +
          'of the next commit". `git add .` stages everything in the folder you are standing ' +
          'in. Check what you have staged with `git status`.'
        );
      },
      hint:
        'Staging is `git add` followed by the file name. `git status` will then tell you ' +
        'what is waiting to be committed.',
      hint2: '`git add profiledef.sh`',
      why:
        'Staging is where you choose what a commit means. It is the difference between "I ' +
        'edited a file" and "this is the change I am recording", and it is where a careless ' +
        'build gets its wrong contents.',
    }),

    task({
      id: 'make-a-commit',
      prompt:
        'Now record it: `git commit -m "your message here"`. The message is a note to ' +
        'whoever reads the history next, so say what changed and why. Then run `git log` to ' +
        'see your commit sitting in the history.',
      check: (s) => {
        if (!gitHasCommits(s.sim)) {
          return no(
            'There is no commit in the repository yet. Something has to be staged before git ' +
            'can commit it, so if you have not staged anything, `git add profiledef.sh` ' +
            'first. Then `git commit -m "add the profile stub"`.'
          );
        }
        const messages = gitCommitMessages(s.sim);
        const real = messages.some((m) => m && m.trim() && m.trim().toLowerCase() !== 'commit');
        if (!real) {
          return no(
            'Git recorded a commit, but its message is the placeholder "commit" — that is ' +
            'what happens when you commit without giving a message. Stage the file again ' +
            'with `git add profiledef.sh` and commit it with a message of your own: ' +
            '`git commit -m "add the profile stub"`.'
          );
        }
        return ok('');
      },
      hint:
        'The -m flag means "message", and the message goes in quotes right after it. If git ' +
        'says there is nothing to commit, nothing is staged — `git add` the file again.',
      hint2: '`git add profiledef.sh`, then `git commit -m "add the profile stub"`, then `git log`.',
      why:
        'A commit is the unit the build pipeline takes. It has to say what it contains, ' +
        'because the pipeline will be pointed at it by name, and because the next person to ' +
        'change the profile needs to know what they are building on.',
    }),

    task({
      id: 'make-a-branch',
      prompt:
        'You are about to try something, and you want it separate from the main line of ' +
        'work. Make a branch called feature/my-flavour and move onto it — in this terminal, ' +
        '`git branch feature/my-flavour` does both. Then run `git log` again: your history ' +
        'follows you onto the branch.',
      check: (s) => {
        const branch = (s.sim.state.git && s.sim.state.git.branch) || '';
        if (branch && branch !== 'main' && branch !== 'master') return ok('');
        return no(
          'You are still on the main branch. `git branch feature/my-flavour` creates that ' +
          'branch and puts you on it. The name is up to you — the check only cares that you ' +
          'are no longer on main.'
        );
      },
      hint:
        'A branch is a parallel line of work. `git branch` on its own lists the branches; ' +
        '`git branch <name>` makes one, and here it moves you onto it as well.',
      hint2: '`git branch feature/my-flavour`, then `git status` to see where you are.',
      why:
        'A branch is how you try something without breaking what already works. It matters ' +
        'for the pipeline too: many pipelines build the main branch, so work on a branch is ' +
        'work that is not shipped until somebody merges it on purpose.',
    }),

    task({
      id: 'a-change-you-have-not-committed',
      prompt:
        'Now the bit that catches people out. Change one of the two files here — the ' +
        'iso_name line in profiledef.sh is the obvious one; change it to the name of your ' +
        'own ISO — and save it, but do not stage it and do not commit it. Then run ' +
        '`git status` and read what it says about the file.',
      check: (s) => {
        const tracked = new Set(committedNames(s.sim));
        const staged = new Set(stagedNames(s.sim));
        let changedButStaged = [];
        let changedButUntracked = [];
        let changed = [];

        for (const [name, original] of Object.entries(ORIGINALS)) {
          const current = s.sim.readFile('/home/learner/' + name);
          if (current === null || current === original) continue;
          changed.push(name);
          if (staged.has(name)) changedButStaged.push(name);
          else if (!tracked.has(name)) changedButUntracked.push(name);
          else return ok('');
        }

        if (changedButStaged.length) {
          return no(
            changedButStaged.join(' and ') + ' is staged now — `git add` put it there, which ' +
            'means it is waiting for the next commit. Staging is the opposite of what this ' +
            'task is about. This practice terminal has no way to un-stage a file, so change ' +
            'the other file instead and leave that one alone.'
          );
        }
        if (changedButUntracked.length) {
          return no(
            changedButUntracked.join(' and ') + ' has changed, but no commit of yours contains ' +
            'it, so git is not really tracking it — an untracked file and a tracked file you ' +
            'changed are two different things. Commit it once first, then change it again.'
          );
        }
        return no(
          'Both files are still exactly as they were. Open profiledef.sh, change the iso_name ' +
          'line to the name of your own ISO, and save it. `sed -i \'s/myflavour/vesper/\' ' +
          'profiledef.sh` changes the line in place, without staging anything.'
        );
      },
      hint:
        '`sed -i` edits a file in place, without staging it. Then `cat profiledef.sh` to see ' +
        'your change, and `git status` to see what git makes of it.',
      hint2:
        'Any change will do — change the iso_name line to whatever you want to call your ' +
        'ISO image, and leave it unstaged.',
      why:
        'This is the whole reason the lab exists. The build pipeline builds a commit, so a ' +
        'change that is not committed is not in the commit, and therefore not in the ISO. ' +
        'On a real machine `git status` lists that file under "Changes not staged for ' +
        'commit"; this practice terminal only lists what is staged, so what you are looking ' +
        'for is that your file is not among them.',
    }),
  ],

  /**
   * The state a learner who did this properly ends up in.
   *
   * This is the worked example: the commands a person would actually type,
   * in the order they would type them. Note that the changed file is left
   * unstaged on purpose — that is the state the last task is about.
   */
  solution: (s) => {
    s.sim.run('git init');
    s.sim.run('git config user.name "Natalie"');
    s.sim.run('git config user.email "natalie@example.com"');
    s.sim.run('git add profiledef.sh');
    s.sim.run('git commit -m "add the profile stub"');
    s.sim.run('git log');
    s.sim.run('git branch feature/my-flavour');
    s.sim.run("sed -i 's/myflavour/vesper/' profiledef.sh");
    s.sim.run('git status');
  },

  report: {
    lede:
      'You have a repository with a name and an email attached, a commit with a message that ' +
      'says what it contains, a branch to work on, and a change on your disk that is ' +
      'deliberately not in the history yet. That last one is the point of the whole thing: ' +
      'the pipeline builds a commit, so a change that is not committed is a change that ' +
      'never gets built.',
    next:
      'Now you can write a profile that a pipeline can build. The next track is the ISO ' +
      'itself: what a profile is made of, and how the image gets built from it.',
  },
};
