/**
 * Lab 3 of the ISO track: testing the image.
 *
 * A build that succeeds is not a build that works. The image has to boot,
 * and it has to contain what you meant it to contain. This lab builds the
 * image, boots it, reads the test report, and asks the learner to fix
 * what the test found.
 *
 * The build environment is used here because the point of the lab is the
 * report, not the editor: the first run comes back red, the learner reads
 * what the test said, fixes the profile, and rebuilds.
 */

import { task, ok, no, isoBooted } from '../assets/checks.js';
import { el } from '../assets/lab.js';

const PACKAGES = `#
# Packages installed into the Vesper image.
#
# One package per line. Blank lines and lines starting with # are ignored.

base
linux
mkinitcpio

# Boot loaders, matched to the bootmodes in profiledef.sh.
syslinux
grub

# A shell and a text editor, so the image is usable from a serial console
# and so a student can change something inside the running system.
nano

# Enough tooling to look around at what the image actually contains.
git
tree
file
`;

const PACMAN_CONF = `#
# The pacman configuration mkarchiso uses to BUILD the image.
#

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
`;

const GRUB_CFG = `# GRUB configuration for the image.
#
# The identifiers in percent signs are replaced by mkarchiso when the image
# is built:
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

const RUNTIME_PACMAN_CONF = `#
# The pacman configuration inside the RUNNING image.
#
# This is the one the pacman package installed, unchanged.
#

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
`;

const PACMAN_INIT_SERVICE = `# The pacman keyring has to exist and be populated before pacman can verify
# anything. \`pacman-key --init\` creates the keyring; \`--populate\` imports the
# keyrings shipped by the archlinux-keyring package. Neither happens on its
# own.
#
# Two units are needed together, and this is the part that is easy to get
# wrong:
#
#   etc-pacman.d-gnupg.mount   mounts a tmpfs over /etc/pacman.d/gnupg so the
#                              trusted keys live in memory, not on the medium
#   pacman-init.service        runs the two pacman-key commands
#
# The service declares \`Requires=etc-pacman.d-gnupg.mount\`. systemd treats a
# missing requirement as a failed dependency and drops the service **without
# saying anything in the boot log** — no error, no failure line. The symptom
# is that the image boots fine, the login prompt appears, and pacman inside
# it cannot install a single package.

[Unit]
Description=Initializes the Vesper pacman keyring
Requires=etc-pacman.d-gnupg.mount
After=etc-pacman.d-gnupg.mount time-sync.target
BindsTo=etc-pacman.d-gnupg.mount
Before=archlinux-keyring-wkd-sync.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/pacman-key --init
ExecStart=/usr/bin/pacman-key --populate

[Install]
WantedBy=multi-user.target
`;

const GNUPG_MOUNT = `# The pacman keyring is mounted as a tmpfs at boot, so the trusted keys live
# in memory and never touch the medium.
#
# This unit has to be shipped alongside pacman-init.service. The service
# declares \`Requires=etc-pacman.d-gnupg.mount\`, and systemd treats a
# missing requirement as a failed dependency: the service is dropped without
# a word in the boot log, the keyring is never initialised, and pacman in
# the running image cannot install anything.
#
# This file was copied out of another profile and never finished.

