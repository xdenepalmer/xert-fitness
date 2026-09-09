import assert from 'node:assert/strict';
import { assertReachableControl } from './control-geometry.mjs';

export async function checkAdminQR(page, { capture = async () => {} } = {}) {
  const downloadButton = page.getByRole('button', { name: 'Download PNG', exact: true });
  const downloadPromise = page.waitForEvent('download');
  await downloadButton.click();
  const download = await downloadPromise;
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const png = Buffer.concat(chunks);
  assert.deepEqual([...png.subarray(0, 8)], [137,80,78,71,13,10,26,10], 'QR UI downloads a genuine PNG');
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.ok(download.suggestedFilename().endsWith('.png'));
  assert.deepEqual(await page.locator('canvas[aria-label^="QR code for"]')
    .evaluate(canvas => [...canvas.getContext('2d').getImageData(0, 0, 1, 1).data]), [255,255,255,255], 'Displayed QR preserves an opaque white quiet zone');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  try {
    await assertReachableControl(downloadButton, 'Download QR image outside the Forms workspace');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await capture('qr-download-text-200');
  } finally {
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  }
}
