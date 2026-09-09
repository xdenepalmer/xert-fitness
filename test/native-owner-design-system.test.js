import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveTokens } from '../scripts/build-tokens.mjs';

const app = path => new URL(`../ios/XertFitnessApp/XertFitnessApp/${path}`, import.meta.url);
const read = path => readFile(app(path), 'utf8');

const MEMBER_VIEWS = [
  'Views/AccountView.swift',
  'Views/BookingView.swift',
  'Views/ExploreView.swift',
  'Views/HomeView.swift',
  'Views/MemberOnboardingView.swift',
  'Views/EventsView.swift',
];

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
  assert.match(design, /static let lg: CGFloat = XertTokens.spaceRowComfortable/, 'gutters consume the generated scale');
  const tokens = resolveTokens(JSON.parse(await readFile(new URL('../design/tokens.json', import.meta.url), 'utf8')));
  assert.equal(tokens['semantics.space.row-comfortable'], '1rem', '16pt remains the generated card and gutter workhorse');
  assert.match(await read('Generated/XertTokens.swift'), /static let spaceRowComfortable: CGFloat = 16/);
  for (const primitive of ['XertOwnerHeading', 'XertOwnerRow', 'XertOwnerEmptyState']) {
    assert.match(design, new RegExp(`struct ${primitive}: View`));
  }
  for (const modifier of ['xertOwnerScreen', 'xertOwnerContentPadding', 'xertOwnerCard']) {
    assert.match(design, new RegExp(`func ${modifier}\\(`));
  }
});

test('native vocabulary uses semantic controls, adaptive type and existing haptic service', async () => {
  const design = await read('AdminDesignSystem.swift');
  const controls = await read('XertDesignControls.swift');
  for (const primitive of ['XertCard', 'XertSurface', 'XertHairline', 'XertBadge', 'XertStat', 'XertEmptyState', 'XertSkeleton', 'XertInlineError']) assert.match(design, new RegExp(`struct ${primitive}(?:<|:)`));
  for (const control of ['XertButton', 'XertField', 'XertSegmented', 'XertToggleRow', 'XertMenuField']) assert.match(controls, new RegExp(`struct ${control}(?:<|:)`));
  assert.match(design, /@ScaledMetric/);
  assert.match(design, /accessibilityReduceMotion/);
  assert.match(design, /accessibilityReduceTransparency/);
  assert.match(controls, /Picker\(/);
  assert.match(controls, /Toggle\(/);
  assert.match(controls, /XertHaptics.play/);
  assert.doesNotMatch(design + controls, /Color\(red:|\.shadow\(|\.frame\(height: 44\)|\.lineLimit\(1\)/);
  assert.match(design, /XertOwnerHeading[\s\S]*XertSectionHeading\(title\)/);
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

test('the command centre home leads with the shift, not the dashboard', async () => {
  const view = await read('Views/AdminCommandCentreView.swift');
  const dashboard = view.slice(
    view.indexOf('private func dashboard('),
    view.indexOf('private var ownerRunNextDock'),
  );

  // The class about to run is the first thing on the screen; revenue is the
  // last. Anything else means the owner scrolls past dashboards mid-shift.
  const order = ['nextClassFocus', 'priorityQueue', 'attentionGrid', 'quickTools',
                 'pinnedDirectory', 'managementDirectory', 'businessPulse'];
  const positions = order.map(section => dashboard.indexOf(section));
  positions.forEach((position, index) => {
    assert.notEqual(position, -1, `${order[index]} must still be on the home screen`);
  });
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `home sections must read ${order.join(' → ')}`);

  // Both closing sections stay collapsed so navigation is reachable without
  // scrolling through review material.
  assert.match(view, /@State private var showingBusinessPulse = false/);
  assert.match(view, /@State private var expandedHub: XertOwnerWorkspaceSection?/);
  assert.match(view, /if showingBusinessPulse \{[\s\S]{0,200}LazyVGrid/);
});

test('member screens follow the same card and backdrop rules as owner screens', async () => {
  for (const view of MEMBER_VIEWS) {
    const source = await read(view);
    assert.equal(
      source.split('.background(Color.xertNavy)').length - 1,
      0,
      `${view} must use the shared backdrop (xertScreenBackground/xertListBackground), not flat navy`,
    );
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (!lines[index + 1]?.includes('.xertCardStyle()')) return;
      const trimmed = line.trim();
      if (!trimmed.startsWith('.padding(')) return;
      assert.match(trimmed, /XertSpace\./, `${view}:${index + 1} pads a card with a raw value; use the XertSpace scale`);
    });
  }
});
