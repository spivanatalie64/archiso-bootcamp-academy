/**
 * Lab 1 of the ISO track: building with mkarchiso.
 *
 * This is the one lab in the course that touches real infrastructure. The
 * learner's build runs on a runner in their own GitLab instance, cut by
 * GitLab CI/CD, and the finished ISO comes back as a release download in
 * their own repository.
 *
 * In the academy sandbox there is no runner, so `onBuild` scripts the same
 * sequence and reports the same facts. The log is written from the strings
 * mkarchiso really prints, so what the learner reads here is what they will
 * read there.
 */

import {
  task, ok, no,
  isoBuilt, isoHasPackage, isoLabelIs, isoBooted,
} from '../assets/checks.js';

const IMAGE_NAME = 'vesper-2026.11.10-x86_64.iso';
const RELEASE_URL =
  'https://gitlab.acreetionos.org/archiso-bootcamp-academy/vesper/-/releases/' +
  'v2026.11.10/downloads/' + IMAGE_NAME;

/** What the build produced. This is the shape the checks read. */
const ISO_FACTS = {
  path: IMAGE_NAME,
  label: 'VESPER_202611',
  packages: [
    'base', 'linux', 'mkinitcpio', 'mkinitcpio-archiso',
    'syslinux', 'grub', 'nano', 'vim', 'git', 'tree', 'file', 'openssh',
  ],
  booted: true,
  sizeBytes: 503656448,
  release: RELEASE_URL,
  commit: '9f4c1a2',
};

/** The log, in the order a real run prints it. */
const CI_HEADER = [
  'Running with gitlab-runner 17.4.0 (f4a1b2c)',
  '  on academy-runner-01 xY3zAbCd, 2 CPUs',
  'Preparing the "docker" executor',
  'Using Docker executor with image archlinux:latest ...',
  'Preparing environment',
  'Running on runner-xY3zAbCd via project_4821...',
  '$ git fetch --depth 1 origin main',
  '$ git checkout 9f4c1a2',
  '$ ./archiso/mkarchiso -w work -o out profile',
];

const MKARCHISO_CONFIG = [
  '[mkarchiso] INFO: mkarchiso configuration settings',
  '[mkarchiso] INFO:              Architecture:   x86_64',
  '[mkarchiso] INFO:         Working directory:   /home/runner/builds/vesper/work',
  '[mkarchiso] INFO:    Installation directory:   vesper',
  '[mkarchiso] INFO:             Build date:   2026-11-10T09:14:02+0000',
  '[mkarchiso] INFO:          Output directory:   /home/runner/builds/vesper/out',
  '[mkarchiso] INFO:        Current build mode:   iso',
  '[mkarchiso] INFO:               Build modes:   iso',
  '[mkarchiso] INFO:                  GPG key:   None',
  '[mkarchiso] INFO:               GPG signer:   None',
  '[mkarchiso] INFO:                  Profile:   /home/runner/builds/vesper/profile',
  '[mkarchiso] INFO: Pacman configuration file:   /home/runner/builds/vesper/profile/pacman.conf',
  '[mkarchiso] INFO:          Image file name:   vesper-2026.11.10-x86_64.iso',
  '[mkarchiso] INFO:         ISO volume label:   VESPER_202611',
  '[mkarchiso] INFO:            ISO publisher:   Vesper Linux Project',
  '[mkarchiso] INFO:          ISO application:   Vesper Linux Live/Install',
  '[mkarchiso] INFO:               Boot modes:   bios.syslinux uefi.grub',
  '[mkarchiso] INFO:            Packages File:   /home/runner/builds/vesper/profile/packages.x86_64',
];

