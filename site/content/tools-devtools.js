/**
 * Track: tools — the devtools toolkit and pkgctl.
 *
 * The lesson: a package recipe is a shell script; a build that happens in a
 * clean chroot is the only build worth shipping; pkgctl is the modern front
 * door to devtools.
 */

import {
  task,
  ok,
  no,
  packageInstalled,
  pkgbuildAssignments,
  pkgbuildArray,
} from '../assets/checks.js';

const HELLO_DIR = '/home/learner/hello';
const HELLO_PKG = HELLO_DIR + '/PKGBUILD';
const GREETER_PKG = '/home/learner/greeter/PKGBUILD';

const GREETER_RECIPE = `# A second recipe, left here for you to build with pkgctl.
pkgname=greeter
pkgver=0.2.0
pkgrel=1
pkgdesc="Prints a short greeting to the terminal"
arch=('any')
url="https://example.org/greeter"
license=('MIT')
depends=()
source=("https://example.org/greeter/greeter-0.2.0.tar.gz")
sha256sums=('SKIP')

build() {
  cd "$pkgname-$pkgver"
  make
}

package() {
  install -Dm755 greeter "$pkgdir/usr/bin/greeter"
}
`;

/** The built package with this name, if there is one. */
function builtPackage(sim, name) {
  const wanted = String(name).trim().split(/\s/)[0];
  return (
    Object.values(sim.state.built || {}).find(
      (pkg) => String(pkg.name || '').trim().split(/\s/)[0] === wanted
    ) || null
  );
}

/** True if a package with this name was built. */
function built(sim, name) {
  return Boolean(builtPackage(sim, name));
}

