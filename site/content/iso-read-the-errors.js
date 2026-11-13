/**
 * Lab 2 of the ISO track: reading the errors.
 *
 * A build that breaks is not a mystery. Every failure mkarchiso has is a
 * message with a shape: it names the tool that failed, and usually the
 * file, option or path it choked on. The habit that matters is reading the
 * message from the bottom up — the first line is usually a symptom, the
 * last line is the cause.
 *
 * The simulator does not run mkarchiso, so the errors are driven through
 * the profile: each task is one real failure, and the check asks whether
 * that specific thing has been fixed. Every failing message translates the
 * raw error into plain language, because translating it *is* the lesson.
 */

import { task, ok, no } from '../assets/checks.js';

/** The profile as it stands, with four real mistakes in it. */
const PROFILE_DEF = `#!/usr/bin/env bash
# shellcheck disable=SC2034
#
# The profile definition. Every value here is one you are expected to change.

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

# Options passed to mksquashfs. These were copied from upstream's releng
# profile, where the compressor is xz.
airootfs_image_tool_options=('-comp' 'zstd' '-Xbcj' 'x86,arm64' '-b' '1M' '-Xdict-size' '1M')

file_permissions=(
  ["/etc/shadow"]="0:0:400"
  ["/usr/local/bin/choose-mirror"]="0:0:755"
)
`;

const PACMAN_CONF = `#
# The pacman configuration mkarchiso uses to build the image.
#

[options]
Architecture = auto
HoldPkg     = pacman glibc
ParallelDownloads = 5
SigLevel    = Required DatabaseOptional
LocalFileSigLevel = Optional

[core]
Include = mirrorlist

[extra]
Server = https://mirror.oldbuild.example.org/archlinux/$repo/os/$arch
`;

/** The one file the profile really does ship in its overlay. */
const AROOTFS_SHADOW = `root:!::0:::::
`;

/** The log from the run that broke. */
const FAILED_LOG = [
  '$ ./archiso/mkarchiso -w work -o out profile',
  '[mkarchiso] INFO: mkarchiso configuration settings',
  '[mkarchiso] INFO:              Architecture:   x86_64',
  '[mkarchiso] INFO:         Working directory:   /home/runner/builds/vesper/work',
  '[mkarchiso] INFO:    Installation directory:   vesper',
  '[mkarchiso] INFO:          Output directory:   /home/runner/builds/vesper/out',
  '[mkarchiso] INFO:        Current build mode:   iso',
  '[mkarchiso] INFO:               Build modes:   iso',
  '[mkarchiso] INFO:                  Profile:   /home/runner/builds/vesper/profile',
  '[mkarchiso] INFO: Pacman configuration file:   /home/runner/builds/vesper/profile/pacman.conf',
  '[mkarchiso] INFO:          Image file name:   vesper-2026.11.10-x86_64.iso',
  '[mkarchiso] INFO:         ISO volume label:   VESPER_202611',
  '[mkarchiso] INFO: Validating options...',
  '[mkarchiso] INFO: Done!',
  '[mkarchiso] INFO: Copying custom pacman.conf to work directory...',
  '[mkarchiso] INFO: Using pacman CacheDir: /var/cache/pacman/pkg',
  'error: config file mirrorlist could not be read: No such file or directory',
];

// ---------------------------------------------------------------- helpers

/** The words inside a shell array, e.g. `opts=('-a' 'b')`. */
function shellArray(content, key) {
  const m = content.match(new RegExp(key + '\\s*=\\s*\\(([^)]*)\\)'));
  if (!m) return [];
  const out = [];
  for (const mm of m[1].matchAll(/'([^']*)'|"([^"]*)"/g)) {
    out.push(mm[1] !== undefined ? mm[1] : mm[2]);
  }
  return out;
}

