const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const yauzl = require('yauzl');

const root = path.resolve(__dirname, '..');
const manifest = require('../package.json');
const vsix = path.join(root, 'dist', 'build', `${manifest.name}-${manifest.version}.vsix`);
const allowed = /^(?:\[Content_Types\]\.xml|extension\.vsixmanifest|extension\/(?:package\.json|readme\.md|LICENSE\.txt|changelog\.md|media\/icons\/(?:sessions\.svg|usage\.svg|icon\.png)|media\/webview\/sessions\/sessions\.(?:html|css|js)|media\/webview\/usage\/(?:usage|usage-window|usage-bar|usage-bar-empty)\.html|media\/webview\/usage\/usage\.css|dist\/extension\.js|dist\/controller\/session-controller\.js|dist\/model\/(?:session|usage)\.js|dist\/services\/(?:account-usage|codex-integration|local-files|session-store|usage-reader)\.js|dist\/util\/json\.js|dist\/views\/(?:session-details-provider|session-view|usage-view|webview-assets)\.js|docs\/(?:INTEGRATION|PRIVACY|VALIDATION)\.md))$/;
const forbiddenContent = [/PRIVATE_AUTH_DO_NOT_READ/, /MUST_NOT_BE_EXPOSED/, /[A-Z]:\\Users\\/i, /sk-(?:proj-)?[a-zA-Z0-9_-]{24,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];

function openZip() {
  return new Promise((resolve, reject) => {
    yauzl.open(vsix, { lazyEntries: true }, (error, zip) => error ? reject(error) : resolve(zip));
  });
}

function readEntry(zip, entry) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) { reject(error); return; }
      const chunks = [];
      stream.on('error', reject);
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}

async function inspectEntries(zip) {
  const files = [];
  return new Promise((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', () => resolve(files));
    zip.on('entry', entry => {
      void inspectEntry(zip, entry).then(() => {
        files.push(entry.fileName);
        zip.readEntry();
      }).catch(error => { zip.close(); reject(error); });
    });
    zip.readEntry();
  });
}

async function inspectEntry(zip, entry) {
  assert.ok(allowed.test(entry.fileName), `Unexpected packaged file: ${entry.fileName}`);
  const bytes = await readEntry(zip, entry);
  if (entry.fileName === 'extension/media/icons/icon.png') {
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 256);
    assert.equal(bytes.readUInt32BE(20), 256);
    return;
  }
  const text = bytes.toString('utf8');
  assert.ok(!forbiddenContent.some(pattern => pattern.test(text)), `Private content detected in ${entry.fileName}`);
  if (entry.fileName === 'extension/package.json') {
    const packaged = JSON.parse(text);
    assert.equal(packaged.name, manifest.name);
    assert.equal(packaged.version, manifest.version);
    assert.equal(Object.keys(packaged.dependencies ?? {}).length, 0, 'No packaged runtime dependencies');
  }
}

async function inspect() {
  assert.ok(fs.existsSync(vsix), 'Build the VSIX with npm run package first.');
  const files = await inspectEntries(await openZip());
  assert.ok(files.includes('extension/dist/extension.js'));
  assert.ok(files.includes('extension/docs/PRIVACY.md'));
  assert.ok(!files.some(name => name.includes('docs/internal')), 'Internal docs stay out of the package');
  assert.ok(files.includes('extension/package.json'));
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0, 'No runtime dependencies');
  console.log(`PASS: ${files.length} allowlisted VSIX files; no local data, credentials, tests or dependencies included.`);
}

inspect().catch(error => { console.error(error); process.exitCode = 1; });