export const toolsDevtools = {
  id: 'tools-devtools',
  track: 'tools',
  title: 'Building a package the proper way',
  subtitle: 'makepkg, the clean chroot, and the pkgctl front door.',

  scenario:
    'You want to hand someone a package: a built, installable file for a tiny ' +
    'program called hello, so they can put it on their machine with one command. ' +
    'A package is not a folder of scripts somebody has to run by hand. To make ' +
    'one you need two things — a recipe that says what the program is and how to ' +
    'build it, and a build that produces the same result on your machine and on ' +
    'theirs. This lab is those two things.',

  teaches:
    'A package recipe is a shell script called PKGBUILD. It is the same format ' +
    'everywhere: in the official repositories, in the AUR, and in whatever you ' +
    'write yourself. It says what the package is called, which version it is, ' +
    'where the source comes from, and what goes inside the finished package. ' +
    'Nothing about it is magic — pacman, makepkg and the AUR all read the same ' +
    'plain text.',

  readFirst: [
    {
      title: 'What a PKGBUILD is',
      body: [
        'A PKGBUILD is a shell script. Not a configuration format, not a special ' +
          'kind of file — a script. makepkg sources it, so every line in it is ' +
          'run by the shell, and the variables it sets are the recipe: pkgname, ' +
          'pkgver, pkgdesc, arch, depends, and so on.',
        'At the bottom there are usually four functions. prepare() unpacks and ' +
          'patches the source, build() compiles it, check() runs its tests, and ' +
          'package() lays the finished files into the package. That last one is ' +
          'the important one: package() puts files under $pkgdir, and $pkgdir is ' +
          'the directory that becomes / when the package is installed. A recipe ' +
          'never writes to your live system. Ever.',
      ],
    },
    {
      title: 'Why a clean chroot',
      body: [
        'A clean chroot build is a build that happens inside an empty container ' +
          'holding nothing but the build dependencies. That container is a ' +
          'chroot, and the point of it is that nothing of yours leaks in.',
        'If you build on your own machine, the build inherits every library, ' +
          'header, compiler flag and stray patch you happen to have installed. ' +
          'The result is not a package. It is a snapshot of your desk: it works ' +
          'on a machine shaped like yours, and it breaks on anyone else’s. That ' +
          'is why Arch builds everything in a clean chroot, and why the built ' +
          'file contains only what package() put into $pkgdir.',
      ],
    },
    {
      title: 'makepkg and pkgctl',
      body: [
        'devtools is the toolkit that does this properly. makepkg reads the ' +
          'PKGBUILD in the directory you are standing in, checks that every ' +
          'dependency in depends is installed, fetches and verifies the sources, ' +
          'runs the four functions, and collects the result into a file named ' +
          'name-version-arch.pkg.tar.zst.',
        'pkgctl is the current front door to devtools. `pkgctl build` is the ' +
          'one-command version of the clean chroot build — the same work, with ' +
          'the modern door in front of it. It is how Arch packaging is actually ' +
          'driven now, and it is the command you should reach for.',
      ],
    },
  ],

  env: {
    type: 'terminal',
    prompt:
      'A build machine with devtools installed. makepkg and pkgctl build the ' +
      'PKGBUILD in the directory you are standing in.',
    packages: ['base', 'pacman', 'bash', 'git', 'devtools', 'pkgconf'],
    files: { [GREETER_PKG]: GREETER_RECIPE },
    cwd: '/home/learner',
  },

  tasks: [
    task({
      id: 'make-a-workspace',
      prompt:
        'Give this package a directory of its own. Make a directory called hello ' +
        'in your home and step into it — makepkg only ever reads the PKGBUILD in ' +
        'the directory you are standing in.',
      check: (s) => {
        const entry = s.sim.fs.get(HELLO_DIR);
        return entry && entry.dir
          ? ok('')
          : no(
              'There is no ~/hello directory yet. makepkg builds the PKGBUILD in ' +
                'the directory you are standing in, so the recipe needs its own ' +
                'home: `mkdir hello`, then `cd hello`.'
            );
      },
      hint:
        'Check where you are with `pwd`. The build happens wherever the recipe ' +
        'is, so the recipe needs a directory of its own.',
      hint2: 'Two commands: `mkdir hello`, then `cd hello`.',
      why:
        'makepkg builds whatever PKGBUILD sits in the current directory and ' +
        'nowhere else. One package per directory keeps builds from stepping on ' +
        'each other, and it is the same habit that makes a clean chroot build ' +
        'reproducible.',
    }),

    task({
      id: 'write-the-recipe',
      prompt:
        'Write a PKGBUILD for a tiny program called hello. It prints a greeting ' +
        'it fetches over the network, so it needs curl at run time. The recipe ' +
        'needs at least five things: pkgname (hello), pkgver, pkgdesc (one short ' +
        'line saying what it is), arch (any — it runs anywhere), and depends ' +
        '(curl).',
      check: (s) => {
        const values = pkgbuildAssignments(s.sim, HELLO_PKG);
        if (s.sim.readFile(HELLO_PKG) === null) {
          const elsewhere = s.sim
            .allFiles()
            .find((p) => p.endsWith('/PKGBUILD') && p !== GREETER_PKG);
          return no(
            elsewhere
              ? `There is a PKGBUILD at ${elsewhere}, but not in the hello ` +
                'directory. makepkg builds the recipe in the directory you are ' +
                'standing in — move the file into ~/hello and build it there.'
              : 'There is no PKGBUILD in ~/hello yet. That is the recipe file ' +
                'makepkg reads — write it in that directory.'
          );
        }
        const name = values.pkgname || '';
        if (!name) {
          return no(
            'The recipe has no pkgname yet. pkgname is the name of the package ' +
              'itself — the thing pacman will call it, and the first half of the ' +
              'file that comes out: hello-1.0.0-any.pkg.tar.zst.'
          );
        }
        if (name !== 'hello') {
          return no(
            `pkgname says "${name}", but this recipe is for a program called ` +
              'hello. The name has to be the package name, in lower case and with ' +
              'no spaces.'
          );
        }
        if (!values.pkgver) {
          return no(
            'pkgver is still empty. It is the upstream version — the version the ' +
              'program’s own authors number it, like 1.0.0.'
          );
        }
        if (!values.pkgdesc) {
          return no(
            'pkgdesc is still empty. It is one short line saying what the ' +
              'package is. This is the line pacman -Ss shows the world.'
          );
        }
        const arch = pkgbuildArray(s.sim, 'arch', HELLO_PKG);
        if (!arch.length) {
          return no(
            'arch is still empty. Say which machines this builds for: x86_64, ' +
              'aarch64, or any for things that do not care — scripts, fonts, ' +
              'wallpapers.'
          );
        }
        const bad = arch.filter((a) => !['any', 'x86_64', 'aarch64'].includes(a));
        if (bad.length) {
          return no(
            `arch says "${bad[0]}", and that is not a machine anybody builds for. ` +
              'The three real answers are x86_64, aarch64 and any.'
          );
        }
        const depends = pkgbuildArray(s.sim, 'depends', HELLO_PKG);
        if (!depends.includes('curl')) {
          return no(
            'The depends list does not mention curl. hello fetches its greeting ' +
              'over the network, so curl has to be in depends — that is the list ' +
              'pacman enforces so the package cannot install broken.'
          );
        }
        return ok('');
      },
      hint:
        'A PKGBUILD is a shell script of key=value lines. The tidiest way to ' +
        'write one in a single command is printf with a redirect: ' +
        '`printf \'pkgname=hello\\npkgver=1.0.0\\n\' > PKGBUILD`.',
      hint2:
        'Something close to this: pkgname=hello, pkgver=1.0.0, ' +
        'pkgdesc="Fetches and prints a greeting", arch=(any), depends=(curl).',
      why:
        'These five lines are the whole contract between you and pacman. The ' +
        'name and version become the file name. The description is what people ' +
        'read when they search. The architecture says who can install it. And ' +
        'depends is the promise that the package will actually run once it is on ' +
        'a machine.',
    }),

    task({
      id: 'install-the-dependency',
      prompt:
        'Now run makepkg and read what it says. It will refuse to build and name ' +
        'a dependency you do not have. Install that dependency with pacman, and ' +
        'then run makepkg again.',
      check: (s) =>
        packageInstalled(s.sim, 'curl')
          ? ok('')
          : no(
              'curl is not installed yet, so makepkg will keep refusing to ' +
                'build this recipe. The error line names the dependency it is ' +
                'missing. Install it with `pacman -S curl`.'
            ),
      hint:
        'The error says "Missing dependency ...". That name is the package you ' +
        'need.',
      hint2: '`pacman -S curl` installs it.',
      why:
        'makepkg checks every name in depends before it starts anything. That ' +
        'check is the whole point of depends: pacman refuses to hand out a ' +
        'package whose requirements are not met, so nobody ends up with a ' +
        'broken install.',
    }),

    task({
      id: 'build-it',
      prompt:
        'Build the package. Run makepkg in the directory that holds the PKGBUILD ' +
        'and watch it finish.',
      check: (s) => {
        const depends = pkgbuildArray(s.sim, 'depends', HELLO_PKG);
        const missing = depends.filter((d) => !s.sim.state.packages.has(d));
        if (missing.length) {
          return no(
            `makepkg stops before it starts: "${missing[0]}" is in depends but is ` +
              'not installed here. Install it with `pacman -S ' + missing[0] +
              '`, or take it out of depends if hello does not really need it.'
          );
        }
        if (!built(s.sim, 'hello')) {
          return no(
            'There is no hello package yet. Run makepkg in the directory that ' +
              'holds the PKGBUILD — the one you made — and read the output as it ' +
              'goes.'
          );
        }
        return ok('');
      },
      hint:
        'makepkg reads the PKGBUILD in the directory you are standing in. If it ' +
        'says "PKGBUILD does not exist", you are in the wrong place.',
      hint2: '`cd ~/hello` first, then `makepkg`.',
      why:
        'A built package is a single file — hello-1.0.0-any.pkg.tar.zst — that ' +
        'anyone can install with pacman -U, and that contains only what ' +
        'package() put into $pkgdir. That is the difference between a package ' +
        'and a folder of scripts.',
    }),

    task({
      id: 'the-modern-front-door',
      prompt:
        'pkgctl is the current front door to devtools: `pkgctl build` is the ' +
        'one-command version of the clean chroot build — the same work makepkg ' +
        'does, through the modern door. There is a second recipe waiting at ' +
        '~/greeter. Step into it and build it with pkgctl build.',
      check: (s) => {
        const pkg = builtPackage(s.sim, 'greeter');
        if (pkg && pkg.tool === 'pkgctl') return ok('');
        if (pkg) {
          return no(
            'The greeter package was built, but by makepkg. This task is about ' +
              'the modern front door: `pkgctl build` is the one-command version ' +
              'of the clean chroot build. Run `pkgctl build` in ~/greeter and ' +
              'it is built the same way, through the door that is supported now.'
          );
        }
        return no(
          'No greeter package yet. pkgctl build reads the PKGBUILD in the ' +
            'directory you are standing in, exactly like makepkg — so step ' +
            'into ~/greeter first, then run `pkgctl build` there.'
        );
      },
      hint:
        'Same rule as makepkg: the recipe has to be in the directory you are ' +
        'standing in.',
      hint2: '`cd ~/greeter`, then `pkgctl build`.',
      why:
        'pkgctl is the supported way in to devtools now. It wraps the same clean ' +
        'chroot build makepkg does and adds the repository, checkout and signing ' +
        'workflow around it. Learn the front door and the rest of devtools is ' +
        'one flag away.',
    }),
  ],

  /**
   * The state a learner who did this properly ends up in.
   *
   * The verifier applies this and asserts that every task then passes, and
   * that no task was already satisfied before the learner started.
   */
  solution: (s) => {
    // The commands a learner would type, in order: make a directory for the
    // package, write the recipe in it, install the dependency makepkg is
    // missing, build, then do the same thing through pkgctl.
    s.sim.run('mkdir hello');
    s.sim.run('cd hello');
    s.sim.run(
      'printf \'pkgname=hello\\npkgver=1.0.0\\n' +
        'pkgdesc="Fetches and prints a greeting"\\n' +
        'arch=(any)\\ndepends=(curl)\\n\' > PKGBUILD'
    );
    s.sim.run('pacman -S curl');
    s.sim.run('makepkg');
    s.sim.run('cd ../greeter');
    s.sim.run('pkgctl build');
  },

  report: {
    lede:
      'You wrote a recipe, watched makepkg refuse it for a missing dependency, ' +
      'installed what it needed, and built the package. Then you built a second ' +
      'one through pkgctl, the modern front door to the same toolkit. What you ' +
      'now know is the shape of every Arch package: a shell script that says ' +
      'what the software is, and a build that does not depend on what happens ' +
      'to be installed on your machine.',
    next:
      'Next, the AUR: user-submitted recipes, and the helpers that build them for ' +
      'you. And the question that matters for this course: what actually ends up ' +
      'on an ISO.',
  },
};

export default toolsDevtools;
