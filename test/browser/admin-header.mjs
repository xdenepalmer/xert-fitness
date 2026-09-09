import assert from 'node:assert/strict';

export async function checkAdminHeaderLayout(page) {
  const header = page.locator('[data-admin-workspace] > header');
  const overlaps = await header.evaluate(element => {
    const buttons = [...element.querySelectorAll('button')].filter(button => !button.closest('[role="tablist"]') && button.checkVisibility({ visibilityProperty: true }));
    const heading = element.querySelector('h1');
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const overlaps = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const box = parent.getBoundingClientRect();
        if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) {
          clip.left = Math.max(clip.left, box.left); clip.right = Math.min(clip.right, box.right);
        }
        if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) {
          clip.top = Math.max(clip.top, box.top); clip.bottom = Math.min(clip.bottom, box.bottom);
        }
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const bounds of range.getClientRects()) {
        const text = { left: Math.max(bounds.left, clip.left), right: Math.min(bounds.right, clip.right), top: Math.max(bounds.top, clip.top), bottom: Math.min(bounds.bottom, clip.bottom) };
        if (text.right <= text.left || text.bottom <= text.top) continue;
        for (const button of buttons) {
          const box = button.getBoundingClientRect();
          if (Math.min(text.right, box.right) - Math.max(text.left, box.left) > 1
            && Math.min(text.bottom, box.bottom) - Math.max(text.top, box.top) > 1) overlaps.push({ text: node.textContent.trim(), control: button.getAttribute('aria-label'), textBounds: text });
        }
      }
    }
    return overlaps;
  });
  assert.deepEqual(overlaps, [], 'Visible workspace heading text must not overlap header controls');
}
