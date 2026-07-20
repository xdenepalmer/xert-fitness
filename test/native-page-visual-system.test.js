import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('every primary native tab opens with an image-led XERT identity', async () => {
  const [theme, home, booking, events, account] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Theme.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/EventsView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift'),
  ]);

  assert.match(theme, /struct XertPageHero/);
  assert.match(theme, /Image\(imageName\)/);
  assert.match(theme, /XertLogoHeader\(height: 24\)/);
  assert.match(home, /Image\("HeroTraining"\)/);
  assert.match(booking, /imageName: "BookHero"[\s\S]*Train\. Book\. Repeat\./);
  assert.match(events, /imageName: "EventsHero"[\s\S]*Compete Together\./);
  assert.match(account, /imageName: "AccountHero"[\s\S]*Your XERT\./);
});

test('feature heroes retain the real native workflows underneath', async () => {
  const [booking, events, account] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/EventsView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift'),
  ]);

  assert.match(booking, /XertPageHero[\s\S]*creditsSection[\s\S]*packsSection[\s\S]*classDiscoverySection[\s\S]*classesSection/);
  assert.match(booking, /\.searchable\([\s\S]*Class, coach or location/);
  assert.match(events, /XertPageHero[\s\S]*Your Training Goals[\s\S]*Calendar range/);
  assert.match(events, /Add to Calendar/);
  assert.match(account, /XertPageHero[\s\S]*signedInSections[\s\S]*signedOutSections/);
  assert.match(account, /credits, bookings, training goals and account controls/);
});

test('all native photographic headers are bundled in the asset catalogue', async () => {
  const assets = [
    ['HeroTraining', 'hero-training.jpg'],
    ['BookHero', 'book-hero.jpg'],
    ['EventsHero', 'events-hero.jpg'],
    ['AccountHero', 'account-hero.jpg'],
  ];
  for (const [set, filename] of assets) {
    const base = `../ios/XertFitnessApp/XertFitnessApp/Assets.xcassets/${set}.imageset/`;
    const contents = JSON.parse(await read(`${base}Contents.json`));
    assert.equal(contents.images[0].filename, filename);
    await access(new URL(`${base}${filename}`, import.meta.url));
  }
});

test('native chrome uses advanced surfaces without rebuilding decorative navigation canvas', async () => {
  const [theme, root] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Theme.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift'),
  ]);

  assert.match(theme, /backgroundEffect = UIBlurEffect\(style: \.systemChromeMaterialDark\)/);
  assert.match(theme, /Canvas\(opaque: false, colorMode: \.linear, rendersAsynchronously: true\)/);
  assert.match(theme, /func xertCardStyle\(\)[\s\S]*LinearGradient/);
  assert.match(root, /private struct XertNavigationDock: View[\s\S]*RoundedRectangle\(cornerRadius: 18, style: \.continuous\)/);
  assert.match(root, /matchedGeometryEffect\(id: "primary-navigation-selection"/);
  assert.doesNotMatch(root, /let width = size\.width \/ CGFloat\(items\.count\)/);
});

test('shared native controls expose disabled state and honor Reduce Motion', async () => {
  const theme = await read('../ios/XertFitnessApp/XertFitnessApp/Theme.swift');

  assert.ok((theme.match(/@Environment\(\\\.isEnabled\) private var isEnabled/g) || []).length >= 2);
  assert.ok((theme.match(/@Environment\(\\\.accessibilityReduceMotion\) private var reduceMotion/g) || []).length >= 2);
  assert.match(theme, /\.opacity\(isEnabled \? 1 : 0\.46\)/);
  assert.match(theme, /scaleEffect\(!reduceMotion && isEnabled && configuration\.isPressed/);
  assert.match(theme, /animation\(reduceMotion \? nil : \.easeOut/);
});