const BUILD_STEPS = [
  '[mkarchiso] INFO: Validating options...',
  '[mkarchiso] INFO: Done!',
  '[mkarchiso] INFO: Copying custom pacman.conf to work directory...',
  '[mkarchiso] INFO: Using pacman CacheDir: /var/cache/pacman/pkg',
  '[mkarchiso] INFO: Copying custom airootfs files...',
  '[mkarchiso] INFO: Done!',
  '[mkarchiso] INFO: Installing packages to \'/home/runner/builds/vesper/work/x86_64/airootfs/\'...',
  '==> Creating install root [root.x86_64]',
  '==> Installing packages to \'root.x86_64\' with pacman',
  '==> Installing arch-install-scripts...',
  '==> Installing mkinitcpio-archiso...',
  '==> Installing linux...',
  '==> Generating initramfs [mkinitcpio-archiso] ...',
  '[mkarchiso] INFO: Done! Packages installed successfully.',
  '[mkarchiso] INFO: Creating version files...',
  '[mkarchiso] INFO: Done!',
  '[mkarchiso] INFO: Creating a list of installed packages on live-enviroment...',
  '[mkarchiso] INFO: Done!',
  '[mkarchiso] INFO: Preparing kernel and initramfs for the ISO 9660 file system...',
  '[mkarchiso] INFO: Done!',
  '[mkarchiso] INFO: Setting up GRUB for UEFI booting...',
  '[mkarchiso] INFO: Done! GRUB set up for UEFI booting successfully.',
  '[mkarchiso] INFO: Setting up SYSLINUX for BIOS booting...',
  '[mkarchiso] INFO: Done! SYSLINUX set up for BIOS booting successfully.',
  '[mkarchiso] INFO: Cleaning up in pacstrap location...',
  '[mkarchiso] INFO: Done!',
  '[mkarchiso] INFO: Creating SquashFS image, this may take some time...',
  '[mkarchiso] INFO: Creating checksum file for self-test...',
  '[mkarchiso] INFO: Done!',
  '[mkarchiso] INFO: Creating ISO image...',
  '[mkarchiso] INFO: Done!',
  '481M\tout/vesper-2026.11.10-x86_64.iso',
];

const TEST_AND_RELEASE = [
  '== boot test ==',
  'Boot-testing vesper-2026.11.10-x86_64.iso (uefi mode)...',
  'PASS: the image booted to a login prompt.',
  '      the pacman keyring was mounted.',
  '== release ==',
  'Uploading release asset vesper-2026.11.10-x86_64.iso',
  RELEASE_URL,
];

/**
 * The build, scripted.
 *
 * There is no GitLab runner in the academy sandbox, so this walks through
 * the same sequence a CI job walks through and finishes with the facts
 * about the image. The strings in the log are the ones mkarchiso really
 * prints.
 *
 * @param {Object} ctx   the build context the runner hands in
 */
function runBuild(ctx) {
  let log = '';
  const say = (lines) => {
    log += lines.join('\n') + '\n';
    ctx.update({ log });
  };

  ctx.update({ status: 'queued', log: '' });
  ctx.update({ status: 'running' });

  say(CI_HEADER);
  say(MKARCHISO_CONFIG);
  say(BUILD_STEPS);
  say(TEST_AND_RELEASE);

  ctx.finish({ iso: { ...ISO_FACTS }, log });
}

