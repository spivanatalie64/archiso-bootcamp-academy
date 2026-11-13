/**
 * Lab 02 — the package list and the pacman configuration.
 *
 * Two lessons that are usually taught as one and understood as none: the
 * package list is a pacman list, and there are TWO pacman configurations —
 * one for the build, one inside the running image.
 */

import {
  task, ok, no, fileExists, fileMatches,
} from '../assets/checks.js';

const PACKAGES = 'packages.x86_64';
const BUILD_PACMAN = 'pacman.conf';
const RUNTIME_PACMAN = 'airootfs/etc/pacman.conf';

/** Split a pacman.conf into sections. Returns { name: [lines] }. */
function sections(content) {
  const out = {};
  let current = null;
  for (const line of String(content || '').split('\n')) {
    const header = line.match(/^\s*\[([^\]]+)\]/);
    if (header) {
      current = header[1].trim();
      if (!out[current]) out[current] = [];
      continue;
    }
    if (current) out[current].push(line);
  }
  return out;
}

/** The mirror hosts named by Server lines in a list of lines. */
function hosts(lines) {
  const out = new Set();
  for (const line of lines || []) {
    const m = line.match(/^\s*Server\s*=\s*https?:\/\/([^/\s]+)/);
    if (m) out.add(m[1]);
  }
  return out;
}

/** Every host named anywhere in a pacman.conf. */
function allHosts(content) {
  const out = new Set();
  for (const line of String(content || '').split('\n')) {
    const m = line.match(/^\s*Server\s*=\s*https?:\/\/([^/\s]+)/);
    if (m) out.add(m[1]);
  }
  return out;
}

/** True if the file pulls its servers in with a relative Include. */
function hasRelativeInclude(content) {
  return String(content || '')
    .split('\n')
    .some((line) => /^\s*Include\s*=\s*[^/\s]/.test(line));
}

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

