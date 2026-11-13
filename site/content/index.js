import { zeroWhatIsAnIso } from './zero-what-is-an-iso.js';
import { toolsPacman } from './tools-pacman.js';
import { toolsGit } from './tools-git.js';
import { toolsDevtools } from './tools-devtools.js';
import { toolsAurHelpers } from './tools-aur-helpers.js';
import { toolsPkgbuildRead } from './tools-pkgbuild-read.js';
import { toolsPkgbuildWrite } from './tools-pkgbuild-write.js';
import { isoProfileAnatomy } from './iso-profile-anatomy.js';
import { isoPackagesAndPacman } from './iso-packages-and-pacman.js';
import { isoAirootfs } from './iso-airootfs.js';
import { isoBootloaders } from './iso-bootloaders.js';
import { isoBuildMkarchiso } from './iso-build-mkarchiso.js';
import { isoReadTheErrors } from './iso-read-the-errors.js';
import { isoTestTheImage } from './iso-test-the-image.js';
import { isoMakeItYours } from './iso-make-it-yours.js';

/**
 * The whole course, in order.
 *
 * The order is the argument. Lesson Zero assumes nothing. The toolbox is
 * taught before it is needed. The ISO track builds one piece at a time, and
 * the last lab is not a checklist — it is the learner making the thing
 * theirs.
 */
export const labs = [
  // --- Start here
  zeroWhatIsAnIso,

  // --- The toolbox
  toolsPacman,
  toolsGit,
  toolsDevtools,
  toolsAurHelpers,
  toolsPkgbuildRead,
  toolsPkgbuildWrite,

  // --- Build your own flavour
  isoProfileAnatomy,
  isoPackagesAndPacman,
  isoAirootfs,
  isoBootloaders,
  isoBuildMkarchiso,
  isoReadTheErrors,
  isoTestTheImage,
  isoMakeItYours,
];

export { labs as default };
