/**
 * Lab 4 of the ISO track: making the profile your own flavour.
 *
 * The last lab. Up to now the profile was a working example called
 * Vesper. This one hands it over unfinished: the learner has to name it,
 * describe it, choose its packages, greet its users, and commit it.
 *
 * The point is not that any particular string is correct. It is that the
 * learner now knows which parts of a profile are theirs to change, which
 * parts are the tool's, and what it takes to turn a directory into a
 * flavour somebody else can build.
 */

import { task, ok, no } from '../assets/checks.js';
import { el } from '../assets/lab.js';

/** The packages the reference profile ships. */
const REFERENCE_PACKAGES = [
  'base', 'linux', 'mkinitcpio', 'mkinitcpio-archiso', 'syslinux', 'grub',
  'nano', 'vim', 'git', 'tree', 'file', 'openssh',
];

const PROFILE_DEF = `#!/usr/bin/env bash
# shellcheck disable=SC2034
#
# The profile definition. Every value here is one you are expected to change.

# The first half of the output filename: vesper-2026.11.10-x86_64.iso
iso_name="vesper"

# The ISO 9660 volume label. Must be uppercase and at most 32 characters.
iso_label="VESPER_202611"

# Free-form publisher and application strings, recorded in the ISO metadata.
iso_publisher="Vesper Linux Project"
iso_application="Vesper Linux Live/Install"

# The version string.
iso_version="2026.11.10"

# Where the image's files live on the ISO. Lowercase and digits only, and at
# most 30 characters for ISO builds.
install_dir="vesper"

# Which boot loaders to bake in.
#   bios.syslinux  — booting a BIOS/CSM system
#   uefi.grub      — booting a UEFI system
bootmodes=('bios.syslinux'
           'uefi.grub')

# The pacman configuration used to *build* the image.
pacman_conf="pacman.conf"

# The image format for the root filesystem.
airootfs_image_type="squashfs"
airootfs_image_tool_options=('-comp' 'zstd' '-Xcompression-level' '19' '-b' '1M')
`;

const PACKAGES = `#
# Packages installed into the Vesper image.
#
# One package per line. Blank lines and lines starting with # are ignored.
#
# The first four are not optional:
#   base             — the minimum userspace
#   linux            — the kernel
#   mkinitcpio      — builds the initramfs
#   mkinitcpio-archiso — teaches the initramfs how to find the ISO's root
#                       filesystem. Mandatory; archiso cannot produce a bootable
#                       image without it.

base
linux
mkinitcpio
mkinitcpio-archiso

# Boot loaders, matched to the bootmodes in profiledef.sh.
syslinux
grub

# A shell and a text editor, so the image is usable from a serial console and
# so a student can change something inside the running system.
nano
vim

# Enough tooling to look around at what the image actually contains.
git
tree
file

# Remote access.
openssh
`;

const MOTD = `Welcome to the image.

Arch Linux, built for people who would rather read the source than a wizard.

  https://archlinux.org
`;

const GRUB_CFG = `# GRUB configuration for the image.
#
# This file came from upstream, and the menu entry still carries the default
# title. The identifiers in percent signs are replaced by mkarchiso when the
# image is built:
#   %INSTALL_DIR%  — the install_dir from profiledef.sh
#   %ARCH%         — the target architecture
#   %ARCHISO_UUID% — the ISO 9660 volume id, used to find the medium at boot

insmod part_gpt
insmod part_msdos
insmod fat
insmod iso9660
insmod normal
insmod search_label

# Set default menu entry
default=arch
timeout=15
timeout_style=menu

# Menu entries

menuentry "Arch Linux (%ARCH%, \${archiso_platform})" --class arch --class gnu-linux --class gnu --class os --id 'arch' {
    set gfxpayload=keep
    linux /%INSTALL_DIR%/boot/%ARCH%/vmlinuz-linux archisobasedir=%INSTALL_DIR% archisosearchuuid=%ARCHISO_UUID% console=tty0 console=ttyS0,115200
    initrd /%INSTALL_DIR%/boot/%ARCH%/initramfs-linux.img
}

menuentry 'System shutdown' --class shutdown --class poweroff {
    echo 'System shutting down...'
    halt
}

menuentry 'System restart' --class reboot --class restart {
    echo 'System rebooting...'
    reboot
}
`;

const PROFILE_FILES = [
  'profiledef.sh',
  'packages.x86_64',
  'airootfs/etc/motd',
  'grub/grub.cfg',
];

