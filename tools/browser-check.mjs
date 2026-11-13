#!/usr/bin/env node
/**
 * Drive the academy in a real browser.
 *
 * The static checks in verify-labs.mjs prove the labs are logically sound.
 * This proves the site actually renders them: it loads the course home,
 * walks every lab, and checks that the scenario, the task list and the
 * environment all appear, and that nothing is logged to the console as an
 * error.
 *
 * It takes a screenshot of every lab, because a lab that renders badly is
 * still a broken lab, and a machine cannot see that.
 *
 *     node tools/browser-check.mjs [baseUrl] [outDir]
 *
 * Needs playwright and a browser:
 *     npm i playwright && npx playwright install chromium
 */

import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const playwright = await import('playwright');

// Chromium by default; firefox works too and is handy when only one of them
// is installed locally.
const browserName = process.env.BROWSER || 'chromium';
const browser = await playwright[browserName].launch();

const here = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2] || 'http://127.0.0.1:8765';
const outDir = resolve(process.argv[3] || resolve(here, '..', 'screenshots'));

mkdirSync(outDir, { recursive: true });

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const problems = [];
const consoleErrors = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push('pageerror: ' + error.message));

// --- the course home
await page.goto(baseUrl + '/index.html', { waitUntil: 'networkidle' });
await page.waitForSelector('.home-hero h1', { timeout: 10000 });
const heroTitle = await page.textContent('.home-hero h1');
console.log('home:', heroTitle.trim());

const labLinks = await page.$$eval('.path-link', (nodes) =>
  nodes.map((n) => n.getAttribute('href'))
);
console.log(`home: ${labLinks.length} labs listed`);

if (!labLinks.length) problems.push('the course home lists no labs');

await page.screenshot({ path: resolve(outDir, '00-home.png'), fullPage: true });

// --- every lab
let index = 0;
for (const href of labLinks) {
  index += 1;
  const id = href.replace('#/lab/', '');

  await page.goto(baseUrl + '/index.html' + href, { waitUntil: 'networkidle' });
  await page.waitForSelector('.lab-head h1', { timeout: 10000 });
  await page.waitForTimeout(120);

  const title = (await page.textContent('.lab-head h1')).trim();
  const scenario = await page.$('.scenario-text');
  const tasks = await page.$$eval('.task', (nodes) => nodes.length);
  const hasEnv = Boolean(
    await page.$('.code-editor') ||
    await page.$('.terminal') ||
    await page.$('.build-panel')
  );
  const hasReport = Boolean(await page.$('.lab-report'));

  const label = String(index).padStart(2, '0');
  console.log(
    `lab ${label} ${id.padEnd(26)} ` +
    `tasks=${String(tasks).padStart(2)} ` +
    `env=${hasEnv ? 'yes' : 'NO '} ` +
    `scenario=${scenario ? 'yes' : 'NO '} ` +
    `report=${hasReport ? 'yes' : 'NO '}`
  );

  if (!scenario) problems.push(`${id}: no scenario rendered`);
  if (!tasks) problems.push(`${id}: no tasks rendered`);
  if (!hasEnv) problems.push(`${id}: no environment rendered`);
  if (!hasReport) problems.push(`${id}: no report panel rendered`);

  await page.screenshot({ path: resolve(outDir, `${label}-${id}.png`), fullPage: true });
}

// --- the helper panel
await page.goto(baseUrl + '/index.html', { waitUntil: 'networkidle' });
await page.click('[data-agent-toggle]');
await page.waitForTimeout(200);
const agentOpen = await page.isVisible('.agent-panel.open');
console.log('agent panel opens:', agentOpen);
if (!agentOpen) problems.push('the helper panel does not open');
await page.screenshot({ path: resolve(outDir, '99-agent.png') });

await browser.close();

if (consoleErrors.length) {
  console.log('');
  console.log('console errors:');
  for (const error of [...new Set(consoleErrors)]) console.log('  ' + error);
}

console.log('');
if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const problem of problems) console.log('  ' + problem);
  process.exit(1);
}
if (consoleErrors.length) {
  console.log('The site rendered, but the console had errors.');
  process.exit(1);
}
console.log(`All ${labLinks.length} labs rendered. Screenshots in ${outDir}`);
