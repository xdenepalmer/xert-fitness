import assert from 'node:assert/strict';

export async function assertReachableControl(control, label) {
  await control.scrollIntoViewIfNeeded();
  const geometry = await control.evaluate(element => {
    const box = element.getBoundingClientRect();
    const visible = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        visible.left = Math.max(visible.left, bounds.left);
        visible.right = Math.min(visible.right, bounds.right);
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        visible.top = Math.max(visible.top, bounds.top);
        visible.bottom = Math.min(visible.bottom, bounds.bottom);
      }
    }
    const splitWords = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode;
      for (const match of text.textContent.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(text, match.index);
        range.setEnd(text, match.index + match[0].length);
        if (range.getClientRects().length > 1) splitWords.push(match[0]);
      }
    }
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, visible, splitWords };
  });
  assert.ok(geometry.width >= 44 && geometry.height >= 44, `${label} retains a 44px target: ${JSON.stringify(geometry)}`);
  assert.deepEqual(geometry.splitWords, [], `${label} does not split short action words across lines`);
  assert.ok(geometry.left >= geometry.visible.left - 2 && geometry.right <= geometry.visible.right + 2
    && geometry.top >= geometry.visible.top - 2 && geometry.bottom <= geometry.visible.bottom + 2,
  `${label} can be scrolled fully into view at 200% text: ${JSON.stringify(geometry)}`);
}
