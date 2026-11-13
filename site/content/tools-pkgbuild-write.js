/**
 * Track: tools — the second half of the PKGBUILD course.
 *
 * The lesson: write one. A recipe with every variable filled in and every
 * function present, checked one variable at a time.
 */

import {
  task,
  ok,
  no,
  packageBuilt,
  pkgbuildAssignments,
  pkgbuildArray,
  pkgbuildFunctions,
} from '../assets/checks.js';

const LICENCES = new Set([
  'gpl', 'lgpl', 'agpl', 'mit', 'apache', 'bsd', 'isc', 'mpl', 'unlicense',
  'zlib', 'python', 'artistic', 'cddl', 'epl', 'custom', 'cc', 'wtfpl',
  'publicdomain',
]);

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

/** The absolute path an install command writes to, if it is not inside $pkgdir. */
function realRootTarget(text) {
  const withoutPkgdir = String(text).replace(/\$\{pkgdir\}|\$pkgdir\b/g, 'PKGROOT');
  const match = withoutPkgdir.match(
    /(?:^|[\s"'=(])(\/(?:usr|etc|bin|sbin|lib|opt|boot|var)\/)/
  );
  return match ? match[1] : null;
}

/** The package name inside a dependency entry, without any version constraint. */
function depName(entry) {
  return String(entry).split(/[<>=]/)[0].trim();
}

// --------------------------------------------------------------- validators

function vName(sim) {
  const name = (pkgbuildAssignments(sim).pkgname || '').trim();
  if (!name) {
    return no(
      'pkgname is still empty. It is the name of the package itself — pacman ' +
        'will call it that, and the built file will be ' +
        '<name>-<version>-<arch>.pkg.tar.zst. Something like "notefile".'
    );
  }
  if (!/^[a-z0-9][a-z0-9._+-]*$/.test(name)) {
    return no(
      `"${name}" will not do as a package name. Names are lower case and have ` +
        'no spaces in them — something like "notefile".'
    );
  }
  return ok('');
}

function vVersion(sim) {
  const values = pkgbuildAssignments(sim);
  const ver = (values.pkgver || '').trim();
  if (!ver) {
    return no(
      'pkgver is still empty. That is the upstream version — the version the ' +
        "software's own authors number it, like 1.4.0. Do not put a hyphen in it."
    );
  }
  if (ver.includes('-')) {
    return no(
      `pkgver still has a hyphen in it ("${ver}"). Pacman uses the hyphen to ` +
        'separate the version from the packaging release, so the upstream ' +
        'version must not carry one — write 1.4.0, not 1.4-0.'
    );
  }
  if (!/\d/.test(ver)) {
    return no(
      `pkgver ("${ver}") has no digits in it. A version is made of numbers, and ` +
        'usually letters and dots too — like 1.4.0.'
    );
  }
  const rel = (values.pkgrel || '').trim();
  if (!rel) {
    return no(
      'pkgrel is still empty. It is the packaging release: 1 for the first build ' +
        'of this version, 2 when only the recipe changed. It counts up from 1 and ' +
        'resets to 1 whenever pkgver changes.'
    );
  }
  if (!/^[1-9][0-9]*$/.test(rel)) {
    return no(
      `pkgrel is "${rel}", and it has to be a whole number counting up from 1 — ` +
        '1 for the first packaging of this version, 2 for the next.'
    );
  }
  return ok('');
}

function vDescription(sim) {
  const desc = (pkgbuildAssignments(sim).pkgdesc || '').trim();
  if (!desc) {
    return no(
      'pkgdesc is still empty. It is one short line saying what the package is — ' +
        'exactly what pacman -Ss shows the world.'
    );
  }
  if (desc.length < 5) {
    return no(
      'pkgdesc is too short to say anything. One short line saying what the ' +
        'program is.'
    );
  }
  if (desc.length > 100) {
    return no(
      `pkgdesc runs on for ${desc.length} characters. Keep it to one short line — ` +
        'under a hundred — so it still fits in a search result.'
    );
  }
  return ok('');
}

function vArch(sim) {
  const arch = pkgbuildArray(sim, 'arch');
  if (!arch.length) {
    return no(
      'arch is still empty. Say which machines this builds for: x86_64, ' +
        'aarch64, or any for the things that do not care — scripts, fonts, ' +
        'wallpapers.'
    );
  }
  const bad = arch.find((a) => !['any', 'x86_64', 'aarch64'].includes(a));
  if (bad) {
    return no(
      `arch says "${bad}", and that is not a machine anybody builds for. The ` +
        'three answers are x86_64, aarch64 and any.'
    );
  }
  return ok('');
}

function vUrl(sim) {
  const url = (pkgbuildAssignments(sim).url || '').trim();
  if (!url) {
    return no(
      "url is still empty. It is the software's home on the web — where somebody " +
        'would go to find out what this is.'
    );
  }
  if (!/^https?:\/\/\S+$/.test(url)) {
    return no(
      `url ("${url}") does not look like a web address. It starts with https:// — ` +
        'for example https://example.org/notefile.'
    );
  }
  return ok('');
}

function vLicence(sim) {
  const list = pkgbuildArray(sim, 'license');
  if (!list.length) {
    return no(
      "license is still empty. It is the software's licence, taken from the " +
        'standard set: GPL, MIT, Apache, BSD, ISC, MPL, LGPL — or "custom" when ' +
        'nothing else fits.'
    );
  }
  for (const entry of list) {
    const lower = entry.toLowerCase();
    const base = lower.split(/[-\d.]/)[0];
    if (!LICENCES.has(lower) && !LICENCES.has(base)) {
      return no(
        `"${entry}" is not a licence name I recognise. Use one of the standard ` +
          'ones — GPL, MIT, Apache, BSD, ISC, MPL, LGPL — or "custom" when ' +
          'nothing else fits.'
      );
    }
  }
  return ok('');
}

function vDepends(sim) {
  const list = pkgbuildArray(sim, 'depends');
  if (!list.length) {
    return no(
      'depends is still empty. This is what has to be installed for the package ' +
        'to RUN. Pacman enforces it, so get it wrong and the package installs ' +
        'broken.'
    );
  }
  for (const entry of list) {
    if (!/^[a-z0-9][a-z0-9._+-]*$/.test(depName(entry))) {
      return no(
        `"${entry}" does not look like a package name in depends. depends lists ` +
          'the names of packages, like curl or glibc.'
      );
    }
  }
  return ok('');
}

function vMakedepends(sim) {
  const list = pkgbuildArray(sim, 'makedepends');
  if (!list.length) {
    return no(
      'makedepends is still empty. These are the things that have to be present ' +
        'to BUILD the package and are not needed to run it — a compiler, the ' +
        'headers, make.'
    );
  }
  for (const entry of list) {
    if (!/^[a-z0-9][a-z0-9._+-]*$/.test(depName(entry))) {
      return no(
        `"${entry}" does not look like a package name in makedepends. ` +
          'makedepends lists build tools: gcc, make, cmake.'
      );
    }
  }
  const depends = pkgbuildArray(sim, 'depends').map(depName);
  const clash = list.map(depName).find((name) => depends.includes(name));
  if (clash) {
    return no(
      `"${clash}" is in depends and in makedepends. depends is what the package ` +
        'needs to RUN; makedepends is what it needs to BUILD. A runtime ' +
        'dependency does not belong in makedepends — the kitchen tools stay in ' +
        'the kitchen.'
    );
  }
  return ok('');
}

function vSources(sim) {
  const source = pkgbuildArray(sim, 'source');
  if (!source.length) {
    return no(
      'source is still empty. This is where everything comes from: the tarball ' +
        'URL, a local file, or a git repository with its branch or commit pinned ' +
        'in the string.'
    );
  }
  for (const entry of source) {
    const url = /^(https?|ftp|git):\/\//.test(entry);
    const named = /^[^:\s]+::/.test(entry);
    const local = /^[\w.\/-]+\.(tar\.gz|tar\.xz|tar\.bz2|tar\.zst|tgz|zip|patch)$/.test(entry);
    if (!url && !named && !local) {
      return no(
        `"${entry}" does not look like a source. A source is a URL, a local file ` +
          'name, or a git URL with the branch or commit pinned in it.'
      );
    }
  }
  const sums = pkgbuildArray(sim, 'sha256sums');
  if (!sums.length) {
    return no(
      'There is no checksum list. sha256sums holds one checksum per source, in ' +
        'the same order — it is what proves the download is the file the recipe ' +
        'was written against.'
    );
  }
  if (sums.length !== source.length) {
    return no(
      `There are ${source.length} source${source.length === 1 ? '' : 's'} and ` +
        `${sums.length} checksum${sums.length === 1 ? '' : 's'}. The list needs ` +
        'one checksum per source, in the same order.'
    );
  }
  const bad = sums.find((sum) => !/^[0-9a-f]{64}$/i.test(sum) && sum !== 'SKIP');
  if (bad) {
    return no(
      `"${bad}" is not a checksum. A sha256 is 64 hex characters — or SKIP, ` +
        'which is a decision you make for git sources, not a shortcut.'
    );
  }
  return ok('');
}

function vFunctions(sim) {
  const functions = pkgbuildFunctions(sim);
  const steps = {
    prepare: 'unpacks the source and applies any patches',
    build: 'compiles it',
    check: 'runs the test suite',
    package: 'lays the built files into the package root',
  };
  for (const name of ['prepare', 'build', 'check', 'package']) {
    if (!functions.includes(name)) {
      return no(
        `There is no ${name}() function. ${name}() is the step that ` +
          `${steps[name]}. The four steps run in order: prepare, build, check, ` +
          'package.'
      );
    }
  }
  const content = sim.readFile('PKGBUILD') || '';
  const body = functionBody(content, 'package');
  if (!body || !body.includes('$pkgdir')) {
    return no(
      'package() does not put anything under $pkgdir. $pkgdir is the package ' +
        'root — the directory that becomes / when the package is installed. ' +
        'Everything the package contains has to go inside it.'
    );
  }
  const real = realRootTarget(body);
  if (real) {
    return no(
      `package() installs into ${real} — the real filesystem. A build never ` +
        'writes to your live system. Everything goes under $pkgdir, so the ' +
        'package ends up with the file where it belongs.'
    );
  }
  const stray = content
    .split('\n')
    .map((line) => realRootTarget(line))
    .find(Boolean);
  if (stray) {
    return no(
      `Something in this recipe installs into ${stray} — the real filesystem. ` +
        'A build never writes to your live system; everything goes under $pkgdir.'
    );
  }
  return ok('');
}

const VALIDATORS = [
  vName,
  vVersion,
  vDescription,
  vArch,
  vUrl,
  vLicence,
  vDepends,
  vMakedepends,
  vSources,
  vFunctions,
];

export const toolsPkgbuildWrite = {
  id: 'tools-pkgbuild-write',
  track: 'tools',
  title: 'Writing a PKGBUILD',
  subtitle: 'Every variable, filled in and checked, one at a time.',

  scenario:
    'There is a small program that needs a recipe. Notefile: a tiny command ' +
    'line notepad that appends a line to a note file and can sync the note to ' +
    'a remote server. It has an upstream release, a licence, a tarball and a ' +
    'build system, and none of that means anything to pacman until somebody ' +
    'writes the PKGBUILD that says all of it. That somebody is you.',

  teaches:
    'A PKGBUILD is a shell script, and every assignment in it is a variable ' +
    'with a job. Fill them in honestly and the packaging tools can do the ' +
    'rest; leave one of them wrong and the failure is quiet — a package that ' +
    'installs broken, a version that never updates, a licence that is not ' +
    'yours to give. This lab fills in one, variable by variable, and checks ' +
    'each one on its own.',

  readFirst: [
    {
      title: 'The program you are packaging',
      body: [
        'Notefile is a tiny command line notepad. It appends a line to a note ' +
          'file, and with -s it syncs the note to a remote server over HTTPS, ' +
          'so it needs curl at run time.',
        'Upstream calls the release 1.4.0 and licenses it MIT. The project page ' +
          'is https://example.org/notefile, and the tarball is ' +
          'https://example.org/notefile/notefile-1.4.0.tar.gz. It builds with ' +
          'make and gcc, its tests want shunit2, and bash is an optional extra ' +
          'that adds tab completion.',
      ],
    },
    {
      title: 'The variables, in the order you need them',
      body: [
        'pkgname is the package’s name; pkgver is the upstream version, exactly ' +
          'as its authors number it — letters, numbers, dots, and no hyphens, ' +
          'because pacman uses the hyphen to separate the version from the ' +
          'packaging release. pkgrel is that packaging release: 1, 2, 3, counting ' +
          'up while only the recipe changes and resetting to 1 whenever pkgver ' +
          'changes.',
        'pkgdesc is one short line saying what the package is — the line ' +
          'pacman -Ss shows the world. arch is x86_64, aarch64, or any for ' +
          'things that run anywhere. url is the software’s home on the web. ' +
          'license is its licence, from the standard set: GPL, MIT, Apache, and ' +
          'so on, or custom when nothing else fits.',
      ],
    },
    {
      title: 'Kitchen and table',
      body: [
        'depends is what must be installed for the package to RUN, and pacman ' +
          'enforces it. makedepends is what must be present to BUILD it and is ' +
          'not needed to run it: the compiler, the headers, make. The same name ' +
          'in both lists is a mistake — the kitchen tools stay in the kitchen. ' +
          'checkdepends is what the test suite needs while check() runs, and ' +
          'optdepends is optional extras, each with a few words on what it adds.',
      ],
    },
    {
      title: 'Sources and checksums',
      body: [
        'source says where everything comes from: tarball URLs, local files, or ' +
          'a git repository with the branch or commit pinned in the source string ' +
          'itself. sha256sums holds one checksum per source, in the same order, ' +
          'proving the download is the file the recipe was written against. ' +
          'SKIP exists, mainly for git sources — and choosing it is a decision, ' +
          'not a shortcut.',
      ],
    },
    {
      title: 'The four functions',
      body: [
        'prepare() unpacks the source and applies any patches. build() compiles ' +
          'it. check() runs the tests. package() lays the built files into the ' +
          'package root — $pkgdir, and only $pkgdir. $pkgdir becomes / when the ' +
          'package is installed, so a package() that writes to /usr/bin is not ' +
          'building a package, it is modifying your machine.',
      ],
    },
  ],

  env: {
    type: 'editor',
    prompt:
      'A PKGBUILD with every variable left empty and the four functions ' +
      'waiting for their bodies. Fill it in. The checks look at what you write ' +
      'here.',
    packages: ['base', 'pacman', 'bash', 'curl'],
    files: {
      PKGBUILD: `# Maintainer: You <you@example.com>
#
# A PKGBUILD is a shell script that describes a package. Every assignment
# below is a variable the packaging tools read, and the four functions at the
# bottom are the steps, in the order they run.

pkgname=
pkgver=
pkgrel=
pkgdesc=
arch=()
url=
license=()
depends=()
makedepends=()
checkdepends=()
optdepends=()
source=()
sha256sums=()

# Optional, and worth knowing about:
# provides=()            # what this package can stand in for
# conflicts=()           # what it cannot be installed alongside
# replaces=()            # what it supersedes
# backup=()              # config files pacman will not overwrite on upgrade
# options=('!strip')     # build switches, mostly negations
# install=notefile.install   # a scriptlet pacman runs at install time
# validpgpkeys=()        # fingerprints allowed to sign the sources

prepare() {
}

build() {
}

check() {
}

package() {
}
`,
    },
  },

  tasks: [
    task({
      id: 'the-name',
      prompt:
        'Give the package its name. pkgname is the name pacman will know it ' +
        'by, and the first part of the file that comes out.',
      check: (s) => vName(s.sim),
      hint:
        'It goes on the line that says pkgname=, in lower case and with no ' +
        'spaces.',
      hint2: 'pkgname=notefile',
      why:
        'The name is how the package is known for its whole life: in pacman’s ' +
        'database, in the built file’s name, and in every dependency entry ' +
        'that refers to it.',
    }),

    task({
      id: 'the-version',
      prompt:
        'Say which version this is. pkgver is the upstream version — the ' +
        'version the software’s own authors number it — and pkgrel is the ' +
        'packaging release, counting up from 1.',
      check: (s) => vVersion(s.sim),
      hint:
        'pacman compares pkgver to decide what is newer, so the hyphen is ' +
        'reserved: the version cannot contain one.',
      hint2: 'pkgver=1.4.0 and pkgrel=1 — this is the first packaging of it.',
      why:
        'Version is the software; release is the packaging of it. Get the ' +
        'hyphen rule wrong and pacman compares versions wrongly, and users ' +
        'never receive the update you made.',
    }),

    task({
      id: 'the-description',
      prompt:
        'Write the description: one short line saying what the package is. ' +
        'This is the line pacman -Ss shows the world.',
      check: (s) => vDescription(s.sim),
      hint:
        'It is a single line, in the pkgdesc= assignment, and it should be ' +
        'short enough to read in a search result.',
      hint2:
        'pkgdesc="A tiny command line notepad that syncs notes to a server"',
      why:
        'pkgdesc is the only thing somebody reads before deciding to install ' +
        'something. Vague or missing, and people install the wrong thing or ' +
        'nothing at all.',
    }),

    task({
      id: 'the-architecture',
      prompt:
        'Say which architectures this builds for. If the program is a script ' +
        'or a font and does not care about the machine, there is a value for ' +
        'exactly that.',
      check: (s) => vArch(s.sim),
      hint:
        'Three answers: x86_64, aarch64, and the one for anything that runs ' +
        'everywhere.',
      hint2: "arch=('any') — a notepad script does not care what the CPU is.",
      why:
        'arch tells pacman whether a package can be installed on this machine ' +
        'at all. Getting it wrong means either a package nobody can install, ' +
        'or one that gets installed where it cannot run.',
    }),

    task({
      id: 'the-home-page',
      prompt: 'Point at the software’s home on the web.',
      check: (s) => vUrl(s.sim),
      hint: 'It goes on the url= line, and it starts with https://.',
      hint2: 'url="https://example.org/notefile"',
      why:
        'url is where a person goes to find out what a package is, report a ' +
        'problem, or read the changelog. It is the link that makes the rest ' +
        'of the recipe checkable.',
    }),

    task({
      id: 'the-licence',
      prompt:
        'Record the licence, taken from the standard set. If nothing fits, ' +
        'there is a value for that too.',
      check: (s) => vLicence(s.sim),
      hint:
        'It is an array, like arch and depends: license=(MIT).',
      hint2: "license=('MIT') — notefile is MIT licensed.",
      why:
        'The licence says what the people who install the package are allowed ' +
        'to do with it. Getting it wrong is a legal problem for you and for ' +
        'everyone downstream.',
    }),

    task({
      id: 'the-runtime-depends',
      prompt:
        'List what has to be installed for this package to RUN. Pacman ' +
        'enforces this list, so if you get it wrong the package installs ' +
        'broken.',
      check: (s) => vDepends(s.sim),
      hint:
        'depends is an array of package names. Notefile syncs over HTTPS, so ' +
        'one thing belongs here.',
      hint2: "depends=('curl')",
      why:
        'depends is a promise pacman keeps on your behalf: when the package ' +
        'installs, its requirements are already there. Leave a runtime ' +
        'dependency out and the failure lands on the user, not on you.',
    }),

    task({
      id: 'the-build-depends',
      prompt:
        'List what has to be present to BUILD this package but not to run it: ' +
        'the compiler, the headers, make. The same name must not appear in ' +
        'both lists.',
      check: (s) => vMakedepends(s.sim),
      hint:
        'makedepends is the kitchen; depends is the table. A name that appears ' +
        'in both is the mistake.',
      hint2: "makedepends=('gcc' 'make')",
      why:
        'The difference between depends and makedepends is the difference ' +
        'between the kitchen and the table. Put a runtime library in ' +
        'makedepends and every machine that installs the package carries build ' +
        'tools it will never use.',
    }),

    task({
      id: 'the-sources',
      prompt:
        'Say where the source comes from, and give one checksum per source, ' +
        'in the same order. The checksum is what proves the download is the ' +
        'file the recipe was written against.',
      check: (s) => vSources(s.sim),
      hint:
        'source is an array of URLs; sha256sums is an array of checksums with ' +
        'exactly as many entries as source has.',
      hint2:
        'source=("https://example.org/notefile/notefile-1.4.0.tar.gz") and one ' +
        '64-character hex checksum beside it.',
      why:
        'The URL says where the code comes from and the checksum says it is ' +
        'the code you expected. SKIP is a decision — fine for git sources, ' +
        'hard to defend for a plain tarball.',
    }),

    task({
      id: 'the-steps',
      prompt:
        'Write the four functions. prepare() unpacks and patches, build() ' +
        'compiles, check() runs the tests, package() lays the built files into ' +
        'the package root — and the package root is $pkgdir, never the real ' +
        'filesystem.',
      check: (s) => vFunctions(s.sim),
      hint:
        'The install line inside package() has to point inside $pkgdir, so ' +
        'that the file lands in the package and not on this machine.',
      hint2:
        'install -Dm755 notefile "$pkgdir/usr/bin/notefile" — the destination ' +
        'is under $pkgdir.',
      why:
        'A package is what package() collects, and nothing else. If package() ' +
        'writes to /usr/bin, the build has modified the machine it ran on and ' +
        'the package is missing the file it promised.',
    }),

    task({
      id: 'build-it',
      prompt:
        'Put it all together and build it. With every variable filled in and ' +
        'every function present, makepkg turns this PKGBUILD into a package ' +
        'file: notefile-<version>-<arch>.pkg.tar.zst. The terminal under the ' +
        'editor sees the file you are writing — run makepkg there.',
      check: (s) => {
        for (const validate of VALIDATORS) {
          const result = validate(s.sim);
          if (!result.done) return no(result.message);
        }
        const name = pkgbuildAssignments(s.sim).pkgname;
        if (packageBuilt(s.sim, name)) return ok('');
        const missing = pkgbuildArray(s.sim, 'depends')
          .map(depName)
          .filter((d) => !s.sim.state.packages.has(d));
        if (missing.length) {
          return no(
            'The recipe itself is valid, but the build did not produce a ' +
              'package: makepkg needs every name in depends to be installed, ' +
              `and "${missing[0]}" is not installed here. Install it, or depend ` +
              'on something this machine has.'
          );
        }
        return no(
          'The recipe is valid, but no package has been built yet. Run makepkg ' +
            'in the terminal — the file you edited above is the file it reads.'
        );
      },
      hint:
        'makepkg reads the PKGBUILD in the directory you are standing in, ' +
        'checks the depends list, and writes the package file next to it.',
      hint2: 'cd to the directory holding this PKGBUILD, then makepkg.',
      why:
        'This is the payoff: a recipe that is right in every variable produces ' +
        'a package other people can install with one command, and produces ' +
        'the same package on their machine as on yours.',
    }),
  ],

  /**
   * The state a learner who did this properly ends up in.
   *
   * The verifier applies this and asserts that every task then passes, and
   * that no task was already satisfied before the learner started.
   */
  solution: (s) => {
    // The recipe the learner ends up with, and then the build it produces.
    const pkgbuild = `# Maintainer: You <you@example.com>
#
# A recipe for notefile, a tiny command line notepad that syncs notes to a
# remote server over HTTPS.

pkgname=notefile
pkgver=1.4.0
pkgrel=1
pkgdesc="A tiny command line notepad that syncs notes to a server"
arch=('any')
url="https://example.org/notefile"
license=('MIT')
depends=('curl')
makedepends=('gcc' 'make')
checkdepends=('shunit2')
optdepends=('bash: tab completion')
source=("https://example.org/notefile/notefile-1.4.0.tar.gz")
sha256sums=('a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90')

prepare() {
  cd "$pkgname-$pkgver"
}

build() {
  make
}

check() {
  make check
}

package() {
  install -Dm755 notefile "$pkgdir/usr/bin/notefile"
  install -Dm644 notefile.conf "$pkgdir/etc/notefile.conf"
}
`;
    // Write it into the simulator as well as returning it, so the file the
    // checks read is the file the learner ended up with.
    s.sim.writeFile('PKGBUILD', pkgbuild);
    // And then build it, which is the whole point of the last task.
    s.sim.run('cd /home/learner');
    s.sim.run('makepkg');
    return { 'PKGBUILD': pkgbuild };
  },

  report: {
    lede:
      'You wrote a complete PKGBUILD — name, version, release, description, ' +
      'architecture, home page, licence, the two dependency lists kept ' +
      'separate, the source with a checksum beside it, and the four functions ' +
      'with package() filling $pkgdir and nothing else. Every one of those ' +
      'variables is a promise to the person who installs your package.',
    next:
      'You have read one and written one. The rest of the course takes that ' +
      'recipe and puts it where it belongs: in a profile, in an image, and in ' +
      'a repository the image can actually reach.',
  },
};

export default toolsPkgbuildWrite;
