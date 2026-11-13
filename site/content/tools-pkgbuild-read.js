/**
 * Track: tools — the first half of the PKGBUILD course.
 *
 * The lesson: read one recipe, variable by variable, and act on what you read.
 */

import {
  task,
  ok,
  no,
  pkgbuildAssignments,
  pkgbuildArray,
  pkgbuildFunctions,
} from '../assets/checks.js';

const SHA256 =
  '9f2c1e7b4d8a6035c1e2f7a9d4b6c8e0f2a5b7d9c1e3f5a7b9d1c3e5f7a9b1d3';

const DESCRIPTION = 'A tiny command line tool that prints a friendly greeting';

/** The body of a shell function, by name. */
function functionBody(content, name) {
  const match = String(content || '').match(
    new RegExp(`(?:^|\\n)\\s*${name}\\s*\\(\\)\\s*\\{`)
  );
  if (!match) return null;
  const start = match.index + match[0].length;
  let depth = 1;
  let i = start;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth += 1;
    else if (content[i] === '}') depth -= 1;
    i += 1;
  }
  return content.slice(start, i - 1);
}

/**
 * True if the body installs something into the real filesystem root rather
 * than into $pkgdir.
 */
function touchesRealRoot(body) {
  const withoutPkgdir = body.replace(/\$\{pkgdir\}|\$pkgdir\b/g, 'PKGROOT');
  const match = withoutPkgdir.match(
    /(?:^|[\s"'=(])(\/(?:usr|etc|bin|sbin|lib|opt|var|boot)\/)/
  );
  return match ? match[1] : null;
}

export const toolsPkgbuildRead = {
  id: 'tools-pkgbuild-read',
  track: 'tools',
  title: 'Reading a PKGBUILD',
  subtitle: 'Every variable in a recipe, one at a time, on a real one.',

  scenario:
    'You are handed a PKGBUILD. Not a toy one — a real recipe, from a project ' +
    'that renamed itself and left a few old names behind. Before you can fix ' +
    'it, or judge it, or write your own, you have to be able to read it: what ' +
    'each variable means, and what a wrong value in it costs you. This is that ' +
    'skill, one variable at a time.',

  teaches:
    'A PKGBUILD is a shell script that describes a package: what it is, where ' +
    'it comes from, how it is built, and what goes into it. Every assignment ' +
    'in it is a variable with a job. The functions at the bottom are the ' +
    'steps, in order. Reading a recipe is mostly reading these two things, and ' +
    'this lab walks the whole set of them on one real file.',

  readFirst: [
    {
      title: 'pkgname, and pkgbase',
      body: [
        'pkgname is the package’s name — the thing pacman will call it, and the ' +
          'first part of the file that comes out. It is an array when one ' +
          'recipe builds several packages, a split package: a shared library ' +
          'and the tools that go with it, say. When that happens, pkgbase ' +
          'names the recipe itself, so the two can be told apart.',
      ],
    },
    {
      title: 'pkgver and pkgrel',
      body: [
        'pkgver is the upstream version, exactly as the software’s own authors ' +
          'number it: letters, numbers, dots. No hyphens — pacman compares ' +
          'this string to decide what is newer, and the hyphen is its own ' +
          'separator.',
        'pkgrel is the packaging release: 1, 2, 3. It resets to 1 whenever ' +
          'pkgver changes, and climbs when only the recipe changed. Version is ' +
          'the software; release is the packaging of it.',
      ],
    },
    {
      title: 'pkgdesc, arch, url, license',
      body: [
        'pkgdesc is one short line saying what the package is. It is what ' +
          'pacman -Ss shows the world, so it is read by people deciding whether ' +
          'to install something.',
        'arch says which architectures the package builds for: x86_64, aarch64, ' +
          'or any for the things that run anywhere — scripts, fonts, wallpapers.',
        'url is the software’s home on the web.',
        'license is its licence, from the standard set: GPL, MIT, Apache, and so ' +
          'on, or custom when nothing else fits. It is not decoration. Shipping ' +
          'a package under the wrong licence is a legal problem.',
      ],
    },
    {
      title: 'depends, makedepends, checkdepends, optdepends',
      body: [
        'depends is what must be installed for the package to RUN. Pacman ' +
          'enforces it: if the list is wrong, the package installs and then does ' +
          'not work.',
        'makedepends is what must be present to BUILD it, and is not needed to ' +
          'run it: compilers, headers, build tools. The difference between ' +
          'depends and makedepends is the difference between the kitchen and ' +
          'the table — the kitchen tools stay in the kitchen.',
        'checkdepends is what the test suite needs while check() runs.',
        'optdepends is optional extras, each with a few words on what it adds. ' +
          'Pacman suggests these; it never forces them.',
      ],
    },
    {
      title: 'provides, conflicts, replaces, backup',
      body: [
        'provides, conflicts and replaces are the package’s relationships with ' +
          'others: what it can stand in for, what it cannot live alongside, and ' +
          'what it supersedes.',
        'backup lists the files pacman will not silently overwrite when it ' +
          'upgrades something — usually configuration under /etc. It saves a ' +
          'copy with a .pacnew suffix and lets you merge it yourself.',
      ],
    },
    {
      title: 'options, install, source, sha256sums, validpgpkeys',
      body: [
        'options holds build switches, most of them negations: !strip, !docs, ' +
          '!emptydirs. You mostly meet them when something needs an exception.',
        'install names a scriptlet file with instructions pacman runs at ' +
          'install, upgrade and remove time.',
        'source says where everything comes from: tarball URLs, local files, or ' +
          'a git repository — with the branch or the commit pinned in the source ' +
          'string itself, so the build cannot drift.',
        'sha256sums (or b2sums) is one checksum per source, in the same order, ' +
          'proving the download is the file the recipe was written against. ' +
          'SKIP exists, mainly for git sources — and choosing it is a decision, ' +
          'not a shortcut.',
        'validpgpkeys lists the fingerprints allowed to sign the sources, for ' +
          'the projects whose tarballs are signed.',
      ],
    },
    {
      title: 'The four functions',
      body: [
        'prepare() unpacks the source and applies any patches. build() compiles ' +
          'it. check() runs the test suite. package() lays the finished files ' +
          'into the package root — $pkgdir, never the real filesystem.',
        'For a split package, there is one package() per pkgname, so each ' +
          'output gets its own set of files.',
      ],
    },
  ],

  env: {
    type: 'editor',
    prompt:
      'A real PKGBUILD, open in the editor. Some lines still refer to the old ' +
      'name. Read it, find each stale spot, and fix it — the checks look at ' +
      'what you write here, not at what you type anywhere else.',
    files: {
      PKGBUILD: `# Maintainer: You <you@example.com>
#
# This recipe used to build the package "hello". Upstream renamed the project
# to "greet" for 1.4.0 and several lines here were never updated.
#
# Notes left behind by the previous maintainer:
#
#   Upstream is MIT licensed.
#
#   The one-line description the repositories should show:
#     A tiny command line tool that prints a friendly greeting
#
#   sha256 of the upstream tarball:
#     9f2c1e7b4d8a6035c1e2f7a9d4b6c8e0f2a5b7d9c1e3f5a7b9d1c3e5f7a9b1d3
#
#   The tarball ships a Makefile that needs patching before it will build.

pkgname=greet
pkgver=1.4.0
pkgrel=2
pkgdesc="A tiny command line tool that says hello"
arch=('any')
url="https://example.org/greet"
license=('GPL')
depends=('glibc')
makedepends=('gcc' 'make' 'glibc')
checkdepends=('shunit2')
optdepends=('bash: tab completion for the -t flag')
provides=('hello')
conflicts=('hello')
replaces=('hello')
backup=('etc/greet.conf')
options=('!strip')
install=hello.install
source=("https://example.org/hello/hello-$pkgver.tar.gz")
sha256sums=('SKIP')

build() {
  cd "$pkgname-$pkgver"
  make
}

check() {
  make check
}

package() {
  install -Dm755 greet /usr/bin/greet
  install -Dm644 greet.conf /etc/greet.conf
}
`,
    },
  },

  tasks: [
    task({
      id: 'find-the-name',
      prompt:
        'Find the package’s own name. It is near the top of the file, and one ' +
        'line further down still carries the old name — the install scriptlet ' +
        'line. Put the right file name there: install=<name>.install.',
      check: (s) => {
        const values = pkgbuildAssignments(s.sim);
        if ((values.install || '') === 'greet.install') return ok('');
        return no(
          'The install line is missing, or it still carries the old name. The ' +
            'package here is called greet — that is what the pkgname line says — ' +
            'so the scriptlet has to be greet.install. That is the exact file ' +
            'name pacman looks for next to the PKGBUILD.'
        );
      },
      hint:
        'pkgname is the first assignment in the file. The scriptlet file has to ' +
        'carry that name.',
      hint2: 'install=greet.install',
      why:
        'pkgname is not decoration: it becomes the package’s name in pacman’s ' +
        'database, the file name of the built package, and the name every ' +
        'scriptlet, conflict and dependency entry has to agree with.',
    }),

    task({
      id: 'find-the-description',
      prompt:
        'Find what the description should say. The pkgdesc line still describes ' +
        'the old package — the one-line description the repositories should ' +
        'show is written in the notes at the top of the file. Put it in the ' +
        'pkgdesc line.',
      check: (s) => {
        const values = pkgbuildAssignments(s.sim);
        const desc = (values.pkgdesc || '').trim().toLowerCase();
        if (desc === DESCRIPTION.toLowerCase()) return ok('');
        return no(
          'The description still says the old thing. The one-line description ' +
            'the repositories should show is written in the notes at the top of ' +
            'this file — copy that line into pkgdesc.'
        );
      },
      hint:
        'Scroll to the top. The previous maintainer left the wording in the ' +
        'comment block.',
      hint2: `pkgdesc="${DESCRIPTION}"`,
      why:
        'pkgdesc is what pacman -Ss prints under the package name. It is the ' +
        'only thing a user reads before deciding whether to install something, ' +
        'so it has to describe the software that is actually in the package.',
    }),

    task({
      id: 'find-the-licence',
      prompt:
        'Find the licence. The licence line claims one thing; the notes at the ' +
        'top of the file say what upstream actually uses. Set the licence ' +
        'array to the truth.',
      check: (s) => {
        const license = pkgbuildArray(s.sim, 'license').map((l) => l.toLowerCase());
        if (license.includes('mit') && !license.includes('gpl')) return ok('');
        return no(
          'The licence line still says GPL, but the notes say upstream is MIT. ' +
            'A package shipped under the wrong licence is a legal problem, not ' +
            'a cosmetic one — put MIT in the licence list.'
        );
      },
      hint:
        'The previous maintainer wrote the licence down in the notes at the ' +
        'top of the file.',
      hint2: "license=('MIT')",
      why:
        'The licence tells the people who install the package what they are ' +
        'allowed to do with it. Getting it wrong is not a small mistake, and ' +
        'nobody downstream will catch it for you.',
    }),

    task({
      id: 'find-the-build-depends',
      prompt:
        'Find what has to be present to build this but not to run it. One of ' +
        'the names in makedepends belongs in depends instead — it is already ' +
        'there. Take it out of makedepends and leave the build tools alone.',
      check: (s) => {
        const makedepends = pkgbuildArray(s.sim, 'makedepends');
        const depends = pkgbuildArray(s.sim, 'depends');
        if (makedepends.includes('glibc')) {
          return no(
            'glibc is still in makedepends. depends is what the package needs to ' +
              'RUN; makedepends is what it needs to BUILD. glibc is already in ' +
              'depends, so it does not need to be in makedepends as well.'
          );
        }
        if (!makedepends.includes('make')) {
          return no(
            'The build tools have gone missing from makedepends. The compiler ' +
              'and make belong there — they are needed to build the package and ' +
              'are not needed to run it.'
          );
        }
        return ok('');
      },
      hint:
        'Look for a name that appears in both lists. The one that appears in ' +
        'both is the one that does not belong in makedepends.',
      hint2: "makedepends=('gcc' 'make')",
      why:
        'The difference between depends and makedepends is the difference ' +
        'between the kitchen and the table. Put a runtime library in ' +
        'makedepends and every machine that installs the package carries a ' +
        'build tool it will never use; leave it out of depends and the package ' +
        'installs broken.',
    }),

    task({
      id: 'find-the-checksums',
      prompt:
        'Find the checksum list. Right now the source is a tarball and its ' +
        'checksum is SKIP — which means nobody checked the download. The real ' +
        'sha256 for that tarball is written in the notes at the top of the ' +
        'file. Put it in the list.',
      check: (s) => {
        const sums = pkgbuildArray(s.sim, 'sha256sums');
        if (!sums.length) {
          return no(
            'There is no checksum list. sha256sums holds one checksum per ' +
              'source, in the same order as the sources themselves.'
          );
        }
        if (sums[0].toLowerCase() === SHA256) return ok('');
        return no(
          'The checksum is not the right one yet. The real sha256 for this ' +
            'tarball is written in the notes at the top of the file — copy that ' +
            'hash into sha256sums, in place of the SKIP.'
        );
      },
      hint:
        'The notes at the top of the file record the sha256 of the upstream ' +
        'tarball, one long line of hex.',
      hint2: `sha256sums=('${SHA256}')`,
      why:
        'The checksum is what proves the file you downloaded is the file the ' +
        'recipe was written against. SKIP is a decision, and for a plain ' +
        'tarball there is no good reason to make it — for git sources, where ' +
        'there is no fixed file to hash, there is.',
    }),

    task({
      id: 'find-the-source',
      prompt:
        'Find where the source comes from. The source line still points at the ' +
        'old project’s directory. The tarball for this package lives under ' +
        'https://example.org/greet/ — and the file name has to carry the ' +
        'version, so use $pkgver in the URL.',
      check: (s) => {
        const source = pkgbuildArray(s.sim, 'source');
        const good = source.find(
          (entry) => /^https?:\/\/example\.org\/greet\//.test(entry)
        );
        if (good) return ok('');
        const stale = source.find((entry) => /\/hello\//.test(entry));
        if (stale) {
          return no(
            'The source URL still points at the old project directory. The ' +
              'tarball lives under https://example.org/greet/, and the file name ' +
              'has to carry the version — use $pkgver so the URL follows ' +
              'pkgver when it changes.'
          );
        }
        return no(
          'No usable source yet. The source list says where the tarball comes ' +
            'from: a URL like https://example.org/greet/greet-$pkgver.tar.gz.'
        );
      },
      hint:
        'Compare the source line with the url line. One of them was updated ' +
        'when the project was renamed.',
      hint2: 'source=("https://example.org/greet/greet-$pkgver.tar.gz")',
      why:
        'The source line is where the package comes from and the checksum line ' +
        'is what proves it arrived intact. Get the URL wrong and the build ' +
        'fetches somebody else’s file, or nothing at all.',
    }),

    task({
      id: 'find-the-package-root',
      prompt:
        'Find the function that lays the built files into the package. It is ' +
        'doing it wrong: it installs straight into /usr/bin and /etc, which ' +
        'would write to your live system. Everything a package installs has to ' +
        'go under $pkgdir — the directory that becomes / when the package is ' +
        'installed.',
      check: (s) => {
        const content = s.sim.readFile('PKGBUILD') || '';
        const body = functionBody(content, 'package');
        if (!body) {
          return no(
            'There is no package() function. package() is the step that lays the ' +
              'built files into the package root.'
          );
        }
        if (!body.includes('$pkgdir')) {
          return no(
            'package() does not mention $pkgdir at all. $pkgdir is the package ' +
              'root — the directory that becomes / when the package is ' +
              'installed. Everything has to go inside it.'
          );
        }
        const real = touchesRealRoot(body);
        if (real) {
          return no(
            `package() still installs into ${real} — that is the real filesystem, ` +
              'not the package. Put the whole path under $pkgdir, so the ' +
              'installed package has the file where it is supposed to have it.'
          );
        }
        return ok('');
      },
      hint:
        'Look at the two install lines inside package(). The destination is ' +
        'wrong in both of them.',
      hint2:
        'install -Dm755 greet "$pkgdir/usr/bin/greet" — the destination is ' +
        'under $pkgdir.',
      why:
        'package() never touches your system; it assembles a directory tree ' +
        'that pacman later copies into /. Writing to /usr/bin during a build ' +
        'pollutes the machine you built on and puts files in the package that ' +
        'nobody asked for.',
    }),

    task({
      id: 'find-the-missing-step',
      prompt:
        'One step is missing entirely. The notes say the tarball needs patching ' +
        'before it will build — and unpacking and patching is what prepare() ' +
        'is for. Add a prepare() function.',
      check: (s) => {
        const functions = pkgbuildFunctions(s.sim);
        if (!functions.includes('prepare')) {
          return no(
            'There is no prepare() function. prepare() is where the source is ' +
              'unpacked and patched — and this recipe’s tarball needs a patch ' +
              'before it will build.'
          );
        }
        const content = s.sim.readFile('PKGBUILD') || '';
        const body = functionBody(content, 'prepare');
        if (!body || !body.trim()) {
          return no(
            'prepare() is there but it is empty. It has to do something: ' +
              'unpack the tarball, and apply the patch the notes mention.'
          );
        }
        return ok('');
      },
      hint:
        'prepare() sits before build() in the order makepkg runs them. Give it ' +
        'a body that unpacks the source.',
      hint2:
        'prepare() {\n  tar -xf "$pkgname-$pkgver.tar.gz"\n}',
      why:
        'The four functions run in order: prepare, build, check, package. ' +
        'prepare() is where the source becomes a working tree — unpacked, ' +
        'patched, ready to compile — and skipping it is how a recipe ends up ' +
        'building the wrong thing.',
    }),
  ],

  /**
   * The state a learner who did this properly ends up in.
   *
   * The verifier applies this and asserts that every task then passes, and
   * that no task was already satisfied before the learner started.
   */
  solution: (s) => {
    // The recipe as it should read once every stale line has been found and
    // fixed. The whole file is returned, because every check reads it.
    const pkgbuild = `# Maintainer: You <you@example.com>
#
# This recipe used to build the package "hello". Upstream renamed the project
# to "greet" for 1.4.0 and several lines here were never updated.
#
# Notes left behind by the previous maintainer:
#
#   Upstream is MIT licensed.
#
#   The one-line description the repositories should show:
#     A tiny command line tool that prints a friendly greeting
#
#   sha256 of the upstream tarball:
#     ${SHA256}
#
#   The tarball ships a Makefile that needs patching before it will build.

pkgname=greet
pkgver=1.4.0
pkgrel=2
pkgdesc="${DESCRIPTION}"
arch=('any')
url="https://example.org/greet"
license=('MIT')
depends=('glibc')
makedepends=('gcc' 'make')
checkdepends=('shunit2')
optdepends=('bash: tab completion for the -t flag')
provides=('hello')
conflicts=('hello')
replaces=('hello')
backup=('etc/greet.conf')
options=('!strip')
install=greet.install
source=("https://example.org/greet/greet-$pkgver.tar.gz")
sha256sums=('${SHA256}')

prepare() {
  cd "$pkgname-$pkgver"
  patch -p1 < greet.patch
}

build() {
  cd "$pkgname-$pkgver"
  make
}

check() {
  make check
}

package() {
  install -Dm755 greet "$pkgdir/usr/bin/greet"
  install -Dm644 greet.conf "$pkgdir/etc/greet.conf"
}
`;
    // Write it into the simulator as well as returning it, so the file the
    // checks read is the file the learner ended up with.
    s.sim.writeFile('PKGBUILD', pkgbuild);
    return { 'PKGBUILD': pkgbuild };
  },

  report: {
    lede:
      'You read a real PKGBUILD and found every stale spot in it: the old name ' +
      'in the scriptlet line, the description that still described the old ' +
      'package, the wrong licence, the runtime dependency hiding in ' +
      'makedepends, the skipped checksum, the source URL pointing at the old ' +
      'project, the install step writing to the real filesystem, and the ' +
      'missing prepare().',
    next:
      'Now write one. The next lab hands you a PKGBUILD with the variables ' +
      'empty and checks what you put in them.',
  },
};

export default toolsPkgbuildRead;