[Unit]
Description=Temporary /etc/pacman.d/gnupg directory
`;

const PROFILE_FILES = [
  'packages.x86_64',
  'pacman.conf',
  'grub/grub.cfg',
  'airootfs/etc/pacman.conf',
  'airootfs/etc/systemd/system/pacman-init.service',
  'airootfs/etc/systemd/system/etc-pacman.d-gnupg.mount',
];

// ---------------------------------------------------------------- helpers

/** The package names in a package list, without the comments. */
function packageList(content) {
  return String(content || '')
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

/** The `Server =` lines in a pacman configuration. */
function servers(content) {
  const out = [];
  for (const m of String(content || '').matchAll(/^\s*Server\s*=\s*(\S+)/gm)) {
    out.push(m[1]);
  }
  return out;
}

/** The host name of a mirror URL. */
function hostOf(url) {
  const m = String(url).match(/^https?:\/\/([^/]+)/);
  return m ? m[1] : String(url);
}

/** The title of the first GRUB menu entry. */
function menuTitle(content) {
  const m = String(content || '').match(/menuentry\s+["']([^"']+)["']/);
  return m ? m[1] : 'no menu entry';
}

/**
 * Everything the test knows about the image, read out of the profile.
 *
 * The test does not read the profile directly — it reads the image the
 * profile produces. These functions work out what that image would be.
 */
function inspect(sim) {
  const packages = packageList(sim.readFile('packages.x86_64'));
  const grub = sim.readFile('grub/grub.cfg') || '';
  const runtimeConf = sim.readFile('airootfs/etc/pacman.conf') || '';
  const buildConf = sim.readFile('pacman.conf') || '';
  const mountUnit = sim.readFile(
    'airootfs/etc/systemd/system/etc-pacman.d-gnupg.mount') || '';
  const initUnit = sim.readFile(
    'airootfs/etc/systemd/system/pacman-init.service') || '';

  // An image boots when it has a kernel, the tools to build an initramfs,
  // the archiso hook that lets the initramfs find the medium, and a boot
  // loader to start them.
  const hasKernel = packages.includes('linux');
  const hasInitcpio = packages.includes('mkinitcpio');
  const hasArchisoHook = packages.includes('mkinitcpio-archiso');
  const hasBootloader = packages.includes('grub') || packages.includes('syslinux');
  const hasMenu = /menuentry/.test(grub);
  const booted = hasKernel && hasInitcpio && hasArchisoHook &&
    hasBootloader && hasMenu;

  // The runtime configuration. With no Server line of its own, the image
  // falls back to the mirrorlist pacstrap copied off the build machine.
  const runtimeServers = servers(runtimeConf);
  const runtimeMirror = runtimeServers.length
    ? hostOf(runtimeServers[0])
    : 'inherited from the build machine (/etc/pacman.d/mirrorlist)';

  // The keyring needs both units, and the mount has to be a real mount
  // over the directory pacman actually uses.
  const mountIsReal = /\[Mount\]/.test(mountUnit) &&
    /What\s*=\s*tmpfs/.test(mountUnit) &&
    /Where\s*=\s*\/etc\/pacman\.d\/gnupg/.test(mountUnit);
  const initIsReal = /pacman-key --init/.test(initUnit) &&
    /pacman-key --populate/.test(initUnit);
  const keyring = mountIsReal && initIsReal;

  const buildServers = servers(buildConf);

  // Why the image does not boot, if it does not.
  let bootReason = '';
  if (!booted) {
    if (!hasKernel) bootReason = 'there is no kernel in the image';
    else if (!hasInitcpio) bootReason = 'there is no initramfs builder in the image';
    else if (!hasArchisoHook) {
      bootReason = 'the initramfs has no hook that knows how to find the ISO';
    } else if (!hasBootloader) bootReason = 'there is no boot loader in the image';
    else if (!hasMenu) bootReason = 'there is no boot menu';
    else bootReason = 'the bootloader did not find the kernel';
  }

  return {
    packages,
    booted,
    bootReason,
    bootMenu: menuTitle(grub),
    runtimeMirror,
    keyring,
    expectedMirror: buildServers.length ? hostOf(buildServers[0]) : '',
  };
}

/** The report the pipeline prints after building and booting. */
function reportLog(facts, problems) {
  const lines = [
    'Running with gitlab-runner 17.4.0 (f4a1b2c)',
    '  on academy-runner-01 xY3zAbCd, 2 CPUs',
    '$ git fetch --depth 1 origin main',
    '$ git checkout 3a91f0c',
    '$ ./archiso/mkarchiso -w work -o out profile',
    '[mkarchiso] INFO: Validating options...',
    '[mkarchiso] INFO: Done!',
    '[mkarchiso] INFO: Installing packages to ' +
      '\'/home/runner/builds/vesper/work/x86_64/airootfs/\'...',
    '[mkarchiso] INFO: Done! Packages installed successfully.',
    '[mkarchiso] INFO: Setting up GRUB for UEFI booting...',
    '[mkarchiso] INFO: Done! GRUB set up for UEFI booting successfully.',
    '[mkarchiso] INFO: Setting up SYSLINUX for BIOS booting...',
    '[mkarchiso] INFO: Done! SYSLINUX set up for BIOS booting successfully.',
    '[mkarchiso] INFO: Creating SquashFS image, this may take some time...',
    '[mkarchiso] INFO: Creating checksum file for self-test...',
    '[mkarchiso] INFO: Creating ISO image...',
    '[mkarchiso] INFO: Done!',
    '481M\tout/vesper-2026.11.10-x86_64.iso',
    '== boot test ==',
    'Boot-testing vesper-2026.11.10-x86_64.iso (uefi mode)...',
  ];

  if (facts.booted) {
    lines.push('PASS: the image booted to a login prompt.');
  } else {
    lines.push('FAIL: the image did not reach a login prompt.');
    lines.push('Last lines of the serial console:');
    lines.push('  [    1.884210] mount: /run/archiso/bootmnt: no such file or directory');
    lines.push('  ALERT: Failed to mount the ISO root filesystem.');
    lines.push('  initramfs: unable to mount root filesystem');
    lines.push('  Kernel panic - not syncing: VFS: Unable to mount root fs');
  }

  lines.push('== image checks ==');
  lines.push('  volume label: VESPER_202611');
  lines.push('  boot menu: ' + facts.bootMenu);
  lines.push('  boot: ' + (facts.booted
    ? 'PASS — the image reached a login prompt'
    : 'FAIL — ' + facts.bootReason));
  lines.push('  runtime mirror: ' + facts.runtimeMirror);
  lines.push('  pacman keyring: ' + (facts.keyring ? 'initialised' : 'not initialised'));
  if (!facts.keyring) {
    lines.push('WARN: the log does not mention the pacman keyring mount.');
    lines.push('      pacman inside this image probably cannot install anything.');
  }

  if (problems.length) {
    lines.push('ERROR: Job failed: build_and_test');
  } else {
    lines.push('== release ==');
    lines.push('Uploading release asset vesper-2026.11.10-x86_64.iso');
    lines.push('https://gitlab.acreetionos.org/archiso-bootcamp-academy/vesper/-/' +
      'releases/v2026.11.10/downloads/vesper-2026.11.10-x86_64.iso');
  }

  return lines.join('\n') + '\n';
}

/**
 * Give the learner a way to build again.
 *
 * The build panel offers its button while the job is idle or running, and
 * takes it away once the job has finished. This lab needs the other half of
 * the loop — fix the profile, build again — so the button is put back when
 * the panel has none of its own. If the runner ever grows one, this notices
 * and stays out of the way.
 */
function attachBuildAgain(runner) {
  if (!runner || runner.vesperBuildAgain) return;
  if (typeof runner.renderBuild !== 'function') return;
  runner.vesperBuildAgain = true;

  const original = runner.renderBuild.bind(runner);
  runner.renderBuild = () => {
    original();
    const panel = runner.buildEl;
    if (!panel) return;
    if (panel.querySelector('button')) return;
    const wrap = el('div', { class: 'build-actions' });
    wrap.appendChild(el('button', {
      class: 'btn',
      type: 'button',
      onclick: () => runner.startBuild(),
    }, 'Build again'));
    panel.appendChild(wrap);
  };
}

/**
 * Put the profile's files in front of the learner.
 *
 * A build environment shows the build, not the files, so the files get
 * their own editor here. If the runner ever grows an editor of its own for
 * build environments, this notices and stays out of the way.
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

    env.insertBefore(wrap, runner.buildEl || null);
  }, 0);
}

/** The simulator for the current run. Set up in `start`, read in `onBuild`. */
let currentSim = null;

/**
 * Build the image from a profile and report what the test found.
 *
 * The facts come out of the profile, so this reads the simulator the learner
 * is editing: fix the profile, build again, get new facts.
 *
 * @param {Object} ctx   the build context the runner hands in
 * @param {Sim} sim      the simulator holding the profile
 */
function buildAndReport(ctx, sim) {
  const facts = inspect(sim);
  const problems = [];

  if (!facts.booted) {
    problems.push('the image did not reach a login prompt');
  }
  if (!/vesper/i.test(facts.bootMenu)) {
    problems.push('the boot menu names the default, not the flavour');
  }
  if (facts.runtimeMirror !== facts.expectedMirror) {
    problems.push('the image is using the build machine\'s mirrors');
  }
  if (!facts.keyring) {
    problems.push('the pacman keyring is not initialised');
  }

  const iso = {
    path: 'vesper-2026.11.10-x86_64.iso',
    label: 'VESPER_202611',
    packages: facts.packages,
    booted: facts.booted,
    sizeBytes: 503656448,
    bootMenu: facts.bootMenu,
    bootReason: facts.bootReason,
    runtimeMirror: facts.runtimeMirror,
    expectedMirror: facts.expectedMirror,
    keyring: facts.keyring,
    release: problems.length ? '' :
      'https://gitlab.acreetionos.org/archiso-bootcamp-academy/vesper/-/' +
      'releases/v2026.11.10/downloads/vesper-2026.11.10-x86_64.iso',
    commit: '3a91f0c',
  };

  const log = reportLog(facts, problems);
  ctx.finish({ iso, log });

  // A failed test fails the job, and a failed job can be rebuilt. This
  // is what puts the build button back in the learner's hands.
  if (problems.length) {
    ctx.update({ status: 'failed', log });
  }
}

export const isoTestTheImage = {
  id: 'iso-test-the-image',
  track: 'iso',
  title: 'Testing the image',
  subtitle: 'It built. Now find out whether it works.',

  scenario:
    'The pipeline went green and there is an ISO sitting in your release ' +
    'page. It is easy to stop here, and it is exactly where a lot of people ' +
    'stop by mistake. An image can be built perfectly and still be useless: ' +
    'it might not boot, it might boot to the wrong menu, or it might boot ' +
    'and then be unable to install a single package.',

  teaches:
    'A build that succeeds is not a build that works. Two things have to be ' +
    'true, and they are separate things. The first is that the image ' +
    'boots: it needs a kernel, an initramfs built by mkinitcpio, the ' +
    'mkinitcpio-archiso hook that teaches that initramfs how to find the ' +
    'medium it is booting from, and a bootloader that starts all of it. The ' +
    'second is that the image contains what you meant it to contain: your ' +
    'packages, your boot menu, your mirrors, and a working pacman keyring. ' +
    'The pipeline builds the image, boots it under QEMU with the serial ' +
    'console as the only output, and prints what it found. Read that ' +
    'report. It is telling you what is in the image, not what you meant to ' +
    'put in it. One of the findings it reports is the one that catches ' +
    'people: a missing pacman keyring. Nothing in the boot log says ' +
    'anything is wrong. The image boots, the login prompt appears, and ' +
    'pacman inside it cannot install a single package.',

  readFirst: [
    {
      title: 'What the boot test actually does',
      body: [
        'The image is booted under QEMU with the serial console as the only ' +
        'output, and the test looks for a login prompt. If there is no ' +
        'login prompt, the test fails and prints the last twenty-five lines ' +
        'of the console.',
        'The serial console is only visible because the reference profile ' +
        'puts `console=tty0 console=ttyS0,115200` on the kernel command ' +
        'line. Without it, the test would see nothing at all and pass ' +
        'without having checked anything.',
        'A kernel panic about mounting the root filesystem nearly always ' +
        'means one thing: the initramfs could not find the medium. Either ' +
        'mkinitcpio-archiso is not in the package list, so the initramfs ' +
        'has no idea what an ISO is, or the bootloader pointed it at the ' +
        'wrong place.',
      ],
    },
    {
      title: 'The keyring, which fails quietly',
      body: [
        'pacman will not install anything it cannot verify. The keys it ' +
        'verifies against live in `/etc/pacman.d/gnupg`, and they have to be ' +
        'created at boot by `pacman-key --init` and `pacman-key --populate`. ' +
        'Neither happens on its own.',
        'Those two commands run from `pacman-init.service`. That service ' +
        'declares `Requires=etc-pacman.d-gnupg.mount` — the unit that mounts ' +
        'a tmpfs over `/etc/pacman.d/gnupg` so the keys live in memory and ' +
        'not on a read-only medium.',
        'Here is the trap: systemd treats a missing requirement as a failed ' +
        'dependency and drops the service. It does not print an error. The ' +
        'boot log says nothing at all. The image boots, the login prompt ' +
        'appears, and pacman cannot install anything. The test therefore ' +
        'does not only look for a login prompt; it also looks for the ' +
        'keyring mount in the log, and warns when it is not there.',
        'Ship both units. One without the other is worse than neither, ' +
        'because it looks like you did the right thing.',
      ],
    },
    {
      title: 'Two pacman configurations',
      body: [
        'The pacman configuration in your profile is the one the build ' +
        'uses. The pacman configuration inside the image is a different ' +
        'file, and it decides where the running system fetches packages ' +
        'from.',
        'They come apart because `mkarchiso` calls `pacstrap` with `-c`, ' +
        'which copies the *build machine\'s* mirrorlist over the image\'s ' +
        'own once the transaction is done. An image that relies on ' +
        '`/etc/pacman.d/mirrorlist` is quietly using the builder\'s ' +
        'mirrors, not yours.',
        'So the image needs its own mirror list, written into the ' +
        'overlay: `airootfs/etc/pacman.conf`. That file survives the ' +
        'package transaction, because `/etc/pacman.conf` is a `Backup =` ' +
        'file and pacman leaves an existing one alone.',
      ],
    },
  ],

  env: {
    type: 'build',
    prompt:
      'Start the build. It builds the image, boots it, and prints what the ' +
      'test found. When the test fails, the job fails — fix the profile ' +
      'below, then build again.',
    build: { status: 'idle' },
    files: {
      'packages.x86_64': PACKAGES,
      'pacman.conf': PACMAN_CONF,
      'grub/grub.cfg': GRUB_CFG,
      'airootfs/etc/pacman.conf': RUNTIME_PACMAN_CONF,
      'airootfs/etc/systemd/system/pacman-init.service': PACMAN_INIT_SERVICE,
      'airootfs/etc/systemd/system/etc-pacman.d-gnupg.mount': GNUPG_MOUNT,
    },
  },

  tasks: [
    task({
      id: 'image-boots-to-a-login-prompt',
      prompt:
        'The image has to reach a login prompt. Read the boot test in the ' +
        'log and fix whatever stops it.',
      check: (state) => {
        if (!state.sim.state.iso) {
          return no('No build has run yet. Press the build button below.');
        }
        if (!isoBooted(state.sim)) {
          return no(
            'The image did not reach a login prompt. The serial console says ' +
            'the initramfs could not mount the ISO root filesystem, which ' +
            'means the initramfs has no way to find the medium. ' +
            '`packages.x86_64` is missing mkinitcpio-archiso — the package ' +
            'that teaches the initramfs how to find and mount the ISO\'s ' +
            'root filesystem. Without it, archiso cannot produce a bootable ' +
            'image at all. Add it, and rebuild.'
          );
        }
        return ok('');
      },
      hint:
        'The boot test is at the bottom of the log. The last lines of the ' +
        'serial console are the ones worth reading.',
      hint2:
        'Compare your package list with the one in the previous lab: four ' +
        'packages are not optional, and one of them is missing.',
      why:
        'Booting exercises the whole chain at once: the kernel, the ' +
        'initramfs, the archiso hook that finds the medium, the bootloader ' +
        'that starts them, and the root filesystem underneath. A failure ' +
        'anywhere in that chain shows up here, and nowhere earlier — the ' +
        'build only writes files, it never runs them.',
    }),

    task({
      id: 'boot-menu-names-the-flavour',
      prompt:
        'The boot menu has to introduce your flavour, not the default.',
      check: (state) => {
        const iso = state.sim.state.iso;
        if (!iso) {
          return no('No build has run yet, so there is no boot menu to look at.');
        }
        const title = iso.bootMenu || '';
        if (!/vesper/i.test(title)) {
          return no(
            `The boot menu still says “${title}”. The title is the text ` +
            'inside the `menuentry` line in `grub/grub.cfg` — the menu ' +
            'people see when the machine starts. It is also what makes the ' +
            'image recognisably yours the moment it is plugged in.'
          );
        }
        return ok('');
      },
      hint:
        'The menu entry is in grub/grub.cfg, not in profiledef.sh.',
      hint2:
        'Look for the line that starts with `menuentry`.',
      why:
        'The boot menu is the first thing anybody sees. It is also where ' +
        'the image announces which install directory it is going to boot, ' +
        'so a menu that says one thing and boots another is a real bug, ' +
        'not just untidiness.',
    }),

    task({
      id: 'image-carries-the-package',
      prompt:
        'The image has to carry the package you put in the list: nano.',
      check: (state) => {
        const iso = state.sim.state.iso;
        if (!iso) {
          return no('No build has run yet, so there is nothing inside the image.');
        }
        const packages = iso.packages || [];
        if (!packages.includes('nano')) {
          return no(
            'nano is not inside the image. The packages in the image are ' +
            'exactly the packages in `packages.x86_64` — mkarchiso does ' +
            'not add anything of its own. Check that the package is in the ' +
            'list, and that the list has been committed: the pipeline ' +
            'builds a commit.'
          );
        }
        return ok('');
      },
      hint:
        'The package list is read one name per line.',
      hint2:
        'A line that starts with `#` is a comment, not a package.',
      why:
        'This is the check that the build read *your* list and not a copy ' +
        'of somebody else\'s. It is also the check that tells you the ' +
        'pipeline built the commit you think it built.',
    }),

    task({
      id: 'image-uses-your-mirror',
      prompt:
        'The image has to fetch packages from the mirror you chose, not ' +
        'from the machine that built it.',
      check: (state) => {
        const iso = state.sim.state.iso;
        if (!iso) {
          return no('No build has run yet, so there is no image to look inside.');
        }
        const expected = iso.expectedMirror;
        if (!expected) {
          return no(
            'The profile\'s build-time pacman.conf does not name a mirror ' +
            'any more, so there is nothing to compare the image against. ' +
            'Put the servers back in `profile/pacman.conf`.'
          );
        }
        if (iso.runtimeMirror !== expected) {
          return no(
            'The image is using “' + iso.runtimeMirror + '” instead of ' +
            '“' + expected + '”, the mirror your profile chose. ' +
            '`mkarchiso` builds with `pacstrap -c`, and pacstrap copies the ' +
            '*build machine\'s* mirrorlist over the image\'s own once the ' +
            'package transaction is done. An image that only has ' +
            '`Include = /etc/pacman.d/mirrorlist` is using the builder\'s ' +
            'mirrors. Write your mirrors into `airootfs/etc/pacman.conf` ' +
            'instead, as `Server =` lines.'
          );
        }
        return ok('');
      },
      hint:
        'There are two pacman configurations. The one in the profile is for ' +
        'the build. The one in the image is in the airootfs overlay.',
      hint2:
        '`profile/airootfs/etc/pacman.conf` — give it the same `Server =` ' +
        'lines the build-time configuration has.',
      why:
        'An image that silently borrows the builder\'s mirrors will keep ' +
        'working right up until the builder changes, or until somebody else ' +
        'builds it. Writing the servers into the overlay makes the image ' +
        'self-contained: it carries its own idea of where packages come ' +
        'from, and that idea is yours.',
    }),

    task({
      id: 'image-has-a-working-keyring',
      prompt:
        'The image has to be able to install packages at runtime. That ' +
        'needs a working pacman keyring.',
      check: (state) => {
        const iso = state.sim.state.iso;
        if (!iso) {
          return no('No build has run yet, so there is no image to look inside.');
        }
        if (!iso.keyring) {
          return no(
            'The image has no working pacman keyring, and nothing in the ' +
            'boot log will ever tell you so. `pacman-init.service` declares ' +
            '`Requires=etc-pacman.d-gnupg.mount` — the unit that mounts a ' +
            'tmpfs over `/etc/pacman.d/gnupg` so the trusted keys live in ' +
            'memory instead of on a read-only medium. The mount unit in ' +
            'your profile has no `[Mount]` section, so there is no mount: ' +
            'systemd treats the service\'s requirement as failed and drops ' +
            'the service *without a word*. The image boots fine, and then ' +
            'cannot install a single package. Finish the unit: it mounts a ' +
            'tmpfs over `/etc/pacman.d/gnupg`.'
          );
        }
        return ok('');
      },
      hint:
        'Two units. One runs `pacman-key --init` and `pacman-key ' +
        '--populate`. The other gives them somewhere to work.',
      hint2:
        'The missing one is a `.mount` unit: it mounts a tmpfs over ' +
        '/etc/pacman.d/gnupg.',
      why:
        'This is the failure that costs people an afternoon. The image ' +
        'builds, it boots, it looks perfect, and the first `pacman -S` ' +
        'inside it fails. The service is dropped because its requirement ' +
        'is missing, and systemd drops it silently. The keyring is only ' +
        'ever created at boot, by the two commands in that service, and ' +
        'they only run if the mount is there. The boot test checks for the ' +
        'mount in the console log precisely because nothing else will.',
    }),

    task({
      id: 'fix-the-test-and-rebuild',
      prompt:
        'Fix everything the report found, then rebuild until the job is ' +
        'green.',
      check: (state) => {
        const build = state.build || {};
        if (!build.status || build.status === 'idle') {
          return no('No build has run yet. Press the build button below.');
        }
        if (build.status !== 'done') {
          return no(
            'The last build\'s test still failed. Read the "image checks" ' +
            'section of the log: it says which finding is still open. Fix ' +
            'that in your profile, then build again.'
          );
        }
        return ok('');
      },
      hint:
        'The report at the bottom of the log lists every finding, one per ' +
        'line.',
      hint2:
        'Fix them all, then build again. The job only goes green when ' +
        'every check passes.',
      why:
        'A test you read once and ignore is worth nothing. The point of ' +
        'this lab is the loop: build, read the report, fix what it found, ' +
        'build again. That loop is how you find the problems that do not ' +
        'announce themselves — like a keyring that was never created.',
    }),
  ],

  start: ({ sim, runner }) => {
    currentSim = sim;
    attachBuildAgain(runner);
    attachProfileEditor(runner, PROFILE_FILES);
  },

  onBuild(ctx) {
    buildAndReport(ctx, currentSim);
  },

  /**
   * The state a learner who did this properly ends up in.
   *
   * The profile is fixed first — the missing initramfs hook, the boot menu,
   * the image's own mirrors, and the keyring mount — and then the image is
   * built from it, because the checks read the facts about the built image
   * and not the profile.
   *
   * The build is the same build the runner drives: the same function, with
   * the same simulator.
   */
  solution: (s) => {
    const files = {
      'packages.x86_64': PACKAGES,
      'pacman.conf': PACMAN_CONF,
      'grub/grub.cfg': GRUB_CFG,
      'airootfs/etc/pacman.conf': RUNTIME_PACMAN_CONF,
      'airootfs/etc/systemd/system/pacman-init.service': PACMAN_INIT_SERVICE,
      'airootfs/etc/systemd/system/etc-pacman.d-gnupg.mount': GNUPG_MOUNT,
    };

    // The profile, with the four things the test found, fixed.
    files['packages.x86_64'] = PACKAGES.replace(
      'mkinitcpio\n',
      'mkinitcpio\nmkinitcpio-archiso\n'
    );
    files['grub/grub.cfg'] = GRUB_CFG.replace(
      'menuentry "Arch Linux (%ARCH%, ${archiso_platform})"',
      'menuentry "Vesper Linux (%ARCH%, ${archiso_platform})"'
    );
    files['airootfs/etc/pacman.conf'] = RUNTIME_PACMAN_CONF.replace(
      'Include = /etc/pacman.d/mirrorlist',
      'Server = https://geo.mirror.pkgbuild.com/$repo/os/$arch'
    );
    files['airootfs/etc/systemd/system/etc-pacman.d-gnupg.mount'] =
      GNUPG_MOUNT.replace(
        '[Unit]\nDescription=Temporary /etc/pacman.d/gnupg directory\n',
        '[Unit]\nDescription=Temporary /etc/pacman.d/gnupg directory\n\n' +
        '[Mount]\nWhat=tmpfs\nWhere=/etc/pacman.d/gnupg\nType=tmpfs\n' +
        'Options=mode=0755,noswap\n'
      );

    for (const [path, content] of Object.entries(files)) {
      if (s.sim) s.sim.writeFile(path, content);
      if (s.editor) s.editor[path] = content;
    }

    // Now build the fixed profile, so the facts about the image are the
    // facts a correct build produces.
    const ctx = {
      state: s.build,
      update: (patch) => { s.build = { ...(s.build || {}), ...patch }; },
      finish: (result) => {
        s.sim.state.iso = result.iso || null;
        s.build = { ...(s.build || {}), status: 'done', log: result.log || '' };
      },
    };
    buildAndReport(ctx, s.sim);

    return files;
  },

  report: {
    lede:
      'You built an image, booted it, read what the test said, and fixed ' +
      'four things the test found — one of them the kind that never makes ' +
      'any noise. A build that succeeds is only the beginning; the image ' +
      'has to boot, carry what you meant, and be able to install things ' +
      'when somebody sits down in front of it.',
    next:
      'Last lab: make it yours. The name, the description, the packages, ' +
      'the menu, the banner — and then commit it, because the pipeline ' +
      'builds a commit and an unbuilt flavour is only a folder.',
  },
};
