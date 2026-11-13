/**
 * Lesson Zero: what an ISO is, and how to look around a machine.
 *
 * This is the first lab in the academy, and it is written for somebody who
 * has never opened a terminal. Nothing is assumed. Every word of jargon the
 * lab uses is explained before it is used, and every failing check message
 * says what is missing and what to try next.
 *
 * The checks are all against the state of the machine: where the learner is
 * standing, and what files exist. Never against the commands they typed.
 */

import { ok, no, task } from '../assets/checks.js';

const HOME = '/home/learner';

const NOTES = [
  'Bootcamp notes',
  'An ISO image is one file that contains a whole filesystem.',
  'An ISO image can be written to a USB stick and booted on a strange computer.',
  'A profile is the recipe that tells archiso what to put into an ISO image.',
  'The profile has a list of packages, and pacman installs them.',
  '',
].join('\n');

const README = [
  'Welcome to the academy practice machine.',
  'This folder is your home folder.',
  'There is a notes folder here, and it has notes in it.',
  'Start with the notes.',
  '',
].join('\n');

export const zeroWhatIsAnIso = {
  id: 'zero-what-is-an-iso',
  track: 'zero',
  title: 'What an ISO is, and how to look around a machine',
  subtitle: 'Your first terminal: where you are, what is here, and how to read it.',

  scenario:
    'Somebody has handed you a machine and asked a simple question: what is on it? ' +
    'You could poke at it with a mouse, but the honest way to answer — the way every ' +
    'system administrator answers, and the way every person who has built an ISO ' +
    'answers — is to open a terminal and look. This lab is that, once, slowly: you ' +
    'open a terminal, you find out where you are standing, you look at what is here, ' +
    'and you read a file. Later labs build an ISO image on top of exactly these skills, ' +
    'so nothing here is a warm-up for its own sake.',

  teaches:
    'A terminal is a window into a machine. You type a line of text, press Enter, and ' +
    'the machine answers. There is no mouse involved, and nothing is hidden: every word ' +
    'you type does something you can see. A command is one of those lines. It starts with ' +
    'the name of a program, like ls or cat, followed by the words that say what to work ' +
    'on. A command is not a sentence and it needs no punctuation — just the program name, ' +
    'a space, and what you want it to act on. A file path is the name of a file written ' +
    'as a chain of folders separated by slashes. A path that starts with a slash is ' +
    'absolute: it means the same place on the machine no matter where you are standing, ' +
    'so /home/learner always means that one folder. A path without a leading slash is ' +
    'relative: it means "this, starting from the folder you are standing in", so notes ' +
    'means the notes folder inside wherever you happen to be. An ISO image is a single ' +
    'file that contains an entire filesystem — a whole operating system, its programs ' +
    'and its settings, packed into one file you can copy around and write to a USB ' +
    'stick, where it becomes a computer that boots without touching the computer\'s own ' +
    'drive. You would want to build one when you want a system that exists in a form you ' +
    'control: the exact programs, nothing extra, ready to boot on a machine you have ' +
    'never seen. And because an ISO image is just a file, you can keep it in a version ' +
    'history, put it on a server, and hand it to somebody else. A package is one piece ' +
    'of software, packaged up so it can be installed and removed as one unit, and a ' +
    'package manager is the program that does that installing and removing. You do not ' +
    'need to know anything about packages yet. You do need to know that this machine ' +
    'has a file system, folders, and files inside them, because that is what an ISO ' +
    'image is a picture of.',

  readFirst: [
    {
      title: 'The machine in front of you',
      body: [
        'The terminal below is a practice machine. It is a small, honest copy of a ' +
        'Linux machine: it has folders, it has files with text in them, and commands ' +
        'change it for real. Nothing you do in here can break anything on your own ' +
        'computer.',
        'You start in /home/learner. That is your home folder — the folder that belongs ' +
        'to you, in the same way that your own home folder belongs to you. There are two ' +
        'things in it: a README.txt file, and a folder called notes.',
        'If you get lost, or you break something, press "Reset lab". It puts the machine ' +
        'back exactly as it started, and it is always allowed.',
      ],
    },
    {
      title: 'How a command answers you',
      body: [
        'Every command answers in the same shape. First comes output: the normal answer ' +
        'to what you asked. Sometimes there is an error as well, printed underneath. An ' +
        'error is not a punishment and it is not a wrong answer from you — it is the ' +
        'machine telling you that it could not do what you asked, and why.',
        'If you type something the machine does not recognise at all, it says ' +
        '"command not found". That nearly always means one of two things: a typo, or a ' +
        'program that is not installed on this machine.',
        'Errors are part of the lesson, not a detour from it. In later labs the error ' +
        'messages are the most informative thing on the screen.',
      ],
    },
    {
      title: 'Where an ISO comes from',
      body: [
        'An ISO image does not appear on its own. You describe it first, in a plain ' +
        'text file called a profile: what the image is called, what it contains, and ' +
        'which packages go into it. You then hand that description to a tool called ' +
        'archiso, and archiso builds the image from it.',
        'So the path you are on in this lab — a folder of text files that describe ' +
        'something — is the same shape as the thing you will build later. That is why ' +
        'this lab is worth doing slowly.',
      ],
    },
  ],

  env: {
    type: 'terminal',
    prompt:
      'A practice Linux machine. Type a command and press Enter. The tasks are checked ' +
      'against the machine itself, not against the commands you typed.',
    packages: ['base', 'bash'],
    files: {
      '/home/learner/README.txt': README,
      '/home/learner/notes/iso-notes.txt': NOTES,
      '/home/learner/notes/todo.txt': 'Read the boot notes.\nTry a real build one day.\n',
    },
    cwd: HOME,
  },

  tasks: [
    task({
      id: 'find-out-where-you-are',
      prompt:
        'Find out where you are standing. The command that prints this is called pwd. ' +
        'Then save the answer in a file called where-i-am.txt in your home folder.',
      check: (s) => {
        const saved = s.sim.readFile(HOME + '/where-i-am.txt');
        if (saved === null) {
          return no(
            'There is no file called where-i-am.txt in your home folder yet. ' +
            '`pwd` prints the path you are standing in. The `>` symbol means ' +
            '"write the output into this file instead of onto the screen", so ' +
            '`pwd > where-i-am.txt` saves it for you.'
          );
        }
        if (!/learner/.test(saved)) {
          return no(
            'where-i-am.txt exists, but it does not contain the path you found. ' +
            'Copy the whole path that `pwd` printed into the file, not just part of it.'
          );
        }
        return ok('');
      },
      hint:
        'Try `pwd` on its own first and read what it prints. Then try `pwd > where-i-am.txt` ' +
        'and see what happens.',
      hint2:
        'Two steps: `pwd` to see the path, then `pwd > where-i-am.txt` to save that same ' +
        'answer into a file called where-i-am.txt.',
      why:
        'Every other path on this machine is measured from wherever you are standing, so ' +
        'knowing where that is makes every path you use afterwards mean what you think it ' +
        'means. This is the first thing anyone does when they open a terminal on a ' +
        'machine they have never seen.',
    }),

    task({
      id: 'look-around',
      prompt:
        'Now look at what is in this folder. The command that lists what is here is called ' +
        'ls. One of the names it prints is a folder called notes — move into it with cd.',
      check: (s) => {
        if (s.sim.cwd === HOME + '/notes') return ok('');
        return no(
          'You are still standing in ' + s.sim.cwd + '. Run `ls` to see the names of ' +
          'everything in this folder — one of them is `notes` — and then run `cd notes` ' +
          'to move into it.'
        );
      },
      hint:
        '`ls` lists the names of the files and folders in the folder you are standing in. ' +
        '`cd` moves you into one of them.',
      hint2: 'Run `ls` first, look for `notes`, then `cd notes`.',
      why:
        'Listing tells you what you could open. Changing folder tells you what you will ' +
        'open by default. A path like `notes` only means something because you know where ' +
        'you are standing — that is why the first task came before this one.',
    }),

    task({
      id: 'find-the-answer',
      prompt:
        'Open iso-notes.txt in this folder and find the line that says what an ISO image ' +
        'is. Copy that line into a new file called answer.txt that lives in your home ' +
        'folder: /home/learner/answer.txt.',
      check: (s) => {
        const answer = s.sim.readFile(HOME + '/answer.txt');
        if (answer === null) {
          return no(
            'There is no answer.txt in your home folder yet. The line you are after starts ' +
            '"An ISO image is one file that contains a whole filesystem." You can pull that ' +
            'one line out with ' +
            '`grep "ISO image is one file" iso-notes.txt > /home/learner/answer.txt`.'
          );
        }
        if (!/iso image is one file/i.test(answer)) {
          return no(
            'answer.txt is there, but it does not contain the line about what an ISO image ' +
            'is yet. The line begins "An ISO image is one file that contains a whole ' +
            'filesystem." Copy that whole line into the file.'
          );
        }
        return ok('');
      },
      hint:
        '`cat iso-notes.txt` shows you the whole file. `grep` picks out only the lines you ' +
        'ask for. And because you are standing in the notes folder, the answer file needs ' +
        'its full path — /home/learner/answer.txt — to land in your home folder.',
      hint2:
        '`grep "ISO image is one file" iso-notes.txt > /home/learner/answer.txt` writes just ' +
        'that one line into the file.',
      why:
        'Reading is the skill; the file is only proof that you did it. Copying a line out of ' +
        'one file and into another is the most common thing anyone ever does in a shell, ' +
        'and it is exactly how a profile gets built out of pieces.',
    }),

    task({
      id: 'make-a-folder',
      prompt:
        'Make a folder for your own notes, called my-notes, in your home folder — the same ' +
        'place where where-i-am.txt is. You are standing in the notes folder, so this is a ' +
        'good moment to use a full path.',
      check: (s) => {
        const entry = s.sim.fs.get(HOME + '/my-notes');
        if (entry && entry.dir) return ok('');
        return no(
          'There is no my-notes folder in ' + HOME + ' yet. You are standing in ' + s.sim.cwd +
          ', so `mkdir my-notes` would make ' + s.sim.cwd + '/my-notes instead. A path that ' +
          'starts with a slash always means the same place: `mkdir /home/learner/my-notes`.'
        );
      },
      hint:
        'A path that starts with a slash is absolute — the same folder wherever you stand. ' +
        'A path without one is relative — "inside wherever you are now", which right now ' +
        'is the notes folder.',
      hint2: '`mkdir /home/learner/my-notes`',
      why:
        'When you build an ISO, the shape of your folders is the shape of the image. ' +
        'Knowing which of the two kinds of path you just used is the difference between a ' +
        'folder in the right place and a folder you cannot find later.',
    }),

    task({
      id: 'your-first-note',
      prompt:
        'Put something in your new folder: a file called first-note.txt inside my-notes. ' +
        'Copy the notes file into it to get started, then read your copy back with cat so ' +
        'you know it really arrived.',
      check: (s) => {
        const mine = s.sim.readFile(HOME + '/my-notes/first-note.txt');
        if (mine === null) {
          return no(
            'There is no first-note.txt in your new folder yet. `cp` makes a copy of a ' +
            'file: `cp /home/learner/notes/iso-notes.txt /home/learner/my-notes/first-note.txt`.'
          );
        }
        const lines = mine.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          return no(
            'Your note is only one line long. Copy the notes file in to get a starting ' +
            'point, and then add a line of your own on the end with ' +
            '`echo "my note" >> /home/learner/my-notes/first-note.txt`.'
          );
        }
        if (!/iso/i.test(mine) && !/learner/i.test(mine)) {
          return no(
            'Your note has some lines in it, but it does not look like the notes you ' +
            'copied and it does not mention this machine. The easiest route is to copy the ' +
            'notes file in with ' +
            '`cp /home/learner/notes/iso-notes.txt /home/learner/my-notes/first-note.txt` — ' +
            'then it is there, and you can change it afterwards.'
          );
        }
        return ok('');
      },
      hint:
        '`cp` copies one file to another name and leaves the original alone. `cat` prints a ' +
        'file back to you. Use the full paths for both, because the folder you are standing ' +
        'in is not the folder you are writing to.',
      hint2:
        '`cp /home/learner/notes/iso-notes.txt /home/learner/my-notes/first-note.txt`, then ' +
        '`cat /home/learner/my-notes/first-note.txt`.',
      why:
        'This is the whole loop of the lab: look, read, copy, read back. Reading a file ' +
        'back is how you confirm it is really there instead of trusting that it is. Later in ' +
        'the academy, the file you write will be a profile, and the profile is what becomes ' +
        'the ISO.',
    }),
  ],

  /**
   * The state a learner who did this properly ends up in.
   *
   * This is the worked example: the commands a person would actually type,
   * in the order they would type them.
   */
  solution: (s) => {
    s.sim.run('pwd');
    s.sim.run('pwd > where-i-am.txt');
    s.sim.run('ls');
    s.sim.run('cd notes');
    s.sim.run('grep "ISO image is one file" iso-notes.txt > /home/learner/answer.txt');
    s.sim.run('mkdir /home/learner/my-notes');
    s.sim.run('cp /home/learner/notes/iso-notes.txt /home/learner/my-notes/first-note.txt');
    s.sim.run('cat /home/learner/my-notes/first-note.txt');
  },

  report: {
    lede:
      'You opened a terminal on a machine you had never seen and you found out what was on ' +
      'it: where you were, what was in the folder, what the notes said, and what you could ' +
      'put somewhere new. Those five moves — look, list, read, make, write — are the whole ' +
      'of working in a shell. An ISO image is built out of exactly them.',
    next:
      'Your profile is a list of packages, and something has to read that list. That is the ' +
      'next lab: pacman, the program that installs and removes software on Arch Linux.',
  },
};