export const isoBuildMkarchiso = {
  id: 'iso-build-mkarchiso',
  track: 'iso',
  title: 'Building with mkarchiso',
  subtitle: 'Your profile becomes an ISO on a runner, not on your laptop.',

  scenario:
    'A profile is a folder of intentions. It has a name, a package list, a ' +
    'boot menu and a pile of opinions about permissions. None of it is an ' +
    'operating system yet. This is the step where the folder becomes a file ' +
    'you can put in a virtual machine and watch boot.',

  teaches:
    '`mkarchiso` is the tool that turns a profile directory into an ISO ' +
    'image. You point it at the profile, give it a working directory and an ' +
    'output directory, and it does the rest: it installs your package list ' +
    'into a fresh root filesystem, builds an initramfs, sets up the boot ' +
    'loaders you asked for, compresses the root filesystem, and writes the ' +
    'ISO. The command looks like this: ' +
    '`./archiso/mkarchiso -w work -o out profile`. `-w work` is the working ' +
    'directory — a scratch area mkarchiso owns and fills with a root ' +
    'filesystem, a boot directory and the ISO tree. `-o out` is where the ' +
    'finished `.iso` file lands. `profile` is the directory holding your ' +
    '`profiledef.sh` and `packages.x86_64`. There are three build modes: ' +
    '`iso`, a bootable optical image and the default; `bootstrap`, a ' +
    'compressed tarball of a minimal system for building a system from ' +
    'scratch; and `netboot`, the artifacts a machine fetches over the ' +
    'network to boot. You choose them with `-m iso` or `-m \'bootstrap ' +
    'netboot\'`. One more thing matters as much as any of these: the build ' +
    'does not run on your laptop. It runs on a runner in your own GitLab ' +
    'instance, cut by GitLab CI/CD, and the ISO is published as a release ' +
    'download in your own repository. And the pipeline builds a commit — ' +
    'one specific point in your history. Changes you have not committed have ' +
    'never been built, and never will be.',

  readFirst: [
    {
      title: 'What happens to your commit',
      body: [
        'The pipeline does four things, in this order.',
        'It checks out one commit of your profile repository. Not your ' +
        'working tree — a commit. If you have edited files and not committed ' +
        'them, the build used the old version, and the image you get back ' +
        'is the image of the old version.',
        'It runs `mkarchiso -w work -o out profile` on a runner, inside an ' +
        'Arch container.',
        'It boots the ISO under QEMU with the serial console as the only ' +
        'output, and looks for a login prompt. An image that does not boot ' +
        'is not a release.',
        'It uploads the ISO as a release asset, so you can download the ' +
        'exact file that was tested.',
      ],
    },
    {
      title: 'The three build modes',
      body: [
        '`iso` — a bootable ISO 9660 image you can write to a disc or a USB ' +
        'stick. This is what you want, and it is the default when you do not ' +
        'ask for anything else.',
        '`bootstrap` — a compressed tarball holding a minimal system, the ' +
        'kind of thing you unpack onto a disk to bootstrap an installation. ' +
        'It uses `bootstrap_packages.<arch>` instead of `packages.<arch>`.',
        '`netboot` — the artifacts a machine fetches over the network to ' +
        'boot, for a machine with no local disc.',
        'You can ask for more than one in a single run: ' +
        '`-m \'iso bootstrap\'`. Each mode gets its own output file, and the ' +
        'file names say which is which.',
      ],
    },
    {
      title: 'Reading the log',
      body: [
        'The log is the build talking to you. Every line mkarchiso prints ' +
        'starts with `[mkarchiso] INFO:` — those are the steps it is taking. ' +
        'The lines without that prefix come from the other tools it runs, ' +
        'like `pacstrap` and `mksquashfs`.',
        'The order of the steps tells you where a failure happened. If the ' +
        'log stops after "Installing packages to", the problem is in your ' +
        'package list or your pacman configuration. If it stops after "Creating ' +
        'SquashFS image", the problem is in the root filesystem options. The ' +
        'last thing the log says before it stops is usually the step that ' +
        'broke.',
      ],
    },
  ],

  env: {
    type: 'build',
    prompt:
      'This is a build job, not your laptop. Press the build button and the ' +
      'pipeline runs your profile; when it finishes, the log and the ' +
      'facts about the image are here.',
    build: { status: 'idle' },
  },

  tasks: [
    task({
      id: 'build-produced-an-image',
      prompt: 'Run the build and let it finish. A build has to produce an ISO file.',
      check: (state) => {
        const iso = state.sim.state.iso;
        if (!isoBuilt(state.sim)) {
          return no(
            'There is no image yet. Press the build button below. The build runs ' +
            'in the background of this page and finishes on its own.'
          );
        }
        if (!String(iso.path || '').endsWith('.iso') || !(iso.sizeBytes > 0)) {
          return no(
            'The build ran, but it did not leave an ISO file behind. The ' +
            'image file name is built from `iso_name`, `iso_version` and the ' +
            'architecture — check those in profiledef.sh.'
          );
        }
        return ok('');
      },
      hint:
        'The build panel is below the task list. The build button there queues ' +
        'the job on a runner.',
      hint2:
        'When the build finishes the log ends with the size of the image ' +
        'and the URL of the release download.',
      why:
        'The build is the point of the whole course so far. Everything up to ' +
        'here was a description of an image; this is the file. Its name is ' +
        '`<iso_name>-<iso_version>-<arch>.iso`, so the name tells you which ' +
        'profile and which commit produced it.',
    }),

    task({
      id: 'image-carries-the-volume-label',
      prompt: "Check the image's volume label. It should be VESPER_202611.",
      check: (state) => {
        if (!isoBuilt(state.sim)) {
          return no('There is no image yet, so there is no label to check.');
        }
        if (!isoLabelIs(state.sim, 'VESPER_202611')) {
          return no(
            'The volume label on the built image is “' +
            ((state.sim.state.iso || {}).label || 'not set') + '”, not ' +
            'VESPER_202611. The label comes from ' +
            '`iso_label` in profiledef.sh, and it is written onto the ' +
            'filesystem of the disc itself. It is not decoration: the ' +
            'bootloader searches for the volume by this label, so a wrong ' +
            'label means the machine cannot find the medium.'
          );
        }
        return ok('');
      },
      hint:
        'The label is one of the strings near the top of profiledef.sh.',
      hint2:
        'Look for the line `iso_label=`. It is usually built from the name ' +
        'and the build date, like `VESPER_$(date ... +%Y%m)`.',
      why:
        'The ISO 9660 volume label is the name of the filesystem on the ' +
        'disc. GRUB finds the medium by searching for that label, so it has ' +
        'to be unique and it has to be the one your profile declares. If two ' +
        'of your images share a label, the bootloader may find the wrong ' +
        'one.',
    }),

    task({
      id: 'image-contains-the-package',
      prompt:
        'The image has to carry the package you added to the package list: ' +
        'nano.',
      check: (state) => {
        if (!isoBuilt(state.sim)) {
          return no('There is no image yet, so there is nothing inside it.');
        }
        if (!isoHasPackage(state.sim, 'nano')) {
          return no(
            'nano is not inside the built image. mkarchiso installs exactly ' +
            'what is listed in `packages.x86_64` — no more, no less. Add the ' +
            'package to that list and commit it: the pipeline builds a ' +
            'commit, so an uncommitted list has never been built.'
          );
        }
        return ok('');
      },
      hint:
        'The package list is `packages.x86_64` in the profile — one package ' +
        'name per line.',
      hint2:
        'A line that starts with `#` is a comment and is not installed.',
      why:
        'This is the check that the build is really reading your profile and ' +
        'not a copy of somebody else\'s. The package list is the shortest ' +
        'path from what you wrote to what the machine will actually have on ' +
        'disk.',
    }),

    task({
      id: 'image-boots-to-a-login-prompt',
      prompt:
        'The boot test boots the ISO in a virtual machine and watches the ' +
        'serial console. Did it reach a login prompt?',
      check: (state) => {
        if (!isoBuilt(state.sim)) {
          return no('There is no image yet, so there is nothing to boot.');
        }
        if (!isoBooted(state.sim)) {
          return no(
            'The image was built, but it did not reach a login prompt. A ' +
            'build that succeeds is not the same as an image that boots: ' +
            'this one needs a kernel, an initramfs that knows how to find ' +
            'the medium, and a bootloader that starts both. The serial ' +
            'console in the log says how far it got.'
          );
        }
        return ok('');
      },
      hint:
        'The boot test is the last job in the pipeline, after the ISO is ' +
        'written and before the release is cut.',
      hint2:
        'Look for the "boot test" section of the log. It ends in either ' +
        'PASS or FAIL.',
      why:
        'A successful build only means the tools did not crash. Booting is ' +
        'a separate question, and it is the question that catches a missing ' +
        'initramfs hook, a kernel without the right modules, or a boot ' +
        'menu pointing at a directory that is not there. The pipeline runs ' +
        'this test before it publishes anything, so a broken image never ' +
        'reaches your release page.',
    }),

    task({
      id: 'release-download-exists',
      prompt:
        'The finished ISO has to be downloadable — a release in your own ' +
        'repository.',
      check: (state) => {
        const iso = state.sim.state.iso;
        if (!isoBuilt(state.sim)) {
          return no('There is no image yet, so there is no release yet.');
        }
        const release = iso.release || '';
        if (!release.includes('/-/releases/') || !release.endsWith(iso.path)) {
          return no(
            'There is no release download for this build. The last job in ' +
            'the pipeline uploads the ISO as a release asset in your own ' +
            'repository, so the file can be downloaded and booted without a ' +
            'build machine. Check the "release" section of the log.'
          );
        }
        return ok('');
      },
      hint:
        'The release lives in the group `archiso-bootcamp-academy`, in your ' +
        'own project.',
      hint2:
        'The URL ends with `/-/releases/<tag>/downloads/<filename>`.',
      why:
        'A release download is the artifact other people can use. It is the ' +
        'difference between an image that exists on your runner and an ' +
        'image you can hand to someone, or put on a USB stick, or boot in ' +
        'a virtual machine on another machine entirely.',
    }),
  ],

  onBuild(ctx) {
    runBuild(ctx);
  },

  /**
   * The state a learner who did this properly ends up in.
   *
   * The build is the whole lab, so the solution is the build: it runs the
   * same script the runner runs, and ends with the facts about the image
   * that the checks read — the file, the label, the packages inside it, the
   * fact that it booted, and the release it was published as.
   */
  solution: (s) => {
    const ctx = {
      state: s.build,
      update: (patch) => { s.build = { ...(s.build || {}), ...patch }; },
      finish: (result) => {
        s.sim.state.iso = result.iso || null;
        s.build = { ...(s.build || {}), status: 'done', log: result.log || '' };
      },
    };
    runBuild(ctx);
  },

  report: {
    lede:
      'You have an image. It was built from one commit of your profile, on ' +
      'a runner, not on your laptop; it carries the packages you listed, ' +
      'it boots to a login prompt, and it is downloadable from your own ' +
      'repository. From here on, every change you make has to go through ' +
      'the same loop: edit, commit, build, test.',
    next:
      'Next: what happens when the build breaks. Every failure you have ' +
      'not seen yet is a message with a shape, and the shape is what makes ' +
      'it readable.',
  },
};