/** The paths named in `file_permissions`. */
function permissionPaths(content) {
  const block = content.match(/file_permissions\s*=\s*\(([\s\S]*?)\)/);
  if (!block) return [];
  const out = [];
  for (const m of block[1].matchAll(/\["([^"]+)"\]/g)) out.push(m[1]);
  return out;
}

/** The `Include =` lines in a pacman configuration. */
function includes(content) {
  const out = [];
  for (const m of content.matchAll(/^\s*Include\s*=\s*(\S+)/gm)) out.push(m[1]);
  return out;
}

/** The `Server =` lines in a pacman configuration. */
function servers(content) {
  const out = [];
  for (const m of content.matchAll(/^\s*Server\s*=\s*(\S+)/gm)) out.push(m[1]);
  return out;
}

/**
 * The files the profile's airootfs overlay actually contains.
 *
 * `file_permissions` is applied to the overlay and to nothing else, so this
 * is the set of paths that can be given permissions at all.
 */
function overlayFiles(sim) {
  const out = new Set();
  for (const path of sim.allFiles()) {
    const m = path.match(/\/airootfs\/(.*)$/);
    if (m) out.add(m[1]);
  }
  return out;
}

export const isoReadTheErrors = {
  id: 'iso-read-the-errors',
  track: 'iso',
  title: 'Reading the errors',
  subtitle: 'A build failure is a message with a shape. Learn the shape.',

  scenario:
    'Your build broke. The pipeline job went red, the ISO never appeared, ' +
    'and there is a wall of text between you and the answer. This is the ' +
    'part of ISO building that looks like luck and is not: the error is ' +
    'there, it is specific, and it can be read.',

  teaches:
    'A build error is a message with a shape. It usually names the tool ' +
    'that failed — `mksquashfs`, `pacman`, `mkarchiso` — and then names the ' +
    'thing it choked on: an option, a file, a path. Read it from the bottom ' +
    'up. The first line is often a symptom, something further up that ' +
    'looked fine until you read it again, and the last line is the cause. ' +
    'The log below stopped at its very first error; the others are behind ' +
    'it, waiting for you to fix this one and build again. Every one of them ' +
    'was hit for real while building a working image, and every one of them ' +
    'names something specific in your profile.',

  readFirst: [
    {
      title: 'The log, from the top',
      body: FAILED_LOG,
    },
    {
      title: 'How to read it',
      body: [
        'The first thing in the log is a symptom: the job failed. The last ' +
        'line is the cause: `error: config file mirrorlist could not be ' +
        'read`. Everything between them is the build doing its job ' +
        'successfully.',
        'So the order of the log is a map. `[mkarchiso] INFO:` lines are ' +
        'steps that succeeded. The log always stops at the step that did ' +
        'not, and the error follows it immediately. The step before the ' +
        'error tells you what kind of problem you are looking at.',
        'Three things make an error readable once you have found it: the ' +
        'tool that failed, the thing it was given, and the thing it was ' +
        'supposed to be given instead. Most build errors are one of the ' +
        'last two being wrong.',
      ],
    },
    {
      title: 'The four failures in this profile',
      body: [
        'The compression options in `profiledef.sh` were copied from a ' +
        'profile that uses a different compressor. The options belong to ' +
        'the compressor, not to the tool, so they do not transfer.',
        'The `Include` in `pacman.conf` is relative. pacman resolves a ' +
        'relative include against the directory the build was started from, ' +
        'not against the directory the file is in.',
        'The mirror in `pacman.conf` was inherited from a template. It ' +
        'serves package files but carries no repository databases, so ' +
        'pacman has nothing to resolve package names against.',
        'The `file_permissions` entry in `profiledef.sh` names a file that ' +
        'is not in the image, so the path cannot be resolved inside it.',
      ],
    },
  ],

  env: {
    type: 'editor',
    prompt:
      'Your profile, with the mistakes still in it. Edit the files and the ' +
      'tasks will check what you fixed. The build is not run here — the ' +
      'checks read the profile, which is where every one of these errors ' +
      'lives.',
    files: {
      'profiledef.sh': PROFILE_DEF,
      'pacman.conf': PACMAN_CONF,
      'airootfs/etc/shadow': AROOTFS_SHADOW,
    },
  },

  tasks: [
    task({
      id: 'compressor-options-match-the-compressor',
      prompt:
        'Fix the root filesystem compression options in profiledef.sh so ' +
        'they are options the compressor you chose actually understands.',
      check: (state) => {
        const content = state.sim.readFile('profiledef.sh') || '';
        const options = shellArray(content, 'airootfs_image_tool_options');
        const compressor = options.includes('zstd') ? 'zstd'
          : options.includes('xz') ? 'xz' : 'unknown';
        const xzOnly = options.filter((o) => o === '-Xbcj' || o === '-Xdict-size');
        if (xzOnly.length) {
          return no(
            'The build stopped at the rootfs step: ' +
            '`mksquashfs: Unrecognised compressor option -Xbcj`. That option ' +
            'belongs to the compressor, not to mksquashfs. `-Xbcj` and ' +
            '`-Xdict-size` are xz options; your profile selects zstd with ' +
            '`-comp zstd`, and zstd does not take them. Open profiledef.sh ' +
            'and look at `airootfs_image_tool_options`.'
          );
        }
        if (compressor !== 'zstd') {
          return no(
            'The options no longer belong to a compressor your profile does ' +
            'not choose. This profile builds its root filesystem with zstd, ' +
            'which is fast and compresses well. Keep `-comp zstd` and give ' +
            'it zstd\'s options.'
          );
        }
        return ok('');
      },
      hint:
        'The options in `airootfs_image_tool_options` are passed straight ' +
        'through to mksquashfs. Ask what your compressor accepts.',
      hint2:
        '`mksquashfs -help-comp zstd` lists exactly one option for zstd. ' +
        '`-b 1M` is fine — that one is mksquashfs\'s own.',
      why:
        'The compressor options are not mksquashfs options. mksquashfs ' +
        'hands the list to whichever compressor you named, and each ' +
        'compressor accepts a different set. Upstream\'s releng profile ' +
        'uses xz, so its option list is full of xz options. Copying that ' +
        'list into a zstd profile gives you an error that names the ' +
        'compressor rather than the option — which is why the fix is to ' +
        'look at which compressor you chose, not to memorise option lists.',
    }),

    task({
      id: 'compression-level-is-set',
      prompt:
        'Read the mksquashfs error all the way to the bottom and set the ' +
        'option the compressor tells you it supports.',
      check: (state) => {
        const content = state.sim.readFile('profiledef.sh') || '';
        const options = shellArray(content, 'airootfs_image_tool_options');
        const index = options.indexOf('-Xcompression-level');
        const level = index >= 0 ? options[index + 1] : undefined;
        const valid = level !== undefined && /^\d+$/.test(level) &&
          Number(level) >= 1 && Number(level) <= 19;
        if (!valid) {
          return no(
            'Reading further, mksquashfs says what it will accept: ' +
            '`mksquashfs: selected compressor "zstd". Options supported: ' +
            '-Xcompression-level <compression-level>`. That is the whole ' +
            'list for zstd. Put `-Xcompression-level` and a number between ' +
            '1 and 19 into `airootfs_image_tool_options` — 19 is the ' +
            'usual choice, and it is what the reference profile uses.'
          );
        }
        return ok('');
      },
      hint:
        'The second half of the error message is the useful half. It ' +
        'names the option the compressor takes.',
      hint2:
        "`airootfs_image_tool_options=('-comp' 'zstd' '-Xcompression-level' '19' '-b' '1M')`",
      why:
        'The second half of an error is often the better half. The first ' +
        'half says what went wrong; the second half says what the tool ' +
        'wanted instead. That is the whole distance between guessing and ' +
        'knowing.',
    }),

    task({
      id: 'pacman-conf-include-resolves',
      prompt:
        'Make the pacman configuration resolve on its own, whatever ' +
        'directory the build is started from.',
      check: (state) => {
        const content = state.sim.readFile('pacman.conf') || '';
        const list = includes(content);
        const relative = list.filter((p) => !p.startsWith('/'));
        if (relative.length) {
          return no(
            'The build stopped before it installed a single package: ' +
            '`error: config file mirrorlist could not be read: No such file ' +
            'or directory`. pacman resolved the relative `Include = ' +
            'mirrorlist` against the directory the build was started from, ' +
            'not against the profile\'s directory — so there was no ' +
            '`mirrorlist` there. A relative include makes the profile ' +
            'depend on where you happen to be standing. Give the Include an ' +
            'absolute path, or write the servers out directly.'
          );
        }
        return ok('');
      },
      hint:
        'The problem is not that the file is missing. It is that pacman ' +
        'looked for it in the wrong place.',
      hint2:
        'Either `Include = /etc/pacman.d/mirrorlist`, or no Include at all ' +
        'and a `Server =` line under each repository.',
      why:
        'This is the error that punishes you for building from a different ' +
        'directory than last time. `mkarchiso` calls `pacman-conf` from ' +
        'wherever you invoked it, and a relative Include is resolved ' +
        'against that directory. The reference profile avoids the trap ' +
        'entirely by writing the servers out in full, so the profile reads ' +
        'the same from anywhere.',
    }),

    task({
      id: 'mirror-has-repository-databases',
      prompt:
        'Point the repository at a mirror that actually serves the ' +
        'repository databases.',
      check: (state) => {
        const content = state.sim.readFile('pacman.conf') || '';
        const list = servers(content);
        const broken = list.filter((u) => u.includes('mirror.oldbuild.example.org'));
        if (broken.length) {
          return no(
            'The build stopped at the package step: ' +
            '`error: failed to update core database` and ' +
            '`error: failed to synchronize any databases`. The mirror you ' +
            'inherited serves package files, but it carries no `.db` ' +
            'database files, so pacman has nothing to resolve package names ' +
            'against. Point the repository at a mirror that serves the ' +
            'databases — `https://geo.mirror.pkgbuild.com/$repo/os/$arch` is ' +
            'the one the reference profile uses.'
          );
        }
        if (!list.length) {
          return no(
            'There is no `Server =` line anywhere in the configuration, so ' +
            'there is nowhere for pacman to fetch packages from. Each ' +
            'repository needs at least one server.'
          );
        }
        return ok('');
      },
      hint:
        'A mirror that serves packages is not the same as a mirror that ' +
        'serves the package database.',
      hint2:
        'The repository needs a line like ' +
        '`Server = https://geo.mirror.pkgbuild.com/$repo/os/$arch`.',
      why:
        'The `.db` files are the indexes: they are what pacman reads to ' +
        'answer "what versions of nano exist". A mirror that serves ' +
        'packages without serving the databases is a mirror that can ' +
        'download a file once pacman knows its name, and nothing more. ' +
        'The error names a database, not a package, because the database ' +
        'is the first thing pacman asks for.',
    }),

    task({
      id: 'file-permissions-point-at-real-files',
      prompt:
        'Make every path in `file_permissions` resolve inside the image.',
      check: (state) => {
        const content = state.sim.readFile('profiledef.sh') || '';
        const paths = permissionPaths(content);
        const overlay = overlayFiles(state.sim);
        const missing = paths.filter((p) => !overlay.has(p.replace(/^\//, '')));
        if (missing.length) {
          return no(
            'The build stopped while copying your overlay into the image: ' +
            '`[mkarchiso] ERROR: Failed to set permissions on ' +
            '\'/home/runner/builds/vesper/work/x86_64/airootfs' +
            missing[0] + '\'. Outside of valid path.` ' +
            '`file_permissions` is applied to the files your profile\'s ' +
            '`airootfs/` overlay contains — and to nothing else. The path ' +
            'has to exist inside the image. Ship the file in `airootfs/`, or ' +
            'drop the entry.'
          );
        }
        return ok('');
      },
      hint:
        'Which of the paths in `file_permissions` is actually in the ' +
        'profile\'s airootfs directory?',
      hint2:
        'The profile ships `airootfs/etc/shadow`. It does not ship ' +
        '`airootfs/usr/local/bin/choose-mirror`.',
      why:
        'Files copied out of the overlay arrive as 0644 and owned by root, ' +
        'with no executable bit — the overlay cannot carry permissions. ' +
        '`file_permissions` is the only way to set them, and it is applied ' +
        'to the overlay before the packages are installed, so it can only ' +
        'see the files your profile ships. The error says "Outside of ' +
        'valid path" because the path could not be resolved inside the ' +
        'image at all.',
    }),
  ],

  /**
   * The state a learner who did this properly ends up in.
   *
   * The profile with every one of the four mistakes fixed: zstd's own
   * compression option instead of xz's, absolute mirrors instead of a
   * relative `Include`, a mirror that serves the repository databases, and
   * `file_permissions` that only names files the overlay actually ships.
   *
   * Every file a check reads is returned here, not just the ones that
   * change: the profile definition, the pacman configuration, and the
   * overlay file that `file_permissions` refers to.
   */
  solution: (s) => {
    const files = {
      'profiledef.sh': `#!/usr/bin/env bash
# shellcheck disable=SC2034
#
# The profile definition. Every value here is one you are expected to change.

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

# Options passed to mksquashfs. These belong to the compressor, not to
# mksquashfs, and zstd takes exactly one of them: -Xcompression-level.
airootfs_image_tool_options=('-comp' 'zstd' '-Xcompression-level' '19' '-b' '1M')

file_permissions=(
  ["/etc/shadow"]="0:0:400"
)
`,
      'pacman.conf': `#
# The pacman configuration mkarchiso uses to build the image.
#
# The mirrors are written out in full rather than pulled in with \`Include\`,
# because pacman resolves a relative include against the directory the build
# was started from, not against the directory this file lives in.

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
      'airootfs/etc/shadow': AROOTFS_SHADOW,
    };

    // The verifier writes the returned files over the starting ones, but
    // doing it here as well keeps the simulator and the editor holding the
    // same contents.
    for (const [path, content] of Object.entries(files)) {
      if (s.sim) s.sim.writeFile(path, content);
      if (s.editor) s.editor[path] = content;
    }

    return files;
  },

  report: {
    lede:
      'You read four build errors and fixed all four. The skill is not ' +
      'knowing the messages — it is knowing what to look at when you meet ' +
      'a message you have never seen: the tool that failed, the thing it ' +
      'was given, and the thing it wanted instead.',
    next:
      'Next: a build that succeeds is not a build that works. We boot the ' +
      'image and read what the test says about it — including the things ' +
      'that fail silently.',
  },
};
