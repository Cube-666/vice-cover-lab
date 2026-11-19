// A working gta6-cover-art-01 entry (Node 22, standard library only): the app is this directory's app/ folder, plain
// static files a desktop browser loads offline (app/index.html and its ES modules, no library and no network
// request), and the program hands it in. It copies app/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun library. Only the plumbing, not the
// cover art the bounty asks for: Cover Snap, a plain one-photo square cover with a sunset tint and a bold caption,
// exported as a 1080 x 1080 PNG. Its two sample photos (app/samples/) were made for make.fun with an image model and
// are free to use. Build your own GTA-style cover maker in its place, put your 3 or 4 PNG or JPEG screenshots in
// screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// --- Pre-flight validation and post-build summary, written for this entry ---
// My own addition to the starter: before the dossier is built, check the files
// this program is about to hand in against the scorer's caps, and print a short
// summary; afterwards, report what landed in the output dir. Nothing here writes
// into /output, so the dossier bytes are unchanged.
import { readdirSync, readFileSync, statSync } from 'node:fs';

const APP_MAX_FILES = 993;
const APP_MAX_BYTES = 50331648; // 48 MiB
const INDEX_MAX_BYTES = 1048576; // 1 MiB
const SHOT_MAX_BYTES = 262144; // 256 KiB
const SHOT_MAX_SIDE = 1280;
const SHOT_MIN_SIDE = 480;
const PATH_MAX_BYTES = 1000;

function fail(message: string): never {
  throw new Error(`pre-flight: ${message}`);
}

function walkFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    found.push(path);
    if (entry.isDirectory()) walkFiles(path, found);
  }
  return found;
}

function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    if (marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buf.length) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (length < 8) return null;
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function imageSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  const size = pngSize(buf) ?? jpegSize(buf);
  if (!size) fail(`${file} is not a readable PNG or JPEG`);
  return size;
}

function preflight(here: string): void {
  const appDir = join(here, 'app');
  const indexFile = join(appDir, 'index.html');
  if (!existsSync(indexFile)) fail('app/index.html is missing');
  const indexBytes = statSync(indexFile).size;
  if (indexBytes > INDEX_MAX_BYTES) {
    fail(`app/index.html is ${indexBytes} bytes, over the ${INDEX_MAX_BYTES} cap`);
  }

  const appEntries = walkFiles(appDir);
  const appFiles = appEntries.filter((p) => statSync(p).isFile());
  const appDirs = appEntries.length - appFiles.length;
  const appBytes = appFiles.reduce((sum, p) => sum + statSync(p).size, 0);
  if (appEntries.length > APP_MAX_FILES) {
    fail(`app/ holds ${appEntries.length} files and directories, over the ${APP_MAX_FILES} cap`);
  }
  if (appBytes > APP_MAX_BYTES) {
    fail(`app/ totals ${appBytes} bytes, over the ${APP_MAX_BYTES} cap`);
  }
  for (const p of appEntries) {
    const rel = p.slice(appDir.length + 1);
    if (Buffer.byteLength(rel, 'utf8') > PATH_MAX_BYTES) {
      fail(`app path over ${PATH_MAX_BYTES} bytes: ${rel}`);
    }
  }

  const shotsDir = join(here, 'screenshots');
  const shots = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort()
    : [];
  if (shots.length < 3 || shots.length > 4) {
    fail(`screenshots/ holds ${shots.length} images, need 3 or 4`);
  }
  const shotLines: string[] = [];
  for (const name of shots) {
    const file = join(shotsDir, name);
    const bytes = statSync(file).size;
    if (bytes > SHOT_MAX_BYTES) {
      fail(`screenshots/${name} is ${bytes} bytes, over the ${SHOT_MAX_BYTES} cap`);
    }
    const { width, height } = imageSize(file);
    const longSide = Math.max(width, height);
    const shortSide = Math.min(width, height);
    if (longSide > SHOT_MAX_SIDE) {
      fail(`screenshots/${name} is ${width}x${height}, long side over ${SHOT_MAX_SIDE}`);
    }
    if (shortSide < SHOT_MIN_SIDE) {
      fail(`screenshots/${name} is ${width}x${height}, short side under ${SHOT_MIN_SIDE}`);
    }
    shotLines.push(`  ${name}: ${width}x${height}, ${(bytes / 1024).toFixed(1)} KiB`);
  }

  console.log(`pre-flight ok: app/ ${appFiles.length} files + ${appDirs} dirs, ${(appBytes / 1048576).toFixed(2)} MiB; index.html ${(indexBytes / 1024).toFixed(1)} KiB`);
  console.log(`pre-flight ok: ${shots.length} screenshots`);
  for (const line of shotLines) console.log(line);
}

function summarizeOutput(out: string): void {
  const dossierFile = join(out, 'dossier.json');
  if (!existsSync(dossierFile)) fail('dossier.json was not written');
  const dossierBytes = statSync(dossierFile).size;
  const entries = readdirSync(out).sort();
  const expected = ['app', 'dossier.json', 'screenshots'];
  const extra = entries.filter((n) => !expected.includes(n));
  const missing = expected.filter((n) => !entries.includes(n));
  if (extra.length > 0) fail(`output holds unexpected entries: ${extra.join(', ')}`);
  if (missing.length > 0) fail(`output is missing: ${missing.join(', ')}`);
  console.log(`output ok: ${entries.join(', ')}; dossier.json ${dossierBytes} bytes`);
}

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Validate the files about to be handed in before anything is copied.
preflight(here);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of app
// files, in all, or a path under app/ over 1000 bytes: app/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);

// Report what landed in the output dir.
summarizeOutput(out);
