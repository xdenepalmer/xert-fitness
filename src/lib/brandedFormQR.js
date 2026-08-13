export const FORM_QR_SIZE = 1024;
export const FORM_QR_LOGO_PATH = '/assets/xert-logo-icon.png';

function loadSameOriginImage(path) {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('The XERT QR logo must be loaded from this site.');
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The XERT logo could not be added to the QR code.'));
    image.src = url.href;
  });
}

function roundRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

/**
 * Creates a high-resolution, fully local QR with enough redundancy and a
 * protected centre pad for the XERT mark. The logo stays below 18% of the QR.
 */
export async function renderBrandedFormQR(canvas, publicURL, size = FORM_QR_SIZE) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('A canvas is required to create a form QR code.');
  const resolvedURL = new URL(publicURL);
  if (!['http:', 'https:'].includes(resolvedURL.protocol)) throw new Error('The public form link is not valid.');

  // The encoder is only needed after an owner opens a particular form, so
  // keep it out of the Forms workspace's first-load bundle.
  const { default: QRCode } = await import('qrcode');
  await QRCode.toCanvas(canvas, resolvedURL.href, {
    width: size,
    margin: 4,
    errorCorrectionLevel: 'H',
    color: { dark: '#101820', light: '#ffffff' },
  });

  const logo = await loadSameOriginImage(FORM_QR_LOGO_PATH);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the QR image.');
  const actualSize = canvas.width;
  const padSize = Math.round(actualSize * 0.22);
  const logoSize = Math.round(actualSize * 0.18);
  const padOffset = Math.round((actualSize - padSize) / 2);
  const logoOffset = Math.round((actualSize - logoSize) / 2);

  context.save();
  context.fillStyle = '#ffffff';
  roundRect(context, padOffset, padOffset, padSize, padSize, Math.round(actualSize * 0.018));
  context.fill();
  context.drawImage(logo, logoOffset, logoOffset, logoSize, logoSize);
  context.restore();
  return canvas;
}

export function qrCanvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The QR image could not be prepared.')), 'image/png');
  });
}

export function formQRFilename(form) {
  const stem = String(form?.slug || form?.title || 'xert-form')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'xert-form';
  return `${stem}-xert-qr.png`;
}
