/**
 * Lab 04 — boot loaders and boot modes.
 *
 * A profile says which boot loaders to bake in with `bootmodes`. This lab has
 * two of them — bios.syslinux and uefi.grub — and the menus are templates
 * whose %PLACEHOLDERS% are filled in at build time.
 */

import {
  task, ok, no, fileExists, fileMatches,
} from '../assets/checks.js';

const PROFILE = 'profiledef.sh';
const GRUB = 'grub/grub.cfg';
const SYSLINUX = 'syslinux/syslinux.cfg';

/**
 * The grub menu entries in a config file: their titles and their bodies.
 * A grub menuentry is a block: a title in quotes, then a body in braces.
 */
function menuEntries(content) {
  const out = [];
  const re = /menuentry\s+"([^"]*)"([^{]*)\{([\s\S]*?)\}/g;
  let match;
  while ((match = re.exec(String(content || '')))) {
    out.push({ label: match[1], body: match[3] });
  }
  return out;
}

/** The boot modes named in the bootmodes array of profiledef.sh. */
function bootModes(content) {
  const match = String(content || '').match(/bootmodes\s*=\s*\(([^)]*)\)/);
  if (!match) return null;
  return match[1]
    .split(/\s+/)
    .map((s) => s.replace(/^["']|["']$/g, ''))
    .filter(Boolean);
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

export const isoBootloaders = {
  id: 'iso-bootloaders',
  track: 'iso',
  title: 'Boot loaders and boot modes',
  subtitle: 'Which machines can boot your image, and how the menu is written.',

  scenario:
    'The image builds. It boots on your laptop. It does not boot on the machine in ' +
    'the cupboard with the old firmware, and you have no idea why. The answer is ' +
    'usually two words long, and they are written in `profiledef.sh`: bootmodes. ' +
    'This lab is about that array, and about the menus it points at.',

  teaches:
    'A boot loader is the program that the firmware hands control to. There are two ' +
    'ways a PC starts up, and they are genuinely different machines: BIOS — the old ' +
    'firmware, booted through a small bootloader called syslinux — and UEFI — the ' +
    'newer firmware, booted through GRUB or systemd-boot. A profile says which of ' +
    'them to bake into the image with the `bootmodes` array in profiledef.sh. Two ' +
    'values matter here: `bios.syslinux` for BIOS machines, and `uefi.grub` for UEFI ' +
    'ones. Each needs its own directory of configuration: `syslinux/` and `grub/`.\n\n' +
    'The menu entries are templates. `%INSTALL_DIR%`, `%ARCH%` and `%ARCHISO_UUID%` ' +
    'are placeholders that mkarchiso fills in when the image is built: the install ' +
    'directory, the target architecture, and the volume id of the ISO — which the ' +
    'initramfs uses to find the medium it booted from. That is why the same ' +
    'configuration file works for every build: nothing in it is hard-coded, and the ' +
    'same is true of the syslinux side, which uses the same placeholders in the ' +
    'same way.\n\n' +
    'One difference worth holding on to: in syslinux the kernel parameters live on ' +
    'the APPEND line; in grub they live on the `linux` line. Same parameters, ' +
    'different spelling.',

  readFirst: [
    {
      title: 'The two machines',
      body: [
        'BIOS: the firmware that loads a bootloader from the first megabytes of the ' +
        'disc. Small, simple, and still what a lot of older machines do. archiso ' +
        'serves it with syslinux, whose configuration lives in the profile\'s ' +
        'syslinux/ directory.',
        'UEFI: the newer firmware, which loads a bootloader from an EFI system ' +
        'partition. archiso serves it with grub, whose configuration lives in the ' +
        'profile\'s grub/ directory.',
        'An image can carry both. It cannot carry one and boot on the other, which ' +
        'is why bootmodes is a list and not a single value.',
      ],
    },
    {
      title: 'Kernel parameters',
      body: [
        'The kernel takes instructions on its command line: which console to use, ' +
        'whether to use the graphics driver, and so on. In grub they go on the line ' +
        'that starts with `linux`. In syslinux they go on the line that starts with ' +
        'APPEND. The same parameter, spelled in the place each bootloader expects.',
      ],
    },
  ],

  env: {
    type: 'editor',
    prompt:
      'The profile and its two boot menus, open. Change them; the tasks are checked ' +
      'against what they now say.',
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

# Which boot loaders to bake into the image.
#
#   bios.syslinux  — booting a BIOS/CSM machine
#   uefi.grub      — booting a UEFI machine
bootmodes=('uefi.grub')

pacman_conf="pacman.conf"

airootfs_image_type="squashfs"
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
    initrd /%INSTALL_DIR%/boot/%ARCH%/initramfs.img
}

menuentry 'System shutdown' --class shutdown --class poweroff {
    echo 'System shutting down...'
    halt
}
`,
      'syslinux/syslinux.cfg': `SERIAL 0 115200
UI menu.c32
MENU TITLE Vesper Linux
MENU CLEAR

DEFAULT vesper
TIMEOUT 30
`,
    },
    cwd: '/home/learner',
  },

  tasks: [
    task({
      id: 'boot-modes',
      prompt:
        'In `profiledef.sh`, the `bootmodes` array lists only `uefi.grub`. Add ' +
        '`bios.syslinux` so the image also boots on a BIOS/CSM machine.',
      check: (s) => {
        const modes = bootModes(s.sim.readFile(PROFILE) || '');
        if (modes === null) {
          return no('profiledef.sh has no bootmodes array. Without it, archiso has ' +
            'no boot loader to install and the image will not boot at all.');
        }
        if (modes.includes('bios.syslinux') && modes.includes('uefi.grub')) return ok('');
        if (!modes.includes('bios.syslinux')) {
          return no(`bootmodes currently lists ${modes.map((m) => `'${m}'`).join(', ')}. ` +
            'That means the image will boot on a UEFI machine and on nothing else — ' +
            'a BIOS/CSM machine would show no menu at all. Add \'bios.syslinux\' to ' +
            'the array.');
        }
        return no('bootmodes no longer lists uefi.grub. Both are needed if the image ' +
          'is to boot on a UEFI machine and on a BIOS machine.');
      },
      hint:
        'bootmodes is an array in profiledef.sh, one quoted string per entry. There ' +
        'is a line break between the two entries.',
      hint2:
        "It should look like: bootmodes=('bios.syslinux'\n           'uefi.grub')",
      why:
        'The firmware decides which bootloader it looks for; the profile decides ' +
        'which ones are present on the disc. A UEFI machine reads the EFI system ' +
        'partition and finds grub; a BIOS machine reads the boot sector and finds ' +
        'syslinux. A profile that names only one of them builds an image that ' +
        'silently does nothing on the other kind of machine — and "it boots on mine" ' +
        'is exactly how that mistake survives a release.',
    }),

    task({
      id: 'grub-initrd',
      prompt:
        'Look at the grub menu entry in `grub/grub.cfg`. It loads the kernel and then ' +
        'the initramfs — the small filesystem the kernel unpacks into before it can ' +
        'mount the image. The initrd line names a file that does not exist. Fix it: ' +
        'the initramfs in the image is called `initramfs-linux.img`.',
      check: (s) => {
        if (!fileExists(s.sim, GRUB)) {
          return no('grub/grub.cfg is missing.');
        }
        if (fileMatches(s.sim, GRUB, '^\\s*initrd\\s+\\/%INSTALL_DIR%\\/boot\\/%ARCH%\\/initramfs-linux\\.img\\s*$', 'm')) {
          return ok('');
        }
        const entries = menuEntries(s.sim.readFile(GRUB) || '');
        const entry = entries.find((e) => /vmlinuz-linux/.test(e.body));
        const current = entry && (entry.body.match(/^\s*initrd\s+(\S+)/m) || [])[1];
        return no(`The grub entry loads ${current || 'no initrd at all'}. grub is told ` +
          'exactly where to find the initramfs and does not go looking for it, so ' +
          'the name has to match the file in the image: initramfs-linux.img. The ' +
          'kernel on the same entry is vmlinuz-linux — the two names go together.');
      },
      hint:
        'The entry has two lines that load files: one starting with linux, one ' +
        'starting with initrd. The initrd line names initramfs.img; the file in ' +
        'the image is called initramfs-linux.img.',
      hint2:
        'The line should read: initrd /%INSTALL_DIR%/boot/%ARCH%/initramfs-linux.img',
      why:
        'The kernel can only mount a root filesystem by way of the initramfs, and ' +
        'the initramfs is only useful if grub hands it over. Boot loaders do not ' +
        'search: they are told a path and they load what is there. A wrong name ' +
        'here gives you a black screen, which is the least informative failure ' +
        'mode there is.',
    }),

    task({
      id: 'safe-entry',
      prompt:
        'Add a second grub menu entry, for machines whose screen comes up black ' +
        'because the graphics driver misbehaves. Give it a title that contains the ' +
        'word "safe", and have it load the same kernel — using the %INSTALL_DIR% ' +
        'placeholder, not a path you typed in yourself.',
      check: (s) => {
        const entries = menuEntries(s.sim.readFile(GRUB) || '');
        const safe = entries.find((e) => /safe/i.test(e.label));
        if (!safe) {
          return no('There is no grub menu entry whose title contains "safe" yet. ' +
            'Add a menuentry block: a title in double quotes, then the commands ' +
            'inside braces.');
        }
        if (!/^\s*linux\s+/m.test(safe.body)) {
          return no(`The "safe" entry does not have a line starting with linux, so it ` +
            'boots nothing. A grub entry that loads a kernel needs a linux line ' +
            'pointing at it.');
        }
        if (!/\/%INSTALL_DIR%\/boot\/%ARCH%\/vmlinuz-linux/.test(safe.body)) {
          return no('The "safe" entry does not use %INSTALL_DIR%. Do not type the ' +
            'directory in yourself — write %INSTALL_DIR% and %ARCH% as they are, ' +
            'because mkarchiso replaces them when the image is built. A path typed ' +
            'in by hand breaks the moment the install_dir changes.');
        }
        return ok('');
      },
      hint:
        'Copy the existing entry, change its title to something like "Vesper Linux ' +
        '(safe graphics)", and change the kernel parameters on the linux line.',
      hint2:
        'A new block like: menuentry "Vesper Linux (safe graphics)" --id \'vesper-safe\' { ' +
        'linux /%INSTALL_DIR%/boot/%ARCH%/vmlinuz-linux … }',
      why:
        'A second entry is a second set of kernel parameters on the same kernel. ' +
        'This is how a distribution offers a fallback for a machine whose video ' +
        'card does not work — and it is only worth having if the path is written ' +
        'with the placeholders, because the path is only correct for one build.',
    }),

    task({
      id: 'archiso-uuid',
      prompt:
        'The entry whose title contains "safe" also has to carry `%ARCHISO_UUID%`. It ' +
        'is not a typo and it is not a placeholder for you to fill in: mkarchiso ' +
        'replaces it at build time with the volume id of the finished ISO, which is ' +
        'how the initramfs finds the medium it was booted from.',
      check: (s) => {
        const entries = menuEntries(s.sim.readFile(GRUB) || '');
        const safe = entries.find((e) => /safe/i.test(e.label));
        if (!safe) {
          return no('There is no grub menu entry whose title contains "safe" yet.');
        }
        if (!/%ARCHISO_UUID%/.test(safe.body)) {
          return no('The "safe" entry does not mention %ARCHISO_UUID%. The kernel ' +
            'needs archisosearchuuid=%ARCHISO_UUID% so the initramfs can find the ' +
            'ISO it was booted from. Leave the placeholder exactly as it is — mkarchiso ' +
            'fills it in at build time, and a UUID typed in by hand would be wrong ' +
            'for every image except one.');
        }
        return ok('');
      },
      hint:
        'Look at the linux line of the first grub entry. It ends with ' +
        'archisosearchuuid=%ARCHISO_UUID%. Your new entry needs the same thing.',
      hint2:
        'The linux line should end with something like: archisobasedir=%INSTALL_DIR% ' +
        'archisosearchuuid=%ARCHISO_UUID%',
      why:
        'The initramfs has to find the root filesystem on the disc, and the disc has ' +
        'a unique volume id. The bootloader does not know it, so it cannot be ' +
        'written into the configuration at the time you wrote the configuration — ' +
        'it is filled in when the image is built. That is the whole trick behind ' +
        'these placeholders: one file, correct for every build.',
    }),

    task({
      id: 'grub-timeout',
      prompt:
        'The grub menu waits 15 seconds before it boots the default entry. Change ' +
        'it to 5 seconds, in `grub/grub.cfg`.',
      check: (s) => {
        const content = s.sim.readFile(GRUB) || '';
        if (/^\s*timeout\s*=\s*5\s*$/m.test(content)) return ok('');
        const current = (content.match(/^\s*timeout\s*=\s*(\S+)/m) || [])[1];
        return no(`The grub menu still waits ${current || 'some number of'} seconds. ` +
          'The timeout is the number of seconds the menu waits before it boots the ' +
          'default entry — set it to 5. (The BIOS menu has its own setting: TIMEOUT ' +
          'in syslinux/syslinux.cfg. The two are separate.)');
      },
      hint:
        'Near the top of grub/grub.cfg, next to the default= line, there is a ' +
        'timeout= line.',
      hint2:
        'The line should read: timeout=5',
      why:
        'The timeout is the difference between an image that feels quick and one ' +
        'that feels broken. It is set per bootloader, because each has its own ' +
        'menu, and a profile that carries both boot loaders should keep both ' +
        'timeouts in step — a mismatch is a small thing that makes a distribution ' +
        'feel unfinished.',
    }),

    task({
      id: 'syslinux-entry',
      prompt:
        'Now the BIOS side. `syslinux/syslinux.cfg` has no entry in it at all. Write ' +
        'the one that matches the grub menu: a LABEL, a LINUX line pointing at ' +
        '/%INSTALL_DIR%/boot/%ARCH%/vmlinuz-linux, an INITRD line pointing at ' +
        '/%INSTALL_DIR%/boot/%ARCH%/initramfs-linux.img, and an APPEND line ' +
        'carrying `archisobasedir=%INSTALL_DIR%` and ' +
        '`archisosearchuuid=%ARCHISO_UUID%`.',
      check: (s) => {
        if (!fileExists(s.sim, SYSLINUX)) {
          return no('syslinux/syslinux.cfg is missing.');
        }
        const content = s.sim.readFile(SYSLINUX) || '';
        if (!/^\s*LABEL\s+\S+/m.test(content)) {
          return no('There is no LABEL in syslinux/syslinux.cfg. A syslinux entry ' +
            'starts with a LABEL — the name of the entry.');
        }
        if (!/^\s*LINUX\s+\/%INSTALL_DIR%\/boot\/%ARCH%\/vmlinuz-linux\s*$/m.test(content)) {
          return no('There is no LINUX line pointing at ' +
            '/%INSTALL_DIR%/boot/%ARCH%/vmlinuz-linux in syslinux/syslinux.cfg. ' +
            'That is where the kernel is on the disc, and it is spelled with the ' +
            'same placeholders the grub menu uses.');
        }
        if (!/^\s*INITRD\s+\/%INSTALL_DIR%\/boot\/%ARCH%\/initramfs-linux\.img\s*$/m.test(content)) {
          return no('There is no INITRD line pointing at ' +
            '/%INSTALL_DIR%/boot/%ARCH%/initramfs-linux.img in ' +
            'syslinux/syslinux.cfg. It has to match the grub entry exactly.');
        }
        if (!/^\s*APPEND\s+.*archisobasedir=%INSTALL_DIR%/m.test(content)) {
          return no('The APPEND line does not carry archisobasedir=%INSTALL_DIR%. ' +
            'That is the kernel parameter that tells the initramfs which directory ' +
            'on the disc the image lives in.');
        }
        if (!/^\s*APPEND\s+.*archisosearchuuid=%ARCHISO_UUID%/m.test(content)) {
          return no('The APPEND line does not carry archisosearchuuid=%ARCHISO_UUID%. ' +
            'The BIOS menu needs the same volume-id placeholder the UEFI menu has — ' +
            'the same placeholders, in the same way.');
        }
        return ok('');
      },
      hint:
        'Syslinux entries are four lines: LABEL, MENU LABEL, LINUX, INITRD, APPEND. ' +
        'The LINUX and INITRD paths are the same ones the grub entry uses.',
      hint2:
        'Something like:\n' +
        'LABEL vesper\n' +
        '  MENU LABEL Vesper Linux (%ARCH%, BIOS)\n' +
        '  LINUX /%INSTALL_DIR%/boot/%ARCH%/vmlinuz-linux\n' +
        '  INITRD /%INSTALL_DIR%/boot/%ARCH%/initramfs-linux.img\n' +
        '  APPEND archisobasedir=%INSTALL_DIR% archisosearchuuid=%ARCHISO_UUID%',
      why:
        'The two menus are the same boot in two dialects. The paths are identical, ' +
        'and so are the placeholders: %INSTALL_DIR%, %ARCH% and %ARCHISO_UUID% mean ' +
        'exactly the same thing on both sides, and mkarchiso fills all three in at ' +
        'build time. A profile that gets these two out of step produces an image ' +
        'that boots on a UEFI laptop and not on the BIOS machine beside it.',
    }),

    task({
      id: 'kernel-parameters',
      prompt:
        'Last one, and it is the difference between the two dialects. Add the kernel ' +
        'parameter `nomodeset` to BOTH menus: in grub it goes on the line starting ' +
        'with `linux`, in syslinux it goes on the APPEND line.',
      check: (s) => {
        const grub = s.sim.readFile(GRUB) || '';
        const sys = s.sim.readFile(SYSLINUX) || '';
        const inGrub = /^\s*linux\s+.*\bnomodeset\b/m.test(grub);
        const inSys = /^\s*APPEND\s+.*\bnomodeset\b/m.test(sys);
        if (inGrub && inSys) return ok('');
        if (!inGrub && !inSys) {
          return no('Neither menu passes nomodeset to the kernel yet. nomodeset ' +
            'tells the kernel not to use the graphics driver — which is how the ' +
            'safe entry stays useful. Put it on the linux line in grub/grub.cfg and ' +
            'on the APPEND line in syslinux/syslinux.cfg.');
        }
        if (!inGrub) {
          return no('The syslinux menu has nomodeset, but the grub menu does not. ' +
            'In grub the kernel parameters go on the line that starts with linux — ' +
            'the same place archisosearchuuid=%ARCHISO_UUID% lives.');
        }
        return no('The grub menu has nomodeset, but the syslinux menu does not. ' +
          'In syslinux the kernel parameters go on the APPEND line — the same line ' +
          'that carries archisobasedir=%INSTALL_DIR%.');
      },
      hint:
        'Two different lines in two different files. Grub: the line starting with ' +
        'linux. Syslinux: the line starting with APPEND.',
      hint2:
        'In grub/grub.cfg, the linux line ends with something like: ' +
        'archisosearchuuid=%ARCHISO_UUID% nomodeset. In syslinux/syslinux.cfg, the ' +
        'APPEND line ends with something like: archisosearchuuid=%ARCHISO_UUID% ' +
        'nomodeset',
      why:
        'Kernel parameters are instructions to the kernel, and each bootloader has ' +
        'its own place for them: the command line in grub, the APPEND line in ' +
        'syslinux. They are the same instructions in two spellings, which is why a ' +
        'parameter that works on one machine has to be added in two places for the ' +
        'other one to behave the same way.',
    }),
  ],

  /**
   * The state a learner who did this properly ends up in.
   *
   * The verifier applies this and asserts that every task then passes, and that
   * no task was already satisfied before the learner started. It is also the
   * worked example the lab report can offer.
   *
   * Every file a check reads is returned here: the profile and both boot
   * menus, because the two menus have to agree.
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

# Which boot loaders to bake into the image.
#
#   bios.syslinux  — booting a BIOS/CSM machine
#   uefi.grub      — booting a UEFI machine
bootmodes=('bios.syslinux'
           'uefi.grub')

pacman_conf="pacman.conf"

airootfs_image_type="squashfs"
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
timeout=5
timeout_style=menu

# Menu entries

menuentry "Vesper Linux (%ARCH%, \${archiso_platform})" --class arch --class gnu-linux --class gnu --class os --id 'archlinux' {
    set gfxpayload=keep
    linux /%INSTALL_DIR%/boot/%ARCH%/vmlinuz-linux archisobasedir=%INSTALL_DIR% archisosearchuuid=%ARCHISO_UUID%
    initrd /%INSTALL_DIR%/boot/%ARCH%/initramfs-linux.img
}

menuentry "Vesper Linux (safe graphics)" --class vesper --class gnu-linux --class gnu --class os --id 'vesper-safe' {
    set gfxpayload=keep
    linux /%INSTALL_DIR%/boot/%ARCH%/vmlinuz-linux archisobasedir=%INSTALL_DIR% archisosearchuuid=%ARCHISO_UUID% nomodeset
    initrd /%INSTALL_DIR%/boot/%ARCH%/initramfs-linux.img
}

menuentry 'System shutdown' --class shutdown --class poweroff {
    echo 'System shutting down...'
    halt
}
`,
      'syslinux/syslinux.cfg': `SERIAL 0 115200
UI menu.c32
MENU TITLE Vesper Linux
MENU CLEAR

DEFAULT vesper
TIMEOUT 30

LABEL vesper
  MENU LABEL Vesper Linux (%ARCH%, BIOS)
  LINUX /%INSTALL_DIR%/boot/%ARCH%/vmlinuz-linux
  INITRD /%INSTALL_DIR%/boot/%ARCH%/initramfs-linux.img
  APPEND archisobasedir=%INSTALL_DIR% archisosearchuuid=%ARCHISO_UUID% nomodeset
`,
    };
    applySolution(s, files);
    return files;
  },

  report: {
    lede:
      'You now know how a profile claims a machine. `bootmodes` says which boot ' +
      'loaders go on the disc, each with its own directory of configuration, and ' +
      'both menus are written in templates that mkarchiso fills in at build time. ' +
      'The BIOS and UEFI paths are the same boot in two dialects — same placeholders, ' +
      'different spelling for the kernel parameters.',
    next:
      'Next: building it. mkarchiso, the errors you will meet, and how to read them.',
  },
};
