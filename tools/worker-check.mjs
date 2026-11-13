#!/usr/bin/env node
/**
 * Test the worker's knowledge and honesty.
 *
 * Two things matter about the helper and neither of them is visible on the
 * page:
 *
 *   - it answers from our wiki, so the passages it picks have to be the
 *     right ones
 *   - it says when it does not know, so the "nothing covers this" path has
 *     to work
 *
 * Both are testable without a model, a network or an account.
 */

import { selectContext } from '../worker/src/wiki.js';

let failures = 0;

function assert(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- a stand-in for the wiki, with the shape loadWiki() produces
const documents = [
  {
    name: 'wiki digest',
    weight: 1.2,
    chunks: [
      'AcreetionOS is a free, open-source, privacy-focused Linux distribution based on Arch Linux. ' +
      'It features a customised Cinnamon desktop and is an independent, volunteer-run project. ' +
      'There is no telemetry and the repositories are sovereign.',
      'To install software on AcreetionOS use pacman. Search with pacman -Ss, install with ' +
      'pacman -S, remove with pacman -R, and update with pacman -Syu. The AUR holds user-submitted ' +
      'build recipes that are unofficial and unsupported; read the PKGBUILD before you build it.',
      'The wiki covers WiFi, Bluetooth, NVIDIA drivers, printers, the firewall and system maintenance.',
    ],
  },
  {
    name: 'building your own ISO',
    weight: 1.4,
    chunks: [
      'archiso builds installation media from a profile. A profile is a directory containing ' +
      'profiledef.sh, packages.x86_64, pacman.conf, an airootfs directory and the boot loader ' +
      'configuration. Build it with mkarchiso -w work -o out profile.',
      'A profile that inherits /etc/pacman.d/mirrorlist is not hermetic, because that is the build ' +
      'machine mirror list. Write the servers out in full in the profile pacman.conf instead, and ' +
      'remember that pacman resolves a relative Include against the current working directory.',
      'The image needs two systemd units, not one: etc-pacman.d-gnupg.mount and pacman-init.service. ' +
      'Shipping only the service fails silently, because a missing Requires dependency is a failed ' +
      'dependency, and the image boots but pacman cannot install anything.',
    ],
  },
];

const courseText = [
  { label: 'course: What a profile is made of', text: 'The five things in a profile: profiledef.sh, packages.x86_64, pacman.conf, airootfs, and the boot loader directories.' },
];

// --- the right passages for the right question
{
  const { passages, covered } = selectContext(documents, 'How do I install a package with pacman?', courseText);
  assert('a pacman question is covered', covered);
  const text = passages.map((p) => p.text).join(' ');
  assert('the pacman passage is chosen', /pacman -Ss/.test(text), text.slice(0, 120));
}

{
  const { passages, covered } = selectContext(documents, 'Why does my image boot but pacman cannot install anything?', courseText);
  assert('a keyring question is covered', covered);
  const text = passages.map((p) => p.text).join(' ');
  assert('the keyring passage is chosen', /etc-pacman.d-gnupg.mount/.test(text), text.slice(0, 120));
}

{
  const { passages, covered } = selectContext(documents, 'my image cannot find a mirrorlist', courseText);
  assert('a mirrorlist question is covered', covered);
  const text = passages.map((p) => p.text).join(' ');
  assert('the mirrorlist passage is chosen', /current working directory/.test(text), text.slice(0, 140));
}

{
  const { passages, covered } = selectContext(documents, 'what is in a profile', courseText);
  assert('a profile question is covered', covered);
  const text = passages.map((p) => p.text).join(' ');
  assert('the profile passage is chosen', /profiledef\.sh/.test(text), text.slice(0, 120));
}

// --- and the honest path
{
  const { covered } = selectContext(documents, 'what is the airspeed velocity of an unladen swallow', courseText);
  assert('an unanswerable question is not covered', !covered);
}

{
  const { covered } = selectContext(documents, 'the recipe for my lasagne', courseText);
  assert('a nonsense question is not covered', !covered);
}

// --- the course is a source too
{
  const { passages, covered } = selectContext(documents, 'what are the five things in a profile', courseText);
  assert('the course grounds an answer', covered);
  assert('the course passage is used',
    passages.some((p) => p.source.startsWith('course:')));
}

console.log('');
if (failures) {
  console.log(`${failures} failure(s).`);
  process.exit(1);
}
console.log('The worker grounds correctly and refuses when it should.');
