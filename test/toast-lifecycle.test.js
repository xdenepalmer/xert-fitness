import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shared toasts use Radix lifecycle controls and bounded cleanup', async () => {
  const [toast, toaster, state] = await Promise.all([
    readFile(new URL('../src/components/ui/toast.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/toaster.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/use-toast.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(toast, /import \* as ToastPrimitives from "@radix-ui\/react-toast"/);
  assert.match(toast, /<ToastPrimitives\.Root/);
  assert.match(toast, /<ToastPrimitives\.Close/);
  assert.match(toaster, /<ToastProvider duration=\{5000\}>/);
  assert.match(state, /const TOAST_LIMIT = 5;/);
  assert.match(state, /const TOAST_REMOVE_DELAY = 1000;/);
});
