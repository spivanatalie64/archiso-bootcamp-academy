/**
 * The academy shell: routing, saved progress, the course home page, and the
 * helper agent.
 *
 * No framework and no build step. The whole academy is static files, which
 * is what the hosting rule asks for: it can go on any static host, it costs
 * nothing, and it does not depend on anybody's server staying up.
 */

import { labs } from '../content/index.js';
import { LabRunner, el } from './lab.js';
import { finishConnect, connectedProject } from './connect.js';

const STORAGE_KEY = 'academy.progress.v1';

export const TRACKS = [
  {
    id: 'zero',
    title: 'Start here',
    blurb: 'No setup. No installs. Two minutes.',
  },
  {
    id: 'tools',
    title: 'The toolbox',
    blurb: 'The tools an ISO builder lives in, taught before they are needed.',
  },
  {
    id: 'iso',
    title: 'Build your own flavour',
    blurb: 'From an empty profile to an image you can boot and share.',
  },
];

/** Read saved progress. */
export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

/** Save progress. */
export function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* Storage may be unavailable in private mode. Progress is a nicety. */
  }
}

function labsInTrack(trackId) {
  return labs.filter((l) => l.track === trackId);
}

function labById(id) {
  return labs.find((l) => l.id === id);
}

// ------------------------------------------------------------------- home

function renderHome(root) {
  const progress = loadProgress();
  root.innerHTML = '';

  root.appendChild(el('header', { class: 'home-hero' }, [
    el('p', { class: 'eyebrow' }, 'ArchISO Bootcamp Academy'),
    el('h1', {}, 'Build your own flavour of Arch.'),
    el('p', { class: 'hero-lede' },
      'Everything you need to build a bootable Arch Linux ISO image — ' +
      'the profile, the packages, the boot menu, the build, and the errors ' +
      'you will hit on the way. By the end you will have built something ' +
      'that is yours.'),
    el('div', { class: 'hero-actions' }, [
      el('a', { class: 'btn btn-primary', href: '#/lab/' + labs[0].id },
        'Start the first lab'),
      el('a', { class: 'btn', href: '#/labs' }, 'See the whole path'),
    ]),
  ]));

  const done = labs.filter((l) => progress[l.id]?.complete).length;
  root.appendChild(el('p', { class: 'home-progress' },
    done === 0
      ? 'You have not started yet. The first lab takes about five minutes and needs nothing installed.'
      : `${done} of ${labs.length} labs complete.`));

  for (const track of TRACKS) {
    const trackLabs = labsInTrack(track.id);
    if (!trackLabs.length) continue;

    const items = trackLabs.map((lab, index) => {
      const p = progress[lab.id];
      const state = p?.complete ? 'complete' : p ? 'started' : 'not-started';
      return el('li', { class: `path-item ${state}` }, [
        el('a', { class: 'path-link', href: '#/lab/' + lab.id }, [
          el('span', { class: 'path-index' }, String(index + 1)),
          el('span', { class: 'path-body' }, [
            el('span', { class: 'path-title' }, lab.title),
            lab.subtitle ? el('span', { class: 'path-subtitle' }, lab.subtitle) : null,
          ]),
          el('span', { class: 'path-mark', 'aria-hidden': 'true' },
            p?.complete ? '✓' : p ? '·' : '○'),
        ]),
      ]);
    });

    root.appendChild(el('section', { class: 'track' }, [
      el('h2', {}, track.title),
      el('p', { class: 'track-blurb' }, track.blurb),
      el('ol', { class: 'path' }, items),
    ]));
  }

  root.appendChild(el('section', { class: 'home-help' }, [
    el('h2', {}, 'Stuck, or a build broke?'),
    el('p', {}, 'The helper in the corner answers from our wiki. It knows its limits and will say so rather than guess. If it cannot help, these people can:'),
    el('ul', { class: 'human-doors' }, [
      el('li', {}, [el('a', { href: 'mailto:natalie@acreetionos.org' }, 'natalie@acreetionos.org')]),
      el('li', {}, [el('a', { href: 'https://discord.acreetionos.org' }, 'discord.acreetionos.org')]),
    ]),
  ]));
}

