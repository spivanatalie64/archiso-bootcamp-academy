/**
 * Lab 01 — what a profile is made of.
 *
 * The learner is handed a real, complete profile — the "vesper" flavour —
 * and works out what each part is for. Nothing here is a trick question and
 * nothing here is a typo hunt: the point is that a profile is a directory,
 * and that the directory has a shape.
 */

import {
  task, ok, no, fileExists, fileMatches, fileHasAssignment,
} from '../assets/checks.js';

const PROFILE = 'profiledef.sh';
const PACKAGES = 'packages.x86_64';
const MOTD = 'airootfs/etc/motd';
const GRUB = 'grub/grub.cfg';

/**
 * The current value of a shell-style assignment in a file, or null.
 * Local to this lab on purpose: the shared helpers cover the common cases,
 * and the messages here need to quote the value that is actually there.
 */
function value(sim, path, key) {
  const content = sim.readFile(path);
  if (content === null) return null;
  const match = content.match(new RegExp('^\\s*' + key + '\\s*=\\s*(.*)$', 'm'));
  if (!match) return null;
  let v = match[1].trim();
  if ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
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

// ----------------------------------------------------------------- the lab

export const isoProfileAnatomy = {
  id: 'iso-profile-anatomy',
  track: 'iso',
  title: 'What a profile is made of',
  subtitle: 'The directory that is the recipe, and the five things in it.',

  scenario:
    'Every Linux distribution you have ever booted was assembled from a list of files ' +
    'and a list of packages. Arch ships the tool that does this — archiso — and the ' +
    'recipe it reads is called a profile. A profile is not a script and it is not a ' +
    'config file you point at: it is a directory, and that directory *is* the recipe. ' +
    'This lab is about learning to read one.',

  teaches:
    'archiso takes a profile — a directory — and turns it into a bootable ISO image. ' +
    'Every profile has the same five parts. `profiledef.sh` describes the image itself: ' +
    'its name, its label, where its files sit on the disc, which boot loaders to bake ' +
    'in. `packages.<arch>` lists the packages that go into the image, one per line. ' +
    '`pacman.conf` says where those packages are fetched from. `airootfs/` is a ' +
    'directory of files that get copied onto the image\'s own root filesystem. And the ' +
    'boot loader directories — `grub/`, `syslinux/`, `efiboot/` — configure the menu ' +
    'you see when the machine starts. Two more variables exist and do not matter yet: ' +
    '`buildmodes` (how to build the thing) and `bootmodes` (which boot loaders to ' +
    'include). Boot modes get their own lab.',

  readFirst: [
    {
      title: 'The shape of the directory',
      body: [
        'This is the profile you are looking at. Five things, and every one of them has ' +
        'a job:',
        'profiledef.sh — the identity of the image. Name, label, version, install ' +
        'directory, boot loaders.',
        'packages.x86_64 — the contents. One package per line. Blank lines and lines ' +
        'starting with a # are ignored.',
        'pacman.conf — the source. Which mirrors the packages are fetched from while ' +
        'the image is being built.',
        'airootfs/ — the overlay. Everything in here is copied onto the image\'s root ' +
        'filesystem before the packages are installed.',
        'grub/ and syslinux/ — the menus. One directory per boot loader.',
      ],
    },
    {
      title: 'Where the filename comes from',
      body: [
        'The image is called <iso_name>-<iso_version>-<arch>.iso. The arch part comes ' +
        'from the `arch` variable, which also picks the package list: packages.x86_64. ' +
        'The volume label — the name the disc is given inside a file manager — is a ' +
        'separate thing entirely, and it is `iso_label`.',
      ],
    },
  ],

  env: {
    type: 'editor',
    prompt:
      'A profile, open in an editor. Change the files; the tasks are checked against ' +
      'what the files now say, not against how you got there.',
    files: {
      'profiledef.sh': `#!/usr/bin/env bash
# shellcheck disable=SC2034
#
# Vesper — the profile definition.
#
# This file describes the image itself: what it is called, what it is labelled,
# where its files sit on the disc, and which boot loaders to bake into it.

# The first half of the output filename: <iso_name>-<iso_version>-<arch>.iso
iso_name="archlinux-baseline"

# The ISO 9660 volume label — the name the disc is given inside a file manager.
iso_label="ARCH_202611"

# Free-form strings recorded in the ISO's own metadata.
iso_publisher="Arch Linux <https://archlinux.org>"
iso_application="Arch Linux baseline"

# The version string that goes in the middle of the filename.
iso_version="2026.11.10"

# Where the image's files live on the ISO. Lowercase letters and digits only.
install_dir="arch"

# Which boot loaders to bake into the image.
bootmodes=('bios.syslinux'
           'uefi.grub')

# The image format for the root filesystem.
airootfs_image_type="squashfs"

# Files that need an owner or a mode the overlay cannot carry.
file_permissions=(
  ["/etc/shadow"]="0:0:400"
)
`,
      'packages.x86_64': `# Packages installed into the Vesper image.
#
# One package per line. Blank lines and lines starting with # are ignored.

base
mkinitcpio
mkinitcpio-archiso

# Boot loaders, matched to the bootmodes in profiledef.sh.
syslinux
grub

# A shell and a text editor, so the image is usable from a serial console.
nano
vim
`,
      'pacman.conf': `#
# Vesper — build-time pacman configuration.
#
# This file governs the build: mkarchiso reads it, flattens it, and hands the
# result to pacstrap to fill the image's root filesystem. Whatever mirrors are
# named here are the mirrors the packages come from.

[options]
Architecture = auto
HoldPkg     = pacman glibc
ParallelDownloads = 5
SigLevel    = Required DatabaseOptional
LocalFileSigLevel = Optional

[core]
Include = /etc/pacman.d/mirrorlist

[extra]
Include = /etc/pacman.d/mirrorlist
`,
      'airootfs/etc/motd': `Welcome to the image.

This message is printed the first time somebody logs in.
`,
      'grub/grub.cfg': `# GRUB configuration for the Vesper image.
#
# The identifiers in percent signs are replaced by mkarchiso when the image
# is built:
#   %INSTALL_DIR%  — the install_dir from profiledef.sh
#   %ARCH%         — the target architecture
#   %ARCHISO_UUID% — the ISO 9660 volume id, used to find the medium at boot

# Load partition table and file system modules
insmod part_gpt
insmod part_msdos
insmod fat
insmod iso9660
insmod ntfs
insmod ntfscomp
insmod exfat
insmod udf

# Set default menu entry
default=archlinux
timeout=15
timeout_style=menu

# Menu entries

menuentry "Arch Linux (%ARCH%, \${archiso_platform})" --class arch --class gnu-linux --class gnu --class os --id 'archlinux' {
    set gfxpayload=keep
    linux /%INSTALL_DIR%/boot/%ARCH%/vmlinuz-linux archisobasedir=%INSTALL_DIR% archisosearchuuid=%ARCHISO_UUID%
    initrd /%INSTALL_DIR%/boot/%ARCH%/initramfs-linux.img
}

menuentry 'System shutdown' --class shutdown --class poweroff {
    echo 'System shutting down...'
    halt
}
`,
    },
    cwd: '/home/learner',
  },

  tasks: [
    task({
      id: 'iso-name',
      prompt:
        'Open `profiledef.sh`. The image is still called after somebody else\'s project. ' +
        'Change `iso_name` so the image is named after yours: vesper.',
      check: (s) => {
        const v = value(s.sim, PROFILE, 'iso_name');
        if (v === null) {
          return no('profiledef.sh has no `iso_name` line at all. Without it, archiso ' +
            'falls back to the name "mkarchiso" and your image is called mkarchiso-….');
        }
        if (/^vesper$/i.test(v)) return ok('');
        return no(`profiledef.sh still says iso_name="${v}". That value is the first half ` +
          `of the output filename — the image would be written out as ` +
          `${v}-2026.11.10-x86_64.iso. Change it to your flavour's name: vesper.`);
      },
      hint:
        'Look in profiledef.sh for the line that starts with `iso_name=`. It is the ' +
        'first assignment in the file.',
      hint2:
        'The line should read: iso_name="vesper"',
      why:
        'The image filename is built from iso_name, iso_version and the architecture, ' +
        'so iso_name is the half of the filename people recognise. Getting it right ' +
        'means the artefact is named after the flavour rather than after the template ' +
        'it started from — which matters the moment more than one build exists.',
    }),

    task({
      id: 'install-dir',
      prompt:
        'Still in `profiledef.sh`: `install_dir` names the directory the image\'s files ' +
        'live in on the disc. Set it to vesper. Remember the rule — lowercase letters ' +
        'and digits only, nothing else.',
      check: (s) => {
        const v = value(s.sim, PROFILE, 'install_dir');
        if (v === null) {
          return no('profiledef.sh has no `install_dir` line. Without it the files land ' +
            'in a directory called "mkarchiso" on the disc.');
        }
        if (!/^[a-z0-9]{1,30}$/.test(v)) {
          return no(`install_dir is "${v}". That name only allows lowercase letters ` +
            'and digits — archiso refuses to build if it contains an uppercase letter, ' +
            'a dash, an underscore or a slash, and on some filesystems an uppercase ' +
            'name means something quite different. Use "vesper".');
        }
        if (v !== 'vesper') {
          return no(`install_dir is "${v}". That is the directory the image's files ` +
            'live in on the disc. Set it to "vesper" so the image holds its own ' +
            'directory and not somebody else\'s.');
        }
        return ok('');
      },
      hint:
        'The rule is not "no spaces" — it is stricter. Only [a-z0-9] is allowed.',
      hint2:
        'The line should read: install_dir="vesper"',
      why:
        'install_dir is the folder your kernel, initramfs and root filesystem are ' +
        'mounted from on the disc. The boot loaders are told about it at build time by ' +
        'the %INSTALL_DIR% placeholder, so the value and the menus are always in step. ' +
        'The character restriction is not cosmetic: the name ends up in boot ' +
        'parameters and in paths that several different tools have to agree about, ' +
        'and a name with case in it has bitten people on case-insensitive filesystems.',
    }),

    task({
      id: 'iso-label',
      prompt:
        'The volume label is a different thing from the filename: it is the name the ' +
        'disc is given inside a file manager, and it is set by `iso_label` in ' +
        '`profiledef.sh`. Set it to VESPER_202611.',
      check: (s) => {
        const v = value(s.sim, PROFILE, 'iso_label');
        if (v === null) {
          return no('profiledef.sh has no `iso_label` line. The default label is ' +
            '"MKARCHISO", which is how you spot an image nobody renamed.');
        }
        if (v !== v.toUpperCase()) {
          return no(`iso_label is "${v}". The volume label has to be uppercase — the ` +
            'label is stored in the ISO 9660 filesystem, which only has room for ' +
            'capital letters.');
        }
        if (v.length > 32) {
          return no(`iso_label is "${v}", which is ${v.length} characters. The label ` +
            'is limited to 32 characters. Shorten it.');
        }
        if (!v.includes('VESPER')) {
          return no(`iso_label is "${v}". The label is what somebody sees when they ` +
            'mount the disc, so it should say VESPER. Set it to VESPER_202611.');
        }
        return ok('');
      },
      hint:
        'The label and the name are two different variables. You want ' +
        '`iso_label="VESPER_202611"` — all capitals.',
      hint2:
        'The line should read: iso_label="VESPER_202611"',
      why:
        'A volume label is what shows up in a file manager, in a disk utility, and on ' +
        'the boot screen of some machines. It is the first thing that tells somebody ' +
        'which image they have in their hand, and it is limited to uppercase and to 32 ' +
        'characters because of the filesystem it lives in.',
    }),

    task({
      id: 'package-list',
      prompt:
        'The profile does not say which architecture it is for. Add `arch="x86_64"` to ' +
        '`profiledef.sh`. That one value decides which package list is read — the one ' +
        'called `packages.x86_64` — and make sure that list names the kernel.',
      check: (s) => {
        const arch = value(s.sim, PROFILE, 'arch');
        if (arch !== 'x86_64') {
          return no(arch === null
            ? 'profiledef.sh does not say which architecture it is for. Without it, ' +
              'archiso builds for the architecture of the machine you happen to be ' +
              'sitting at, and looks for a package list named after that machine.'
            : `profiledef.sh says arch="${arch}". The package list is chosen by this ` +
              'value — packages.x86_64 — so it has to name the architecture you are ' +
              'actually building.');
        }
        if (!fileMatches(s.sim, PACKAGES, '^\\s*linux\\s*$', 'm')) {
          return no('packages.x86_64 does not list `linux`. That file is the list of ' +
            'everything that goes into the image — one package per line — and the ' +
            'kernel is the one thing an image cannot boot without. Add a line that ' +
            'says exactly: linux');
        }
        return ok('');
      },
      hint:
        'One line in profiledef.sh, near the other assignments. And in packages.x86_64, ' +
        'a line that says exactly `linux` — no trailing words, because the whole line ' +
        'is the package name.',
      hint2:
        'arch="x86_64" in profiledef.sh, and a line reading `linux` in packages.x86_64.',
      why:
        'The package list is the contents of the image, and the arch variable is how ' +
        'the profile finds it: packages.${arch}. Setting it explicitly means the ' +
        'profile builds the same thing on every machine, instead of producing an ' +
        'aarch64 image because you happened to be on one.',
    }),

    task({
      id: 'airootfs-overlay',
      prompt:
        'The `airootfs/` directory is the overlay: everything in it is copied onto the ' +
        'image\'s own root filesystem. It already holds `airootfs/etc/motd` — the ' +
        'message printed the first time somebody logs in. Rewrite it so it greets the ' +
        'person as Vesper.',
      check: (s) => {
        if (!fileExists(s.sim, MOTD)) {
          return no('airootfs/etc/motd has gone missing. The airootfs directory is the ' +
            'overlay: the whole directory is copied onto the image\'s root filesystem ' +
            'before any packages are installed.');
        }
        if (!fileMatches(s.sim, MOTD, 'vesper', 'i')) {
          return no('airootfs/etc/motd does not mention Vesper. This file is copied ' +
            'onto the image as /etc/motd, and it is what somebody reads the first time ' +
            'they log in to what you built.');
        }
        return ok('');
      },
      hint:
        'The path inside the profile is airootfs/etc/motd. On the image it becomes ' +
        '/etc/motd — the overlay keeps the same shape as the root filesystem.',
      hint2:
        'Put a line like "Welcome to Vesper." in airootfs/etc/motd.',
      why:
        'The overlay is how you put your own files into the image without packaging ' +
        'anything. The path you write in the profile is the path the file has on the ' +
        'image, so airootfs/etc/motd becomes /etc/motd. It is the cheapest possible ' +
        'customisation: a file, copied in, that says your name.',
    }),

    task({
      id: 'pacman-conf',
      prompt:
        'Right now the profile does not say where the packages come from. Point it at ' +
        'its own configuration file: add `pacman_conf="pacman.conf"` to `profiledef.sh`.',
      check: (s) => {
        if (fileHasAssignment(s.sim, PROFILE, 'pacman_conf', 'pacman.conf')) return ok('');
        const v = value(s.sim, PROFILE, 'pacman_conf');
        if (v === null) {
          return no('profiledef.sh does not mention pacman_conf. That means archiso ' +
            'uses the build machine\'s own /etc/pacman.conf — so your image would be ' +
            'assembled from whatever mirrors that machine happened to have, and two ' +
            'people building your profile would get different images.');
        }
        return no(`profiledef.sh says pacman_conf="${v}". The value is a path, relative ` +
          'to the profile. Use pacman.conf — the file sitting next to profiledef.sh.');
      },
      hint:
        'One more assignment in profiledef.sh, naming the file that is already there.',
      hint2:
        'The line should read: pacman_conf="pacman.conf"',
      why:
        'pacman_conf names the pacman configuration that governs the build. Leaving it ' +
        'out is the single easiest way to get an image that is not reproducible: the ' +
        'build silently inherits the build machine\'s mirrors. Pointing it at the ' +
        'profile\'s own file is what makes the recipe mean the same thing everywhere.',
    }),

    task({
      id: 'boot-loader-config',
      prompt:
        'Last part: the boot menus. The UEFI menu lives in `grub/grub.cfg`, and the ' +
        'entry in it still calls itself "Arch Linux". Rename that menu entry so it ' +
        'says Vesper.',
      check: (s) => {
        if (!fileExists(s.sim, GRUB)) {
          return no('grub/grub.cfg is missing. The grub/ directory holds the menu the ' +
            'UEFI boot loader shows; without it there is no menu at all.');
        }
        if (!fileMatches(s.sim, GRUB, 'menuentry\\s+"[^"]*Vesper', 'i')) {
          return no('The menu entry in grub/grub.cfg still reads "Arch Linux ' +
            '(%ARCH%, ${archiso_platform})". The text in quotes after menuentry is ' +
            'exactly what somebody sees on screen when they boot your image. Rename ' +
            'it so it says Vesper.');
        }
        return ok('');
      },
      hint:
        'Find the word menuentry in grub/grub.cfg. The name of the image is the text ' +
        'in double quotes right after it.',
      hint2:
        'Something like: menuentry "Vesper Linux (%ARCH%, ${archiso_platform})" — keep ' +
        'the rest of the line exactly as it is.',
      why:
        'The bootloader configuration is the last part of the profile, and it is the ' +
        'part a user actually sees. grub/ serves UEFI machines and syslinux/ serves ' +
        'BIOS machines; each is a directory of plain configuration files. A profile ' +
        'that names a boot mode has to have the matching directory, and the menu ' +
        'entries in it are the same template mechanism everywhere: %INSTALL_DIR% and ' +
        'friends are filled in at build time.',
    }),
  ],

  /**
   * The state a learner who did this properly ends up in.
   *
   * The verifier applies this and asserts that every task then passes, and that
   * no task was already satisfied before the learner started. It is also the
   * worked example the lab report can offer.
   *
   * Every file a check reads is returned here, not just the ones that change:
   * profiledef.sh, packages.x86_64, the overlay's motd and the grub menu.
   */
  solution: (s) => {
    const files = {
      'profiledef.sh': `#!/usr/bin/env bash
# shellcheck disable=SC2034
#
# Vesper — the profile definition.
#
# This file describes the image itself: what it is called, what it is labelled,
# where its files sit on the disc, and which boot loaders to bake into it.

# The first half of the output filename: <iso_name>-<iso_version>-<arch>.iso
iso_name="vesper"

# The ISO 9660 volume label — the name the disc is given inside a file manager.
iso_label="VESPER_202611"

# Free-form strings recorded in the ISO's own metadata.
iso_publisher="Arch Linux <https://archlinux.org>"
iso_application="Arch Linux baseline"

# The version string that goes in the middle of the filename.
iso_version="2026.11.10"

# Where the image's files live on the ISO. Lowercase letters and digits only.
install_dir="vesper"

# Which architecture this profile builds for. It also picks the package list:
# packages.\${arch}, which is packages.x86_64.
arch="x86_64"

# Which boot loaders to bake into the image.
bootmodes=('bios.syslinux'
           'uefi.grub')

# The pacman configuration that governs the build. Without it, archiso uses the
# build machine's own /etc/pacman.conf.
pacman_conf="pacman.conf"

# The image format for the root filesystem.
airootfs_image_type="squashfs"

# Files that need an owner or a mode the overlay cannot carry.
file_permissions=(
  ["/etc/shadow"]="0:0:400"
)
`,
      'packages.x86_64': `# Packages installed into the Vesper image.
#
# One package per line. Blank lines and lines starting with # are ignored.

base
linux
mkinitcpio
mkinitcpio-archiso

# Boot loaders, matched to the bootmodes in profiledef.sh.
syslinux
grub

# A shell and a text editor, so the image is usable from a serial console.
nano
vim
`,
      'airootfs/etc/motd': `Welcome to Vesper.

This message is printed the first time somebody logs in.
`,
      'grub/grub.cfg': `# GRUB configuration for the Vesper image.
#
# The identifiers in percent signs are replaced by mkarchiso when the image
# is built:
#   %INSTALL_DIR%  — the install_dir from profiledef.sh
#   %ARCH%         — the target architecture
#   %ARCHISO_UUID% — the ISO 9660 volume id, used to find the medium at boot

# Load partition table and file system modules
insmod part_gpt
insmod part_msdos
insmod fat
insmod iso9660
insmod ntfs
insmod ntfscomp
insmod exfat
insmod udf

# Set default menu entry
default=archlinux
timeout=15
timeout_style=menu

# Menu entries

menuentry "Vesper Linux (%ARCH%, \${archiso_platform})" --class arch --class gnu-linux --class gnu --class os --id 'archlinux' {
    set gfxpayload=keep
    linux /%INSTALL_DIR%/boot/%ARCH%/vmlinuz-linux archisobasedir=%INSTALL_DIR% archisosearchuuid=%ARCHISO_UUID%
    initrd /%INSTALL_DIR%/boot/%ARCH%/initramfs-linux.img
}

menuentry 'System shutdown' --class shutdown --class poweroff {
    echo 'System shutting down...'
    halt
}
`,
    };
    applySolution(s, files);
    return files;
  },

  report: {
    lede:
      'You have read a profile the way an archiso maintainer reads one: five parts, ' +
      'each with one job. Everything else in this course hangs off that shape — the ' +
      'package list, the overlay and the boot menus are each one of those five parts ' +
      'seen from a different side.',
    next:
      'Next: the package list and the pacman configuration, which is where the image ' +
      'actually gets its contents and its sources.',
  },
};