export const isoPackagesAndPacman = {
  id: 'iso-packages-and-pacman',
  track: 'iso',
  title: 'Packages and pacman configuration',
  subtitle: 'What goes into the image, and where it comes from.',

  scenario:
    'A profile with the right shape still builds the wrong image if the package list ' +
    'is wrong or the mirrors are wrong. And the failure is quiet: the build succeeds, ' +
    'the ISO boots, and six months later somebody asks why their machine pulled its ' +
    'packages from a mirror the project never chose. This lab is about the two files ' +
    'that decide what is inside the image and where it came from.',

  teaches:
    'The file `packages.x86_64` is a pacman list — one package per line, exactly the ' +
    'kind of list you would hand to `pacman -S`. A line starting with # is a comment ' +
    'and is ignored, and so are blank lines. Two packages are not optional: ' +
    '`mkinitcpio`, which builds the initramfs, and `mkinitcpio-archiso`, which teaches ' +
    'that initramfs how to find the root filesystem on the disc. Without the second ' +
    'one you have no bootable image, whatever else is right.\n\n' +
    'The pacman configuration decides where those packages come from. Here is the ' +
    'part that catches everybody: there are TWO pacman configurations, and they are ' +
    'different files. The profile\'s `pacman.conf` governs the BUILD — mkarchiso ' +
    'reads it and pacstrap uses it to fill the image. The file at ' +
    '`airootfs/etc/pacman.conf` is the one inside the RUNNING IMAGE — it is what ' +
    'pacman reads once somebody boots your ISO and installs something. They can point ' +
    'at different mirrors, and if they do, the image you tested is not the image ' +
    'people get.',

  readFirst: [
    {
      title: 'The rule about relative Include',
      body: [
        'pacman resolves a relative `Include` against the directory you are standing in ' +
        'when you run it — not against the directory the file containing the Include ' +
        'lives in. So a profile whose pacman.conf says `Include = mirrorlist` builds ' +
        'happily if you happen to be standing in a directory that has a mirrorlist in ' +
        'it, and fails if you are not. A profile must not depend on the directory ' +
        'somebody happened to be in, so the servers are written out in full.',
      ],
    },
    {
      title: 'What the two configurations are for',
      body: [
        'Build time: the profile\'s pacman.conf. This decides which mirror your ' +
        'packages are downloaded from while the image is assembled.',
        'Run time: airootfs/etc/pacman.conf. This decides which mirror the running ' +
        'image fetches from later, when somebody installs a package inside it.',
        'The build one is a file in your profile. The runtime one is a file you drop ' +
        'into the overlay, and it is the overlay that puts it inside the image.',
      ],
    },
  ],

  env: {
    type: 'editor',
    prompt:
      'Three files, open. Edit them; the tasks are checked against what they now say.',
    files: {
      'packages.x86_64': `# Packages installed into the Vesper image.
#
# One package per line. Blank lines and lines starting with # are ignored.

base
linux
mkinitcpio

# Boot loaders, matched to the bootmodes in profiledef.sh.
syslinux
grub

# A text editor, so the image is usable from a serial console.
vim

# Enough tooling to look around at what the image actually contains.
tree
file
`,
      'pacman.conf': `#
# Vesper — build-time pacman configuration.
#
# THIS file governs the build. mkarchiso reads it and hands the result to
# pacstrap to fill the image's root filesystem. Whatever mirrors are named
# here are the mirrors the packages come from.
#
# The image's own configuration is a different file: airootfs/etc/pacman.conf.

[options]
Architecture = auto
HoldPkg     = pacman glibc
ParallelDownloads = 5
#SigLevel    = Required DatabaseOptional
LocalFileSigLevel = Optional

[core]
Include = mirrorlist

[extra]
Include = mirrorlist
`,
      'airootfs/etc/pacman.conf': `#
# Vesper — runtime pacman configuration.
#
# This is the file the RUNNING image reads. It is not the file above.

[options]
Architecture = auto
HoldPkg     = pacman glibc
ParallelDownloads = 5
SigLevel    = Required DatabaseOptional
LocalFileSigLevel = Optional

[core]
Server = https://mirror.rackspace.com/archlinux/$repo/os/$arch

[extra]
Server = https://mirror.rackspace.com/archlinux/$repo/os/$arch
`,
    },
    cwd: '/home/learner',
  },

  tasks: [
    task({
      id: 'add-package',
      prompt:
        'Add `nano` to the package list. The list is a pacman list: one package per ' +
        'line, and the line is nothing but the package name.',
      check: (s) => {
        if (fileMatches(s.sim, PACKAGES, '^\\s*nano\\s*$', 'm')) return ok('');
        if (fileMatches(s.sim, PACKAGES, 'nano', 'i')) {
          return no('nano is mentioned in packages.x86_64, but not on a line of its ' +
            'own. archiso reads one package per line — the whole line is the package ' +
            'name, so "nano  # the editor" would be read as a package called ' +
            '"nano  # the editor" and the build would fail.');
        }
        return no('packages.x86_64 has no line that is exactly `nano`. Add it as its ' +
          'own line — one package per line, and nothing else on the line.');
      },
      hint:
        'Look at the shape of the other entries. A package is a line containing just ' +
        'the name.',
      hint2:
        'Add a line reading exactly: nano',
      why:
        'The package list is the contents of the image, and it is handed to pacman ' +
        'almost verbatim. That is why the format is strict: one name per line, ' +
        'nothing else. A trailing comment on the same line is not a comment to ' +
        'pacman — it is part of the name.',
    }),

    task({
      id: 'remove-package',
      prompt:
        'Take `vim` out of the image. This time, remove the line entirely rather than ' +
        'commenting it out.',
      check: (s) => {
        if (!fileMatches(s.sim, PACKAGES, '^\\s*#?\\s*vim\\s*$', 'm')) return ok('');
        return no('vim is still in packages.x86_64, either as a package or as a ' +
          'commented-out line. This task is about removing it outright: delete the ' +
          'whole line, so the file does not mention it at all.');
      },
      hint:
        'Find the line that says vim and delete it, rather than putting a # in front.',
      hint2:
        'The line "vim" should be gone from the file entirely.',
      why:
        'Commenting a package out and deleting it have the same effect on the build — ' +
        'both stop it being installed — but they mean different things to the next ' +
        'person who reads the profile. A deleted line says "we do not want this". A ' +
        'commented line says "we had this once".',
    }),

    task({
      id: 'comment-package',
      prompt:
        'Now do it the other way round: keep `tree` in the file, but stop it being ' +
        'installed. Put a `#` in front of the line.',
      check: (s) => {
        if (fileMatches(s.sim, PACKAGES, '^\\s*#\\s*tree\\s*$', 'm')) return ok('');
        if (!fileMatches(s.sim, PACKAGES, '^\\s*tree\\s*$', 'm')) {
          return no('The `tree` line is gone from packages.x86_64. This task is about ' +
            'commenting it out, not deleting it — the line should still be there, ' +
            'with a # in front of it.');
        }
        return no('tree is still installed. archiso and pacman both ignore anything ' +
          'after a #, so a commented package is not installed even though it is still ' +
          'in the file. Put a # in front of the tree line.');
      },
      hint:
        'The # goes at the very start of the line, before the package name.',
      hint2:
        'The line should read: #tree',
      why:
        'A # at the start of a line turns a package into a comment. Archiso skips ' +
        'comment lines and blank lines, so the package is not installed — which is ' +
        'how you keep a note about a package you tried without carrying it into ' +
        'every build.',
    }),

    task({
      id: 'mandatory-packages',
      prompt:
        'Two packages in this list are not optional. `mkinitcpio` is here; ' +
        '`mkinitcpio-archiso` is missing. Add it, because without it the image does ' +
        'not boot.',
      check: (s) => {
        if (!fileMatches(s.sim, PACKAGES, '^\\s*mkinitcpio\\s*$', 'm')) {
          return no('mkinitcpio is not in packages.x86_64. It is the tool that builds ' +
            'the initramfs — the small filesystem the kernel unpacks into before it ' +
            'can mount the image. Without it there is no initramfs, and without an ' +
            'initramfs there is no boot.');
        }
        if (fileMatches(s.sim, PACKAGES, '^\\s*mkinitcpio-archiso\\s*$', 'm')) {
          return ok('');
        }
        return no('mkinitcpio-archiso is not in packages.x86_64. It is the one package ' +
          'here that is genuinely mandatory: it is the hook that teaches the ' +
          'initramfs how to find the root filesystem on the disc. Without it the ' +
          'machine boots and then cannot mount anything, and the image is not ' +
          'bootable no matter what else is right.');
      },
      hint:
        'It goes in the list like any other package. Its name has a hyphen in it.',
      hint2:
        'Add a line reading exactly: mkinitcpio-archiso',
      why:
        'mkinitcpio builds the initramfs — the small filesystem the kernel unpacks ' +
        'into before the real root filesystem is available. mkinitcpio-archiso is the ' +
        'archiso-specific part of that: it knows about the medium. Its absence is ' +
        'the classic archiso failure, and it is quiet — the image builds fine and ' +
        'fails at boot.',
    }),

    task({
      id: 'siglevel',
      prompt:
        'In the build\'s `pacman.conf`, the signature policy is commented out. Write ' +
        'it out: `SigLevel = Required DatabaseOptional`.',
      check: (s) => {
        if (fileMatches(s.sim, BUILD_PACMAN, '^\\s*SigLevel\\s*=\\s*Required\\b', 'm')) {
          return ok('');
        }
        const commented = fileMatches(s.sim, BUILD_PACMAN, '^\\s*#\\s*SigLevel', 'm');
        return no(commented
          ? 'The SigLevel line in pacman.conf is still commented out. SigLevel is ' +
            'pacman\'s signature policy: which packages it will accept without a ' +
            'valid signature from a trusted key. Writing it out means the build says ' +
            'what it will accept instead of inheriting the default — or a different ' +
            'default on the machine that happens to do the build.'
          : 'pacman.conf does not set SigLevel. It is the signature policy: which ' +
            'packages pacman will accept without a valid signature from a trusted ' +
            'key. Add a line reading: SigLevel = Required DatabaseOptional');
      },
      hint:
        'Find the line in pacman.conf that starts with #SigLevel and take the # off.',
      hint2:
        'The line should read: SigLevel = Required DatabaseOptional',
      why:
        'SigLevel tells pacman how much signature checking to do. Required means a ' +
        'package must be signed by a key in the trusted keyring; DatabaseOptional ' +
        'means the repository databases may be unsigned. Writing the policy out in ' +
        'the profile means the build behaves the same way on every machine, instead ' +
        'of depending on what the build host happens to have configured.',
    }),

    task({
      id: 'write-mirrors-out',
      prompt:
        'The build\'s `pacman.conf` pulls its servers in with `Include = mirrorlist`. ' +
        'That does not work in a profile: pacman resolves a relative Include against ' +
        'the directory you are standing in, not the directory the file lives in. So ' +
        'the same profile builds from one directory and fails from another. Write the ' +
        'servers out in full instead — a `Server = https://…` line under [core] and ' +
        'one under [extra].',
      check: (s) => {
        const content = s.sim.readFile(BUILD_PACMAN) || '';
        if (hasRelativeInclude(content)) {
          return no('pacman.conf still pulls its servers in with a relative Include. ' +
            'pacman resolves a relative Include against the directory you are standing ' +
            'in when you run it, not against the directory the file lives in — so the ' +
            'profile builds from one directory and fails from another. A profile must ' +
            'not depend on the invoking directory. Write the servers out: a ' +
            '`Server = https://…` line under [core] and one under [extra].');
        }
        const sec = sections(content);
        if (!hosts(sec.core).size) {
          return no('There is no Server line under [core]. Without one, pacman has ' +
            'nowhere to fetch the core repository from and the build stops at the ' +
            'first download. Write it out in full, for example: ' +
            'Server = https://geo.mirror.pkgbuild.com/$repo/os/$arch');
        }
        if (!hosts(sec.extra).size) {
          return no('There is no Server line under [extra]. The core repository is ' +
            'only part of Arch — most of what people want is in extra. Add a ' +
            '`Server = https://…` line under [extra] as well.');
        }
        return ok('');
      },
      hint:
        'Delete the Include lines and put a Server line under each repository ' +
        'heading. The $repo and $arch in the URL are variables pacman fills in.',
      hint2:
        'Under [core]: Server = https://geo.mirror.pkgbuild.com/$repo/os/$arch — and ' +
        'the same under [extra].',
      why:
        'A relative Include makes the profile depend on where it is being built from. ' +
        'The same profile that built on a machine with a mirrorlist in its working ' +
        'directory fails on the next machine, and the error is about a missing file ' +
        'rather than about the profile, which is a miserable thing to debug. Writing ' +
        'the servers out in full makes the profile hermetic: it says where it wants ' +
        'to fetch from, and it says the same thing wherever the build runs.',
    }),

    task({
      id: 'runtime-mirror',
      prompt:
        'The running image has its own pacman configuration, at ' +
        '`airootfs/etc/pacman.conf`, and right now it names a different mirror from ' +
        'the build. Make it name the same mirror the build uses — copy the Server ' +
        'lines from `pacman.conf` into it.',
      check: (s) => {
        if (!fileExists(s.sim, RUNTIME_PACMAN)) {
          return no('airootfs/etc/pacman.conf has gone missing. That file is the pacman ' +
            'configuration inside the running image — a different file from the ' +
            'profile\'s pacman.conf, and it lives in the overlay so that it ends up ' +
            'at /etc/pacman.conf on the image.');
        }
        const runtime = s.sim.readFile(RUNTIME_PACMAN) || '';
        const build = s.sim.readFile(BUILD_PACMAN) || '';
        const runtimeHosts = allHosts(runtime);
        if (!runtimeHosts.size) {
          return no('airootfs/etc/pacman.conf has no Server line, so the running image ' +
            'does not know where to fetch from either. Give it the same Server lines ' +
            'as the build.');
        }
        const buildHosts = allHosts(build);
        if (!buildHosts.size) {
          return no('The build\'s pacman.conf has no Server line yet, so there is ' +
            'nothing for the image to agree with. Write the servers out in the build ' +
            'configuration first, then copy those same lines into ' +
            'airootfs/etc/pacman.conf.');
        }
        const shared = [...runtimeHosts].filter((h) => buildHosts.has(h));
        if (!shared.length) {
          return no(`The two configurations name different mirrors. The build's ` +
            `pacman.conf uses ${[...buildHosts].join(', ') || 'nothing'} and the ` +
            `image's airootfs/etc/pacman.conf uses ${[...runtimeHosts].join(', ')}. ` +
            'The image you built and the image people install packages into should ' +
            'come from the same place — otherwise the machine you tested is not the ' +
            'machine anybody gets.');
        }
        return ok('');
      },
      hint:
        'Open both files side by side. Copy the Server lines from the build\'s ' +
        'pacman.conf into the image\'s pacman.conf.',
      hint2:
        'The runtime file should end up with the same Server = https://… lines under ' +
        '[core] and [extra] as the build file has.',
      why:
        'The build configuration and the runtime configuration answer two different ' +
        'questions — where do the image\'s own packages come from, and where do ' +
        'packages installed later come from — but if they disagree, the image is ' +
        'split-brained: it was assembled from one mirror and configured to pull from ' +
        'another. That is how a project ends up shipping a build it never tested, ' +
        'and how a mirror gets traffic nobody asked it to have.',
    }),
  ],

  /**
   * The state a learner who did this properly ends up in.
   *
   * The verifier applies this and asserts that every task then passes, and that
   * no task was already satisfied before the learner started. It is also the
   * worked example the lab report can offer.
   *
   * Every file a check reads is returned here: the package list, the build's
   * pacman.conf, and the image's own pacman.conf in the overlay.
   */
  solution: (s) => {
    const files = {
      'packages.x86_64': `# Packages installed into the Vesper image.
#
# One package per line. Blank lines and lines starting with # are ignored.

base
linux
nano
mkinitcpio
mkinitcpio-archiso

# Boot loaders, matched to the bootmodes in profiledef.sh.
syslinux
grub

# Enough tooling to look around at what the image actually contains.
#tree
file
`,
      'pacman.conf': `#
# Vesper — build-time pacman configuration.
#
# THIS file governs the build. mkarchiso reads it and hands the result to
# pacstrap to fill the image's root filesystem. Whatever mirrors are named
# here are the mirrors the packages come from.
#
# The image's own configuration is a different file: airootfs/etc/pacman.conf.

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
      'airootfs/etc/pacman.conf': `#
# Vesper — runtime pacman configuration.
#
# This is the file the RUNNING image reads. It is not the file above, and it
# names the same mirrors so that the image you tested is the image people get.

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
      'You now know where an image gets its contents and where it gets its sources — ' +
      'and that there are two of each, not one. The package list is a pacman list, ' +
      'comments are how you talk to the next person, mkinitcpio-archiso is not ' +
      'optional, and a profile that inherits its mirrors from the directory it was ' +
      'built in is not a profile anybody can reproduce.',
    next:
      'Next: the airootfs overlay, which is how you put your own files into the ' +
      'image without packaging anything.',
  },
};