// ---------------------------------------------------------------- helpers

/** The values assigned in a profiledef.sh. */
function assignments(content) {
  const out = {};
  for (const line of String(content || '').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

/** The package names in a package list, without the comments. */
function packageList(content) {
  return String(content || '')
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

/** The title of the first GRUB menu entry. */
function menuTitle(content) {
  const m = String(content || '').match(/menuentry\s+["']([^"']+)["']/);
  return m ? m[1] : '';
}

/**
 * Put the profile's files in front of the learner.
 *
 * If the runner ever renders files in this environment as well, this
 * notices and stays out of the way.
 */
function attachProfileEditor(runner, paths) {
  setTimeout(() => {
    const env = runner.envEl;
    if (!env) return;
    if (env.querySelector('textarea.code-editor')) return;

    const wrap = el('div', { class: 'editor-list' });
    wrap.appendChild(el('p', { class: 'eyebrow' }, 'Your profile'));

    for (const path of paths) {
      const area = el('textarea', {
        class: 'code-editor',
        spellcheck: 'false',
        'aria-label': path,
      });
      area.value = runner.sim.readFile(path) || '';
      area.addEventListener('input', () => {
        runner.sim.writeFile(path, area.value);
        runner.evaluate();
      });
      wrap.appendChild(el('p', { class: 'editor-path' }, path));
      wrap.appendChild(area);
    }

    env.insertBefore(wrap, runner.terminalEl || null);
  }, 0);
}

export const isoMakeItYours = {
  id: 'iso-make-it-yours',
  track: 'iso',
  title: 'Making it yours',
  subtitle: 'Turn a working profile into a flavour with your name on it.',

  scenario:
    'Everything works. The image builds, it boots, it has a keyring. It is ' +
    'also called Vesper, it greets people with a banner somebody else ' +
    'wrote, and it carries the packages somebody else chose for you. A ' +
    'flavour is not a copy of a working ' +
    'profile — it is a set of decisions somebody made, written down, and ' +
    'committed. This is where you make yours.',

  teaches:
    'You have the pieces now. The last step is making them yours: the ' +
    'name, the description, the packages, the look, and the banner people ' +
    'see when they log in. Some of it is obvious. Some of it is not, and ' +
    'the not-obvious part is knowing what to change and what to leave ' +
    'alone. The name, the label, the publisher and the application string ' +
    'are yours — they are free-form strings that end up in the image\'s ' +
    'metadata and on the disc. The package list is yours, but four of its ' +
    'entries are not optional: without `linux`, `mkinitcpio`, ' +
    '`mkinitcpio-archiso` and `base` you do not have an operating system, ' +
    'you have a directory. The boot modes, the image type and the ' +
    'compression options belong to the tool; leave them alone unless you ' +
    'know why you are changing them. And the last step of making a flavour ' +
    'yours is committing it. A flavour is a git repository, and the ' +
    'pipeline builds a commit — so a flavour that is not committed has ' +
    'never been built, and nobody else can build it either.',

  readFirst: [
    {
      title: 'What to change',
      body: [
        '`iso_name` — the first half of the output file name. It becomes ' +
        'the file on your release page, so keep it lower case and without ' +
        'spaces.',
        '`iso_label` — the volume label on the disc, upper case, at most ' +
        '32 characters. It is what the bootloader searches for, and it is ' +
        'usually your name and the date.',
        '`iso_publisher` and `iso_application` — free-form strings that go ' +
        'into the ISO metadata. Who publishes this, and what is it for.',
        '`packages.<arch>` — what the image has on it, and why. A package ' +
        'with a comment next to it is a decision; a package without one is ' +
        'a guess.',
        '`airootfs/etc/motd` — the banner printed when somebody logs in.',
        'The `menuentry` title in `grub/grub.cfg` — the boot menu.',
      ],
    },
    {
      title: 'What to leave alone',
      body: [
        '`base`, `linux`, `mkinitcpio` and `mkinitcpio-archiso` in the ' +
        'package list. archiso cannot produce a bootable image without ' +
        'them, and the failure is not obvious when it happens.',
        'The boot modes, unless you know what you are doing: dropping ' +
        '`uefi.grub` means the image will not boot on a modern machine.',
        '`airootfs_image_type` and the compressor options. They decide how ' +
        'the root filesystem is packed, and the defaults are good.',
        'The `bootmodes` and the packages that match them. If you add a ' +
        'boot loader to `bootmodes`, its package has to be in the list too.',
      ],
    },
    {
      title: 'The last step is a commit',
      body: [
        'Your flavour is a git repository, and the build pipeline checks ' +
        'out one commit and builds that. So the state of your repository is ' +
        'the state of your flavour: if your changes are not committed, they ' +
        'have not been built, and the next person to clone your repository ' +
        'gets the old version.',
        'The terminal is right there. `git status` shows you what is ' +
        'uncommitted, `git add .` stages the profile, and `git commit` ' +
        'records it.',
      ],
    },
  ],

  env: {
    type: 'terminal',
    prompt:
      'Your profile is open above the terminal. Edit the files, then commit ' +
      'them in the terminal — the pipeline builds a commit, so a flavour ' +
      'that is not committed has never been built.',
    cwd: '/home/learner',
    files: {
      'profiledef.sh': PROFILE_DEF,
      'packages.x86_64': PACKAGES,
      'airootfs/etc/motd': MOTD,
      'grub/grub.cfg': GRUB_CFG,
    },
  },

  tasks: [
    task({
      id: 'the-image-is-named-after-your-flavour',
      prompt:
        'Give the image your own name. It is not Vesper any more — it is ' +
        'yours.',
      check: (state) => {
        const def = assignments(state.sim.readFile('profiledef.sh'));
        const name = (def.iso_name || '').trim();
        if (!name) {
          return no(
            'The profile has no `iso_name`. Without it the image is called ' +
            'after the tool that built it, which is not a flavour anybody ' +
            'wants to download.'
          );
        }
        if (name === 'vesper' || name === 'archlinux' || name === 'mkarchiso') {
          return no(
            'The image is still called “' + name + '”, which is the ' +
            'reference flavour\'s name — or the tool\'s. `iso_name` is the ' +
            'first half of the output file name, so it is also the name ' +
            'everybody sees on your release page. Put your own flavour\'s ' +
            'name there.'
          );
        }
        if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
          return no(
            '“' + name + '” is not a name the file system is comfortable ' +
            'with. `iso_name` ends up in a file name, so keep it lower ' +
            'case, with no spaces: something like `lumen` or `northlight`.'
          );
        }
        return ok('');
      },
      hint:
        'The name is one line near the top of profiledef.sh.',
      hint2:
        'It has to be the name of your flavour, and it has to be usable in ' +
        'a file name.',
      why:
        'The name is the first thing a person sees: it is the file on the ' +
        'release page, the directory on the ISO, and the title of the ' +
        'release itself. Giving it a name that means something to you is ' +
        'the whole difference between a working profile and a flavour.',
    }),

    task({
      id: 'the-volume-label-matches-the-name',
      prompt: 'The volume label has to follow the new name.',
      check: (state) => {
        const def = assignments(state.sim.readFile('profiledef.sh'));
        const name = (def.iso_name || '').trim();
        const label = (def.iso_label || '').trim();
        if (!name) {
          return no('Give the image a name first — the label follows it.');
        }
        if (!label.toUpperCase().startsWith(name.toUpperCase())) {
          return no(
            'The volume label is “' + label + '”, which does not follow the ' +
            'new name. The label is the name of the filesystem on the disc, ' +
            'in upper case, and it is what the bootloader searches for. ' +
            'Make it your flavour\'s name in upper case, usually with the ' +
            'date after it: `LUMEN_202611`.'
          );
        }
        if (label === 'VESPER_202611') {
          return no(
            'That is still the reference flavour\'s volume label. It has to ' +
            'follow the name you just chose — the label is what the ' +
            'bootloader searches for, and it is what a file manager shows ' +
            'for the disc.'
          );
        }
        if (!/^[A-Z0-9_]+$/.test(label)) {
          return no(
            'The volume label has to be upper case letters, digits and ' +
            'underscores, at most 32 characters. “' + label + '” is not.'
          );
        }
        return ok('');
      },
      hint:
        'The label is the name in upper case. The date usually follows it.',
      hint2:
        '`iso_label="LUMEN_202611"` — whatever your own name is, in ' +
        'upper case.',
      why:
        'The volume label is how the machine finds the medium: the ' +
        'bootloader searches for a filesystem with that label and boots ' +
        'what it finds. It has to match the name you chose, and it has to ' +
        'be something you can type.',
    }),

    task({
      id: 'publisher-and-application-say-something-real',
      prompt:
        'Write the publisher and the application string for your own ' +
        'flavour.',
      check: (state) => {
        const def = assignments(state.sim.readFile('profiledef.sh'));
        const publisher = (def.iso_publisher || '').trim();
        const application = (def.iso_application || '').trim();
        const stock = [
          'Arch Linux <https://archlinux.org>',
          'Arch Linux Live/Rescue DVD',
          'Vesper Linux Project',
          'Vesper Linux Live/Install',
          'mkarchiso',
        ];
        if (!publisher || !application) {
          return no(
            'Both `iso_publisher` and `iso_application` need a value. They ' +
            'are free-form strings that get written into the ISO metadata, ' +
            'and they are what a tool or a file manager shows when it ' +
            'reads the disc.'
          );
        }
        if (stock.includes(publisher) || stock.includes(application)) {
          return no(
            'These are still the reference flavour\'s strings — or ' +
            'upstream\'s. Write something true about your own: who publishes ' +
            'this image, and what it is for. A publisher can be a person or ' +
            'a project; the application string can say what the image is ' +
            'for, like “Live/Install” or “Rescue”.'
          );
        }
        return ok('');
      },
      hint:
        'They are free-form. There is no format to follow, only a truth to ' +
        'state.',
      hint2:
        'Look at the two lines in profiledef.sh with `iso_publisher` and ' +
        '`iso_application` in them.',
      why:
        'These strings are metadata, and metadata is how a disc describes ' +
        'itself to software and to people. "Who made this" and "what is ' +
        'this for" are the two questions a stranger asks when they find ' +
        'your image.',
    }),

    task({
      id: 'a-package-of-your-own-with-a-reason',
      prompt:
        'Add a package that is yours — something your flavour needs that ' +
        'the reference does not have — and say in a comment why it is ' +
        'there.',
      check: (state) => {
        const content = state.sim.readFile('packages.x86_64') || '';
        const packages = packageList(content);
        const mine = packages.filter((p) => !REFERENCE_PACKAGES.includes(p));
        if (!mine.length) {
          return no(
            'The package list is still the reference list. Add one package ' +
            'that your flavour wants and the reference does not have — a ' +
            'terminal, a text editor, a tool for the job your flavour is ' +
            'for.'
          );
        }
        const lines = content.split('\n');
        const explained = mine.some((p) => {
          const index = lines.findIndex((l) => l.replace(/#.*$/, '').trim() === p);
          if (index < 0) return false;
          // A comment on the same line as the package, or on the line
          // directly above it.
          if (lines[index].includes('#')) return true;
          for (let i = index - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line) continue;
            return line.startsWith('#');
          }
          return false;
        });
        if (!explained) {
          return no(
            'The package is in the list, but nothing says why. Put a ' +
            'comment next to it — on the same line as the package, or on ' +
            'the line directly above it. A package with a reason next to ' +
            'it is a decision you made; a package without one is something ' +
            'you copied.'
          );
        }
        return ok('');
      },
      hint:
        'One package name per line. A `#` starts a comment, and mkarchiso ' +
        'ignores it.',
      hint2:
        'Something like `curl  # so the image can talk to the network` on ' +
        'its own line, or on the line above the package.',
      why:
        'This is where a profile becomes a set of decisions rather than a ' +
        'list. The comment is not decoration: it is the reason the package ' +
        'is there, written down for the next person — which is you, in six ' +
        'months, wondering why you needed it.',
    }),

    task({
      id: 'the-motd-greets-your-users',
      prompt: 'Make the banner your flavour prints at login say hello.',
      check: (state) => {
        const motd = (state.sim.readFile('airootfs/etc/motd') || '').trim();
        const def = assignments(state.sim.readFile('profiledef.sh'));
        const name = (def.iso_name || '').trim();
        if (!motd) {
          return no(
            'The motd is empty. `airootfs/etc/motd` is the banner the image ' +
            'prints when somebody logs in — it is the first thing a user ' +
            'reads.'
          );
        }
        if (!name) {
          return no('Give the image a name first.');
        }
        if (!motd.toLowerCase().includes(name.toLowerCase())) {
          return no(
            'The banner does not say which flavour it is. `airootfs/etc/motd` ' +
            'is the text the image prints when somebody logs in — it is the ' +
            'only text in the image written for people rather than for the ' +
            'machine. Put your flavour\'s name in it. What it says after ' +
            'that is up to you: a sentence about what the flavour is for is ' +
            'worth more than a bare name.'
          );
        }
        return ok('');
      },
      hint:
        'The motd is `airootfs/etc/motd`. It is copied into the image as ' +
        'it is.',
      hint2:
        'The first line of the file is the line people see.',
      why:
        'The motd is the only text in the image that is written for people ' +
        'rather than for the machine. It is where you can say what the ' +
        'flavour is, or what to do with it, or who to ask when it breaks.',
    }),

    task({
      id: 'the-boot-menu-names-your-flavour',
      prompt: 'The boot menu has to introduce your flavour too.',
      check: (state) => {
        const title = menuTitle(state.sim.readFile('grub/grub.cfg'));
        const def = assignments(state.sim.readFile('profiledef.sh'));
        const name = (def.iso_name || '').trim();
        if (!title) {
          return no(
            'There is no menu entry in grub/grub.cfg. Without one there is ' +
            'no boot menu, and without a boot menu the machine does not ' +
            'start.'
          );
        }
        if (!name) {
          return no('Give the image a name first.');
        }
        if (!title.toLowerCase().includes(name.toLowerCase())) {
          return no(
            'The boot menu still says “' + title + '”. The title is the text ' +
            'inside the `menuentry` line in `grub/grub.cfg`. It is the first ' +
            'thing a person sees when the machine starts, so it should be ' +
            'your flavour and not the reference.'
          );
        }
        return ok('');
      },
      hint:
        'Look for the `menuentry` line in grub/grub.cfg.',
      hint2:
        'The text between the first pair of quotes is the title.',
      why:
        'The boot menu is the first thing on screen and the first thing a ' +
        'screenshot of your image shows. It is also the one piece of your ' +
        'flavour that everybody sees before they have even logged in.',
    }),

    task({
      id: 'the-flavour-is-committed',
      prompt:
        'Commit your flavour. The pipeline builds a commit, so anything ' +
        'you have not committed has not been built.',
      check: (state) => {
        const git = state.sim.state.git || {};
        if (!git.initialised) {
          return no(
            'This directory is not a git repository yet. Initialise it, ' +
            'stage the profile, and commit it — a flavour nobody can clone ' +
            'is not a flavour.'
          );
        }
        const committed = git.committed || [];
        const files = new Set();
        for (const c of committed) for (const f of (c.files || [])) files.add(f);
        const missing = PROFILE_FILES.filter((p) => !files.has(p));
        if (missing.length) {
          return no(
            'The flavour is not fully committed. These files are not in any ' +
            'commit yet: ' + missing.join(', ') + '. Stage them with ' +
            '`git add .` and commit them.'
          );
        }
        const staged = git.staged ? git.staged.size : 0;
        if (staged) {
          return no(
            'There are staged changes that have not been committed. The ' +
            'pipeline builds a commit, so staged-but-not-committed changes ' +
            'are not in the image anybody can download. Commit them.'
          );
        }
        if (committed.length < 2) {
          return no(
            'The repository still only has its first commit. Your changes ' +
            'need a commit of their own — `git add .` and then `git commit` ' +
            'with a message that says what the flavour is now.'
          );
        }
        return ok('');
      },
      hint:
        'The terminal is below the files: `git status`, `git add .`, then ' +
        '`git commit -m "..."`.',
      hint2:
        '`git commit -m "Add my flavour"` — the message can be whatever ' +
        'describes the change.',
      why:
            'This is the thing the whole course has been building towards. ' +
            'You did not follow a recipe: you took a profile that worked, ' +
            'read it, changed what you wanted, and left the rest alone. ' +
            'What you have now is not a copy — it is a flavour, with your ' +
            'name on it, your packages in it, your banner on the screen. And ' +
            'it is in version control, which means it can be built again and ' +
            'again, by you and by anyone else who clones it.',
    }),
  ],

  start: ({ sim, runner }) => {
    // The repository already exists, as it would if you had cloned it from
    // your own GitLab project. There is one commit in it: the reference
    // profile you started from.
    sim.state.git = {
      initialised: true,
      branch: 'main',
      staged: new Set(),
      committed: [{
        message: 'Add the reference profile',
        files: ['README.md'],
      }],
      config: {
        user: 'learner',
        'user.name': 'learner',
        'user.email': 'learner@academy.example',
      },
    };
    attachProfileEditor(runner, PROFILE_FILES);
  },

  /**
   * The state a learner who did this properly ends up in.
   *
   * The profile, with a name of the learner's own: the image name, the
   * volume label that follows it, the two metadata strings, a package that
   * is there for a reason, a banner that says hello, and a boot menu that
   * introduces the flavour.
   *
   * Then the last step: the changes are committed, because the pipeline
   * builds a commit.
   */
  solution: (s) => {
    const files = {
      'profiledef.sh': `#!/usr/bin/env bash
# shellcheck disable=SC2034
#
# The profile definition. Every value here is one you are expected to change.

# The first half of the output filename: lumen-2026.11.10-x86_64.iso
iso_name="lumen"

# The ISO 9660 volume label. Must be uppercase and at most 32 characters.
iso_label="LUMEN_202611"

# Free-form publisher and application strings, recorded in the ISO metadata.
iso_publisher="Lumen Linux Project"
iso_application="Lumen Linux Live/Install"

# The version string.
iso_version="2026.11.10"

# Where the image's files live on the ISO. Lowercase and digits only, and at
# most 30 characters for ISO builds.
install_dir="lumen"

# Which boot loaders to bake in.
#   bios.syslinux  — booting a BIOS/CSM system
#   uefi.grub      — booting a UEFI system
bootmodes=('bios.syslinux'
           'uefi.grub')

# The pacman configuration used to *build* the image.
pacman_conf="pacman.conf"

# The image format for the root filesystem.
airootfs_image_type="squashfs"
airootfs_image_tool_options=('-comp' 'zstd' '-Xcompression-level' '19' '-b' '1M')
`,
      'packages.x86_64': `#
# Packages installed into the Lumen image.
#
# One package per line. Blank lines and lines starting with # are ignored.
#
# The first four are not optional:
#   base             — the minimum userspace
#   linux            — the kernel
#   mkinitcpio      — builds the initramfs
#   mkinitcpio-archiso — teaches the initramfs how to find the ISO's root
#                       filesystem. Mandatory; archiso cannot produce a bootable
#                       image without it.

base
linux
mkinitcpio
mkinitcpio-archiso

# Boot loaders, matched to the bootmodes in profiledef.sh.
syslinux
grub

# A shell and a text editor, so the image is usable from a serial console and
# so a student can change something inside the running system.
nano
vim

# Enough tooling to look around at what the image actually contains.
git
tree
file

# Remote access.
openssh

curl  # so the image can fetch things over the network at runtime
`,
      'airootfs/etc/motd': `Welcome to Lumen.

Arch Linux, built for people who would rather read the source than a wizard.

  https://archlinux.org
`,
      'grub/grub.cfg': `# GRUB configuration for the image.
#
# This file came from upstream, and the menu entry still carries the default
# title. The identifiers in percent signs are replaced by mkarchiso when the
# image is built:
#   %INSTALL_DIR%  — the install_dir from profiledef.sh
#   %ARCH%         — the target architecture
#   %ARCHISO_UUID% — the ISO 9660 volume id, used to find the medium at boot

insmod part_gpt
insmod part_msdos
insmod fat
insmod iso9660
insmod normal
insmod search_label

# Set default menu entry
default=lumen
timeout=15
timeout_style=menu

# Menu entries

menuentry "Lumen Linux (%ARCH%, \${archiso_platform})" --class lumen --class gnu-linux --class gnu --class os --id 'lumen' {
    set gfxpayload=keep
    linux /%INSTALL_DIR%/boot/%ARCH%/vmlinuz-linux archisobasedir=%INSTALL_DIR% archisosearchuuid=%ARCHISO_UUID% console=tty0 console=ttyS0,115200
    initrd /%INSTALL_DIR%/boot/%ARCH%/initramfs-linux.img
}

menuentry 'System shutdown' --class shutdown --class poweroff {
    echo 'System shutting down...'
    halt
}

menuentry 'System restart' --class reboot --class restart {
    echo 'System rebooting...'
    reboot
}
`,
    };

    // The profile the learner ends up with.
    for (const [path, content] of Object.entries(files)) {
      if (s.sim) s.sim.writeFile(path, content);
      if (s.editor) s.editor[path] = content;
    }

    // And the commit, because the pipeline builds a commit. The repository
    // already exists, with the reference profile in it, so this is the
    // second commit: the learner's flavour.
    s.sim.run('git add .');
    s.sim.run('git commit -m "Add the Lumen flavour"');

    return files;
  },

  report: {
    lede:
      'That is yours. The name, the label, the metadata, the packages, the ' +
      'banner and the boot menu all say the same thing, and they say it ' +
      'because you decided they should. The profile still looks like the ' +
      'one you started from, and that is the point: the parts you did not ' +
      'understand are still exactly where they were.',
    next:
      'That is the course. From here the loop is yours: edit, commit, ' +
      'build, boot it, read what the test says, and do it again.',
  },
};