function renderLabList(root) {
  root.innerHTML = '';
  root.appendChild(el('header', { class: 'home-hero' }, [
    el('p', { class: 'eyebrow' }, 'The path'),
    el('h1', {}, 'Every lab, in order.'),
  ]));

  const progress = loadProgress();
  for (const track of TRACKS) {
    const trackLabs = labsInTrack(track.id);
    if (!trackLabs.length) continue;
    root.appendChild(el('section', { class: 'track' }, [
      el('h2', {}, track.title),
      el('ol', { class: 'path' }, trackLabs.map((lab, index) => {
        const p = progress[lab.id];
        return el('li', { class: `path-item ${p?.complete ? 'complete' : p ? 'started' : 'not-started'}` }, [
          el('a', { class: 'path-link', href: '#/lab/' + lab.id }, [
            el('span', { class: 'path-index' }, String(index + 1)),
            el('span', { class: 'path-body' }, [
              el('span', { class: 'path-title' }, lab.title),
              lab.subtitle ? el('span', { class: 'path-subtitle' }, lab.subtitle) : null,
            ]),
            el('span', { class: 'path-mark' }, p?.complete ? '✓' : p ? '·' : '○'),
          ]),
        ]);
      })),
    ]));
  }
}

// -------------------------------------------------------------------- lab

function renderLab(root, labId) {
  const lab = labById(labId);
  root.innerHTML = '';
  if (!lab) {
    root.appendChild(el('section', { class: 'not-found' }, [
      el('h1', {}, 'That lab does not exist.'),
      el('p', {}, 'It may have been renamed.'),
      el('a', { class: 'btn', href: '#/' }, 'Back to the start'),
    ]));
    return;
  }

  root.appendChild(el('nav', { class: 'lab-nav' }, [
    el('a', { class: 'lab-back', href: '#/' }, '← All labs'),
  ]));

  root.appendChild(el('header', { class: 'lab-head' }, [
    el('p', { class: 'eyebrow' }, trackTitle(lab.track)),
    el('h1', {}, lab.title),
    lab.subtitle ? el('p', { class: 'lab-subtitle' }, lab.subtitle) : null,
  ]));

  const runnerEl = el('div', { class: 'lab-body' });
  root.appendChild(runnerEl);

  const runner = new LabRunner(lab, runnerEl, {
    onProgress: (progress) => {
      const all = loadProgress();
      all[lab.id] = { ...(all[lab.id] || {}), ...progress };
      saveProgress(all);
      updateChrome();
    },
  });

  // The next lab, once this one is done.
  const index = labs.findIndex((l) => l.id === lab.id);
  const next = labs[index + 1];
  if (next) {
    runnerEl.appendChild(el('div', { class: 'next-lab' }, [
      el('p', { class: 'eyebrow' }, 'Next'),
      el('a', { class: 'next-link', href: '#/lab/' + next.id }, next.title),
    ]));
  }
}

function trackTitle(trackId) {
  const track = TRACKS.find((t) => t.id === trackId);
  return track ? track.title : '';
}

// ------------------------------------------------------------------ chrome

function updateChrome() {
  const progress = loadProgress();
  const done = labs.filter((l) => progress[l.id]?.complete).length;
  const counter = document.querySelector('[data-progress-counter]');
  if (counter) {
    counter.textContent = done === 0 ? '' : `${done}/${labs.length}`;
  }

  // If the learner has connected their build repository, say so. The build
  // lab needs to know, and the learner should not have to remember.
  const project = connectedProject();
  let badge = document.querySelector('[data-project-badge]');
  if (project && !badge) {
    badge = el('a', {
      class: 'project-badge',
      href: project.url || '#/lab/iso-build-mkarchiso',
      title: project.path,
    }, `Connected: ${project.path}`);
    const spacer = document.querySelector('.topbar-spacer');
    if (spacer && spacer.nextSibling) {
      spacer.parentNode.insertBefore(badge, spacer.nextSibling);
    }
  }
}

// ----------------------------------------------------------------- routing

export function start() {
  const root = document.querySelector('[data-app]');

  // If the worker sent the learner back from the OAuth connect, read the
  // project out of the address and remember it before anything else.
  finishConnect();

  const route = () => {
    const hash = location.hash.replace(/^#/, '') || '/';
    const parts = hash.split('/').filter(Boolean);
    if (parts[0] === 'lab' && parts[1]) {
      renderLab(root, parts[1]);
    } else if (parts[0] === 'labs') {
      renderLabList(root);
    } else {
      renderHome(root);
    }
    updateChrome();
    window.scrollTo(0, 0);
  };

  window.addEventListener('hashchange', route);
  route();
}
