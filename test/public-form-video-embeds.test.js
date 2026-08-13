import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicFormSource = await readFile(new URL('../src/pages/PublicForm.jsx', import.meta.url), 'utf8');
const helperStart = publicFormSource.indexOf('function safeURL');
const helperEnd = publicFormSource.indexOf('function Media');
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'public form video URL helpers must remain before Media');

// Evaluate the exact dependency-free helpers used by the JSX without needing a
// browser DOM or maintaining a duplicate parser in the test.
const helperSource = publicFormSource.slice(helperStart, helperEnd);
const { formVideoEmbedURL } = Function(
  'URL',
  `"use strict"; ${helperSource}; return { formVideoEmbedURL };`,
)(URL);

test('public form video URLs resolve only to fixed privacy-oriented embed origins', () => {
  assert.equal(
    formVideoEmbedURL('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=43s'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  );
  assert.equal(
    formVideoEmbedURL('https://youtu.be/dQw4w9WgXcQ?si=share-token'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  );
  assert.equal(
    formVideoEmbedURL('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  );
  assert.equal(
    formVideoEmbedURL('https://vimeo.com/76979871'),
    'https://player.vimeo.com/video/76979871',
  );
});

test('lookalike, malformed and unsupported video URLs never become iframes', () => {
  for (const value of [
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=not-a-valid-id',
    'https://vimeo.com.evil.example/76979871',
    'https://vimeo.com/channels/staffpicks',
    'https://example.com/video/76979871',
    'javascript:alert(1)',
  ]) assert.equal(formVideoEmbedURL(value), null, value);

  assert.match(publicFormSource, /type === 'video' && !embedURL/);
  assert.match(publicFormSource, /href=\{safe\.toString\(\)\}/);
  assert.match(publicFormSource, /rel="noopener noreferrer"/);
});

test('Vercel CSP permits exactly the supported video players alongside maps', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const policy = config.headers[0].headers.find(header => header.key === 'Content-Security-Policy')?.value || '';
  const frameSources = policy.match(/(?:^|; )frame-src ([^;]+)/)?.[1]?.split(/\s+/) || [];

  assert.deepEqual(frameSources, [
    'https://www.openstreetmap.org',
    'https://www.youtube-nocookie.com',
    'https://player.vimeo.com',
  ]);
  assert.doesNotMatch(policy, /frame-src[^;]*https:\/\/(?:www\.)?youtube\.com(?:[\s;]|$)/);
  assert.doesNotMatch(policy, /frame-src[^;]*\*/);
});
