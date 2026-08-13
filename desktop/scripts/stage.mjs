#!/usr/bin/env node
/**
 * Assemble desktop/build-stage/ for electron-builder:
 * the app (package.json + src) plus the web root (index.html, assets/, tools/),
 * so packaged builds embed the same zero-dependency assets the shell serves in
 * dev. build-stage/ is gitignored and regenerated on every dist run.
 */
import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_ROOT = join(DESKTOP_DIR, '..');
const STAGE = join(DESKTOP_DIR, 'build-stage');

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(join(STAGE, 'src'), { recursive: true });
copyFileSync(join(DESKTOP_DIR, 'package.json'), join(STAGE, 'package.json'));
// electron-builder reads its config from the project dir (build-stage/).
copyFileSync(join(DESKTOP_DIR, 'electron-builder.yml'), join(STAGE, 'electron-builder.yml'));
cpSync(join(DESKTOP_DIR, 'src'), join(STAGE, 'src'), { recursive: true });
for (const entry of ['index.html', 'assets', 'tools']) {
  cpSync(join(WEB_ROOT, entry), join(STAGE, entry), { recursive: true });
}
console.log(`staged ${STAGE}`);
