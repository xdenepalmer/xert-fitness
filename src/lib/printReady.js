function settleImage(image) {
  if (typeof image?.decode === 'function') {
    // decode() resolves only once the browser can paint the image. Rejections
    // are intentionally settled by Promise.allSettled at the collection level
    // so a broken historical signature cannot prevent the rest of the record
    // from being printed.
    return image.decode();
  }

  if (image?.complete) return Promise.resolve();

  return new Promise(resolve => {
    image?.addEventListener?.('load', resolve, { once: true });
    image?.addEventListener?.('error', resolve, { once: true });
  });
}

/** Wait until every image in a printable region is decoded or has failed. */
export function waitForPrintableImages(root) {
  const images = Array.from(root?.querySelectorAll?.('img') || []);
  return Promise.allSettled(images.map(settleImage));
}
