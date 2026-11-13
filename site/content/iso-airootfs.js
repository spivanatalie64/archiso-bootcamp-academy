/**
 * Lab 03 — the airootfs overlay.
 *
 * One fact explains the whole lab: the contents of airootfs/ are copied onto the
 * image's root filesystem BEFORE the packages are installed. Files you drop in
 * arrive as 644 owned by root, and a file that a package also owns ends up
 * being replaced by that package.
 */

import {
  task, ok, no, fileExists, fileMatches,
} from '../assets/checks.js';

const PROFILE = 'profiledef.sh';
const MOTD = 'airootfs/etc/motd';
const SCRIPT = 'airootfs/usr/local/bin/hello';
const RELEASE = 'airootfs/etc/vesper-release';
const RUNTIME_PACMAN = 'airootfs/etc/pacman.conf';

/**
 * Write a solution's files into the environment.
 *
 * The verifier applies the returned map itself; doing it here as well means
 * the lab is honest either way — the simulator's filesystem and the editor's
 * text end up holding the same contents.
 */
function applySolution(state, files) {
  if (!state) return;
  if (state.sim && typeof state.sim.writeFile === 'function') {
    for (const [path, content] of Object.entries(files)) {
      state.sim.writeFile(path, content);
    }
  }
  if (state.editor && typeof state.editor === 'object') {
    for (const [path, content] of Object.entries(files)) {
      state.editor[path] = content;
    }
  }
}

