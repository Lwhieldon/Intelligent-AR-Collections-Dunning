/**
 * package-app.js
 *
 * Creates the Teams app package ZIP (appPackage/build/ar-collections-agent.zip)
 * without needing the full Teams Toolkit CLI installed.
 *
 * Usage:  npm run package
 *
 * Reads env/.env.local to substitute ${{VAR}} template variables (e.g. TEAMS_APP_ID).
 * If no .env.local exists, a fresh UUID is generated for TEAMS_APP_ID.
 *
 * The resulting .zip can be sideloaded directly in Teams or uploaded to
 * the Microsoft 365 admin center for org-wide deployment.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { randomUUID } = require('crypto');

const ROOT       = path.join(__dirname, '..');
const PKG_DIR    = path.join(ROOT, 'appPackage');
const BUILD_DIR  = path.join(PKG_DIR, 'build');
const OUTPUT_ZIP = path.join(BUILD_DIR, 'ar-collections-agent.zip');
const ENV_FILE   = path.join(ROOT, 'env', '.env.local');
const TEMP_MANIFEST = path.join(BUILD_DIR, 'manifest.json');

// Files that must exist before packaging
const REQUIRED = [
  'manifest.json',
  'declarativeAgent.json',
  'apiPlugin.json',
  'openapi.yaml',
  'color.png',
  'outline.png',
];

// ---------------------------------------------------------------------------
// Load env variables for template substitution
// ---------------------------------------------------------------------------

function loadEnv(envPath) {
  const vars = {};
  if (!fs.existsSync(envPath)) return vars;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

function substituteVars(content, vars) {
  return content.replace(/\$\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

console.log('\nAR Collections — App Packager\n');

let missing = false;
for (const f of REQUIRED) {
  const full = path.join(PKG_DIR, f);
  if (!fs.existsSync(full)) {
    console.error(`  Missing: appPackage/${f}`);
    missing = true;
  } else {
    console.log(`  Found:  appPackage/${f}`);
  }
}

if (missing) {
  console.error('\nFix missing files before packaging.');
  console.error('   For icons: run  npm run generate-icons\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Substitute template variables in manifest.json
// ---------------------------------------------------------------------------

fs.mkdirSync(BUILD_DIR, { recursive: true });

const env = loadEnv(ENV_FILE);

// Ensure TEAMS_APP_ID has a value (generate fresh if not set)
if (!env.TEAMS_APP_ID) {
  env.TEAMS_APP_ID = randomUUID();
  console.log(`  No TEAMS_APP_ID in .env.local — generated: ${env.TEAMS_APP_ID}`);
} else {
  console.log(`  Using TEAMS_APP_ID: ${env.TEAMS_APP_ID}`);
}

const rawManifest = fs.readFileSync(path.join(PKG_DIR, 'manifest.json'), 'utf8');
const resolvedManifest = substituteVars(rawManifest, env);

// Verify no unresolved placeholders remain in manifest
const remaining = [...resolvedManifest.matchAll(/\$\{\{(\w+)\}\}/g)].map(m => m[1]);
if (remaining.length) {
  console.warn(`  Warning: unresolved placeholders in manifest: ${remaining.join(', ')}`);
}

// Write resolved manifest to build dir (temp, only used for ZIP assembly)
fs.writeFileSync(TEMP_MANIFEST, resolvedManifest);

// ---------------------------------------------------------------------------
// Build ZIP using the resolved manifest + all other files from appPackage
// ---------------------------------------------------------------------------

// All files to include: resolved manifest from build dir, rest from appPackage
const zipFiles = [
  TEMP_MANIFEST,                                  // resolved manifest.json
  ...REQUIRED.slice(1).map(f => path.join(PKG_DIR, f)), // remaining files
];

if (process.platform === 'win32') {
  const fileList = zipFiles.map(f => `"${f}"`).join(', ');
  execSync(
    `powershell -Command "Compress-Archive -Force -Path ${fileList} -DestinationPath '${OUTPUT_ZIP}'"`,
    { stdio: 'inherit' }
  );
} else {
  // On Unix, copy resolved manifest to a temp location and zip everything
  const tmpDir = path.join(BUILD_DIR, '_tmp_pkg');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'manifest.json'), resolvedManifest);
  REQUIRED.slice(1).forEach(f => fs.copyFileSync(path.join(PKG_DIR, f), path.join(tmpDir, f)));
  execSync(`cd "${tmpDir}" && zip -j "${OUTPUT_ZIP}" ${REQUIRED.join(' ')}`, { stdio: 'inherit', shell: true });
  fs.rmSync(tmpDir, { recursive: true });
}

console.log(`\nApp package created: ${OUTPUT_ZIP}`);
console.log('\nNext steps:');
console.log('  1. Go to https://teams.microsoft.com → Apps → Manage your apps → Upload an app');
console.log('  2. Select "Upload a custom app" and choose the ZIP file above');
console.log('  3. The AR Collections agent will appear in Microsoft 365 Copilot Chat\n');
