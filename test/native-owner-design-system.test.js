import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = path => new URL(`../ios/XertFitnessApp/XertFitnessApp/${path}`, import.meta.url);
const read = path => readFile(app(path), 'utf8');

const OWNER_VIEWS = [
  'Views/AdminCommandCentreView.swift',
  'Views/AdminFormsView.swift',
  'Views/AdminFormResponseView.swift',
  'Views/AdminSmsView.swift',
  'Views/AdminWorkoutOfDayView.swift',
  'Views/AdminClassRepeatView.swift',
];

test('the owner design system defines one spacing scale and the shared primitives', async () => {
  const design = await read('AdminDesignSystem.swift');
  assert.match(design, /enum XertSpace/);
  for (const step of ['hairline', 'xs', 'sm', 'md', 'lg', 'xl', 'section']) {
    assert.match(design, new RegExp(`static let ${step}: CGFloat`), `${step} must be on the scale`);
  }
  assert.match(design, /static let lg: CGFloat = 16/, '16 is the card and gutter workhorse');
  for (const primitive of ['XertOwnerHeading', 'XertOwnerRow', 'XertOwnerEmptyState']) {
    assert.match(design, new RegExp(`struct ${primitive}: View`));
  }
  for (const modifier of ['xertOwnerScreen', 'xertOwnerContentPadding', 'xertOwnerCard']) {
    assert.match(design, new RegExp(`func ${modifier}\\(`));
  }
});

test('every owner screen sits on the shared backdrop instead of flat navy', async () => {
  // Element fills — avatar tiles and text-field backgrounds — may stay flat.
  // Whole screens must not, or workspaces read as separate apps again.
  const ELEMENT_LEVEL_FILLS = 4;
  let flatFills = 0;
  for (const view of OWNER_VIEWS) {
    const source = await read(view);
    flatFills += source.split('.background(Color.xertNavy)').length - 1;
  }
  assert.equal(
    flatFills,
    ELEMENT_LEVEL_FILLS,
    'a screen used a flat navy fill; call xertOwnerScreen() instead',
  );
  const centre = await read('Views/AdminCommandCentreView.swift');
  assert.ok(centre.includes('.xertOwnerScreen()'), 'the command centre adopts the shared backdrop');
});

test('branded cards are padded from the scale, never a raw number', async () => {
  for (const view of OWNER_VIEWS) {
    const lines = (await read(view)).split('\n');
    lines.forEach((line, index) => {
      if (!lines[index + 1]?.includes('.xertCardStyle()')) return;
      const trimmed = line.trim();
      if (!trimmed.startsWith('.padding(')) return;
      assert.match(
        trimmed,
        /XertSpace\./,
        `${view}:${index + 1} pads a card with a raw value; use the XertSpace scale`,
      );
    });
  }
});

test('the command centre primitives delegate to the system rather than re-implementing it', async () => {
  const centre = await read('Views/AdminCommandCentreView.swift');
  assert.match(centre, /private struct AdminDestinationRow: View[\s\S]{0,400}XertOwnerRow\(/);
  assert.match(centre, /private struct AdminEmptyState: View[\s\S]{0,300}XertOwnerEmptyState\(/);
  assert.match(centre, /private func adminHeading\(_ title: String\)[\s\S]{0,200}XertOwnerHeading\(title\)/);

  const sms = await read('Views/AdminSmsView.swift');
  assert.ok(!sms.includes('adminSmsHeading'), 'the SMS screen uses the shared heading, not a private copy');
  assert.match(sms, /XertOwnerHeading\(/);
});
