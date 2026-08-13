import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formQRFilename } from '../src/lib/brandedFormQR.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('form QR filenames are predictable and filesystem safe', () => {
  assert.equal(formQRFilename({ slug: 'terms-and-conditions-123abc' }), 'terms-and-conditions-123abc-xert-qr.png');
  assert.equal(formQRFilename({ title: '../ Unsafe Form?!' }), 'unsafe-form-xert-qr.png');
  assert.equal(formQRFilename({}), 'xert-form-xert-qr.png');
});

test('form manager creates a local high-correction branded QR with mobile download and share', async () => {
  const [manager, component, helper, manifest, packageLock] = await Promise.all([
    read('../src/components/admin/FormsSurveysManager.jsx'),
    read('../src/components/admin/FormQRCode.jsx'),
    read('../src/lib/brandedFormQR.js'),
    read('../package.json'),
    read('../package-lock.json'),
  ]);

  assert.match(manager, /<FormQRCode form=\{active\} publicURL=\{url\}/);
  assert.match(manager, /const url=publicFormURL\(active\)/);
  assert.match(component, /Download PNG/);
  assert.match(component, /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(component, /navigator\.share\(\{ files: \[file\]/);
  assert.match(component, /canvas[\s\S]*aspect-square/);
  assert.match(component, /generationRef[\s\S]*document\.createElement\('canvas'\)/);
  assert.match(component, /generation !== generationRef\.current/);
  assert.match(component, /context\.drawImage\(renderedCanvas, 0, 0\)/);
  assert.match(component, /setTimeout\(\(\) => URL\.revokeObjectURL\(objectURL\), 30_000\)/);
  assert.match(helper, /await import\('qrcode'\)/);
  assert.match(helper, /errorCorrectionLevel: 'H'/);
  assert.match(helper, /margin: 4/);
  assert.match(helper, /FORM_QR_SIZE = 1024/);
  assert.match(helper, /FORM_QR_LOGO_PATH = '\/assets\/xert-logo-icon\.png'/);
  assert.match(helper, /url\.origin !== window\.location\.origin/);
  assert.match(helper, /const padSize = Math\.round\(actualSize \* 0\.22\)/);
  assert.match(helper, /const logoSize = Math\.round\(actualSize \* 0\.18\)/);
  assert.match(helper, /context\.fillStyle = '#ffffff'/);
  assert.match(helper, /context\.drawImage\(logo/);
  assert.match(manifest, /"qrcode": "1\.5\.4"/);
  assert.match(packageLock, /node_modules\/qrcode/);
  assert.doesNotMatch(helper, /fetch\(|api\.qr|googleapis|quickchart/i);
});