export const isoAirootfs = {
  id: 'iso-airootfs',
  track: 'iso',
  title: 'The airootfs overlay',
  subtitle: 'Your own files, on the image, before the packages arrive.',

  scenario:
    'You want the image to greet people by name, to ship a script of your own, and ' +
    'to have a password file nobody else can read. None of that needs a package. ' +
    'All of it is one directory: airootfs/. This is the cheapest customisation ' +
    'archiso offers, and it comes with three rules that are worth learning properly ' +
    'the first time rather than the third time.',

  teaches:
    '`airootfs/` is an overlay. The whole directory is copied onto the image\'s root ' +
    'filesystem, and the path inside the overlay is the path on the image — ' +
    'airootfs/etc/motd becomes /etc/motd.\n\n' +
    'The copying happens BEFORE the packages are installed. That single fact explains ' +
    'three things. First, you can drop any file you like onto the image without ' +
    'packaging anything. Second, the copy does not carry permissions or ownership: ' +
    'everything arrives as mode 644, owned by root — so a script you drop in cannot ' +
    'be run, and the only way to give it an executable bit is the `file_permissions` ' +
    'array in profiledef.sh. Third, a file that a package also owns gets replaced by ' +
    'that package, because the package is installed afterwards and wins. There are ' +
    'exceptions — /etc/pacman.conf is one of them — and the exception is that pacman ' +
    'treats it as a backup file: it leaves your copy alone and puts the packaged one ' +
    'beside it as /etc/pacman.conf.pacnew.',

  readFirst: [
    {
      title: 'Why the copy is not a copy',
      body: [
        'archiso copies the overlay into the work directory and then installs the ' +
        'packages on top of it. It does not preserve what your files looked like on ' +
        'your disk: modes are reset to 644 for files and 755 for directories, and ' +
        'everything is owned by root.',
        'So if you want a file with a different owner or mode, you cannot do it by ' +
        'setting it in your working directory. You list it in profiledef.sh under ' +
        'file_permissions, as an associative array of path to owner UID, owner GID ' +
        'and mode: ["/etc/shadow"]="0:0:400".',
      ],
    },
    {
      title: 'Which files the packages take back',
      body: [
        'If you drop a file at a path that a package also owns, the package wins — it ' +
        'is installed after your copy, and it overwrites it.',
        'Some files are exempt. A package can declare a file a backup file, and ' +
        'pacman then refuses to overwrite a version that is already on disk; it puts ' +
        'the packaged version alongside it with a .pacnew suffix. /etc/pacman.conf ' +
        'is one of these, which is exactly why a profile can carry its own pacman ' +
        'configuration in the overlay.',
      ],
    },
  ],

  env: {
    type: 'editor',
    prompt:
      'The profile and its overlay, open. The overlay files that are empty are ones ' +
      'you are meant to fill in.',
    files: {
      'profiledef.sh': `#!/usr/bin/env bash
# shellcheck disable=SC2034
#
# Vesper — the profile definition.

iso_name="vesper"
iso_label="VESPER_202611"
iso_publisher="Vesper Linux Project"
iso_application="Vesper Linux Live/Install"
iso_version="2026.11.10"

install_dir="vesper"

bootmodes=('bios.syslinux'
           'uefi.grub')

pacman_conf="pacman.conf"

airootfs_image_type="squashfs"

# Files that need an owner or a mode that the overlay cannot carry.
#
# Everything copied out of airootfs/ arrives as 644, owned by root, with no
# executable bit. The only way to give a file something else is to list it
# here, as path -> "owner UID : owner GID : mode".
file_permissions=(
)
`,
      'airootfs/etc/motd': `Welcome to the image.

This message is printed the first time somebody logs in.
`,
      'airootfs/usr/local/bin/hello': ``,
      'airootfs/etc/vesper-release': ``,
      'airootfs/etc/pacman.conf': ``,
    },
    cwd: '/home/learner',
  },

  tasks: [
    task({
      id: 'overlay-file',
      prompt:
        'Put a file of your own on the image. Write `airootfs/etc/vesper-release` so ' +
        'that it says something like `vesper 2026.11.10` — a release file, so ' +
        'somebody inside the running system can tell what they booted.',
      check: (s) => {
        if (!fileExists(s.sim, RELEASE)) {
          return no('airootfs/etc/vesper-release does not exist. Remember that the ' +
            'editor can only change files that are already here — this one is ' +
            'open and empty, waiting for you.');
        }
        if (!fileMatches(s.sim, RELEASE, 'vesper', 'i')) {
          return no('airootfs/etc/vesper-release does not mention Vesper. On the ' +
            'image this file becomes /etc/vesper-release, and it will read whatever ' +
            'you put in it.');
        }
        return ok('');
      },
      hint:
        'The file is open above, empty. Type into it. The path in the profile is ' +
        'airootfs/etc/vesper-release; on the image it is /etc/vesper-release.',
      hint2:
        'A single line such as: vesper 2026.11.10',
      why:
        'This is the overlay doing the one thing it is best at: putting a file of ' +
        'yours on the image without packaging anything. The path inside the overlay ' +
        'is the path on the image, so the directory structure you see in the profile ' +
        'is the directory structure of the finished system.',
    }),

    task({
      id: 'motd',
      prompt:
        'The message a user reads the first time they log in is `/etc/motd`. Yours ' +
        'still says "Welcome to the image". Rewrite `airootfs/etc/motd` so it ' +
        'welcomes them to Vesper.',
      check: (s) => {
        if (!fileMatches(s.sim, MOTD, 'vesper', 'i')) {
          return no('airootfs/etc/motd does not mention Vesper. This file is copied ' +
            'onto the image as /etc/motd and printed when somebody logs in — it is ' +
            'the first thing your flavour says about itself.');
        }
        return ok('');
      },
      hint:
        'Change the first line so it says Welcome to Vesper.',
      hint2:
        'Something like: Welcome to Vesper — a live image of your own making.',
      why:
        'The motd is the cheapest personality a distribution has. It costs one file ' +
        'in the overlay, it survives every rebuild, and it is the difference between ' +
        'an image that looks like Arch and an image that looks like yours.',
    }),

    task({
      id: 'script',
      prompt:
        'Write a script. It belongs at `airootfs/usr/local/bin/hello`, so on the image ' +
        'it will be /usr/local/bin/hello. It needs a shebang line — the first line ' +
        'of the file, saying which shell runs it — and it should print a greeting ' +
        'that mentions Vesper.',
      check: (s) => {
        if (!fileExists(s.sim, SCRIPT)) {
          return no('airootfs/usr/local/bin/hello is gone. The path inside the ' +
            'overlay is the path on the image, and /usr/local/bin is on the PATH ' +
            'in most shells.');
        }
        const content = s.sim.readFile(SCRIPT) || '';
        if (!/^#!.*\b(?:ba)?sh\b/m.test(content)) {
          return no('The script has no shebang line. The kernel does not guess how to ' +
            'run a file: without a line starting with #! telling it which ' +
            'interpreter to use, trying to run it gives "exec format error". Start ' +
            'the file with #!/usr/bin/env bash or #!/bin/sh.');
        }
        if (!/vesper/i.test(content)) {
          return no('The script does not mention Vesper. It should print a greeting ' +
            'that says which image it came from.');
        }
        return ok('');
      },
      hint:
        'The first line of the file starts with #! and names a shell. The rest is ' +
        'ordinary shell.',
      hint2:
        'Something like: #!/usr/bin/env bash — then an echo line that mentions ' +
        'Vesper.',
      why:
        'A shebang is not a comment. It is the kernel\'s instruction sheet: the ' +
        'first two bytes of an executable tell the kernel which program to hand the ' +
        'file to. It is the one line that turns a text file into a program, and ' +
        'nothing else in the file substitutes for it.',
    }),

    task({
      id: 'executable-bit',
      prompt:
        'The script is still not runnable, and the overlay cannot fix that by itself: ' +
        'files copied out of airootfs/ arrive as 644 — readable, not executable. Give ' +
        'it the executable bit in `profiledef.sh`, under `file_permissions`. It ' +
        'should end up as 755.',
      check: (s) => {
        const content = s.sim.readFile(PROFILE) || '';
        const entry = /\[\s*["']\/?usr\/local\/bin\/hello["']?\s*\]\s*=\s*["'][^"']*755[^"']*["']/;
        if (entry.test(content)) return ok('');
        const mentioned = /\/usr\/local\/bin\/hello/.test(content);
        if (mentioned) {
          return no('profiledef.sh mentions /usr/local/bin/hello, but the mode is ' +
            'not 755. The three parts of the value are owner UID, owner GID and ' +
            'mode — it has to end in 755 for the kernel to be allowed to run it.');
        }
        return no('profiledef.sh does not say anything about /usr/local/bin/hello. ' +
          'Everything copied out of airootfs/ arrives as 644 and owned by root, ' +
          'whatever mode it had in your working directory, so the executable bit has ' +
          'to be set here instead. Add it to the file_permissions array: ' +
          '["/usr/local/bin/hello"]="0:0:755"');
      },
      hint:
        'Look at the file_permissions array in profiledef.sh. It is an associative ' +
        'array: a path in square brackets, then the mode after an equals sign.',
      hint2:
        'Inside file_permissions=( ... ), add: ["/usr/local/bin/hello"]="0:0:755"',
      why:
        'The overlay copy deliberately throws away ownership and permissions — files ' +
        'become 644 and directories 755, all owned by root — because a profile is ' +
        'usually a git checkout, and git does not carry those things between ' +
        'machines. The consequence is that a script in the overlay cannot be run ' +
        'until file_permissions says so. The three fields are owner UID, owner GID ' +
        'and mode; 0:0 is root:root, and 755 is the usual mode for something ' +
        'everybody may run.',
    }),

    task({
      id: 'private-file',
      prompt:
        'The same mechanism, for a file that must not be world-readable. ' +
        '`/etc/shadow` holds the hashed passwords. List it in `file_permissions` in ' +
        '`profiledef.sh` with the mode 400.',
      check: (s) => {
        const content = s.sim.readFile(PROFILE) || '';
        const entry = /\[\s*["']\/?etc\/shadow["']?\s*\]\s*=\s*["'][^"']*400[^"']*["']/;
        if (entry.test(content)) return ok('');
        if (/\/etc\/shadow/.test(content)) {
          return no('profiledef.sh mentions /etc/shadow, but not with the mode 400. ' +
            '400 means the owner may read it and nobody else may even look at it.');
        }
        return no('profiledef.sh does not list /etc/shadow. Left alone, the overlay ' +
          'copy arrives as 644 — world-readable — and /etc/shadow holds the hashed ' +
          'passwords. It has to be 400: readable by root only. Add ' +
          '["/etc/shadow"]="0:0:400" to file_permissions.');
      },
      hint:
        'Same array, same shape as the one you just added. The path is /etc/shadow ' +
        'and the mode is 400.',
      hint2:
        'Add: ["/etc/shadow"]="0:0:400"',
      why:
        '644 on a password file means every account on the system can read the ' +
        'hashes, which is exactly what you do not want. 400 is the mode for ' +
        'root-only-and-readable. Setting it here means it is right on every build, ' +
        'including the ones somebody else runs from their own checkout of your ' +
        'profile.',
    }),

    task({
      id: 'backup-file',
      prompt:
        'One more overlay file. Write `airootfs/etc/pacman.conf` — the pacman ' +
        'configuration for the RUNNING image — with a first line that reads ' +
        '`# Vesper runtime pacman config`, and a `[core]` section underneath with a ' +
        '`Server = https://…` line naming your mirror.',
      check: (s) => {
        if (!fileExists(s.sim, RUNTIME_PACMAN)) {
          return no('airootfs/etc/pacman.conf has gone missing.');
        }
        const content = s.sim.readFile(RUNTIME_PACMAN) || '';
        if (!/Vesper runtime pacman config/i.test(content)) {
          return no('airootfs/etc/pacman.conf does not carry the marker line. It ' +
            'should start with a comment reading: # Vesper runtime pacman config');
        }
        if (!/^\s*Server\s*=\s*https?:\/\/\S+/m.test(content)) {
          return no('airootfs/etc/pacman.conf has no Server line, so the running ' +
            'image does not know where to fetch from. Give it a [core] section with ' +
            'a Server line, for example: ' +
            'Server = https://geo.mirror.pkgbuild.com/$repo/os/$arch');
        }
        return ok('');
      },
      hint:
        'The file is open above and empty. A comment starts with a #. Under [core], ' +
        'a Server line gives the mirror.',
      hint2:
        'Something like: # Vesper runtime pacman config — then [core] and a ' +
        'Server = https://… line.',
      why:
        'You might expect the pacman package to overwrite this file, because the ' +
        'package is installed after your copy is laid down — and for most files it ' +
        'does. /etc/pacman.conf is one of the exceptions: pacman declares it a ' +
        'backup file, so when a version is already on disk it leaves yours alone and ' +
        'puts the packaged one next to it as /etc/pacman.conf.pacnew. That is why a ' +
        'profile can carry its own runtime configuration, and it is also why the ' +
        'leftover .pacnew file is worth opening and reading rather than deleting.',
    }),
  ],

  /**
   * The state a learner who did this properly ends up in.
   *
   * The verifier applies this and asserts that every task then passes, and that
   * no task was already satisfied before the learner started. It is also the
   * worked example the lab report can offer.
   *
   * Every file a check reads is returned here: the overlay files and the
   * profiledef.sh that carries the file_permissions the overlay cannot.
   */
  solution: (s) => {
    const files = {
      'profiledef.sh': `#!/usr/bin/env bash
# shellcheck disable=SC2034
#
# Vesper — the profile definition.

iso_name="vesper"
iso_label="VESPER_202611"
iso_publisher="Vesper Linux Project"
iso_application="Vesper Linux Live/Install"
iso_version="2026.11.10"

install_dir="vesper"

bootmodes=('bios.syslinux'
           'uefi.grub')

pacman_conf="pacman.conf"

airootfs_image_type="squashfs"

# Files that need an owner or a mode that the overlay cannot carry.
#
# Everything copied out of airootfs/ arrives as 644, owned by root, with no
# executable bit. The only way to give a file something else is to list it
# here, as path -> "owner UID : owner GID : mode".
file_permissions=(
  ["/usr/local/bin/hello"]="0:0:755"
  ["/etc/shadow"]="0:0:400"
)
`,
      'airootfs/etc/motd': `Welcome to Vesper.

This message is printed the first time somebody logs in.
`,
      'airootfs/usr/local/bin/hello': `#!/usr/bin/env bash
echo "Hello from Vesper"
`,
      'airootfs/etc/vesper-release': `vesper 2026.11.10
`,
      'airootfs/etc/pacman.conf': `#
# Vesper runtime pacman config
#
# /etc/pacman.conf is a backup file, so the pacman package leaves this one
# alone and puts its own version beside it as /etc/pacman.conf.pacnew.

[options]
Architecture = auto
HoldPkg     = pacman glibc
ParallelDownloads = 5
SigLevel    = Required DatabaseOptional
LocalFileSigLevel = Optional

[core]
Server = https://geo.mirror.pkgbuild.com/$repo/os/$arch

[extra]
Server = https://geo.mirror.pkgbuild.com/$repo/os/$arch
`,
    };
    applySolution(s, files);
    return files;
  },

  report: {
    lede:
      'You have used the overlay for what it is good at — putting your own files on ' +
      'the image — and you have learned its two sharp edges. Permissions do not come ' +
      'with the copy; they come from file_permissions in profiledef.sh. And the ' +
      'packages are installed after your files, so a file they own is theirs unless ' +
      'it is a backup file.',
    next:
      'Next: boot loaders — how the profile says which machines the image can boot ' +
      'on, and how the menu is written.',
  },
};
