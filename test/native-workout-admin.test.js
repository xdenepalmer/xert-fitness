import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native owner navigation exposes Workout of the Day as a real workspace', async () => {
  const [navigation, commandCentre] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  assert.match(navigation, /case workouts/);
  assert.match(navigation, /case \.workouts: return "Workout of the Day"/);
  assert.match(navigation, /case \.workouts: return "tv"/);
  assert.match(navigation, /\.members, \.classDesk, \.workouts, \.bookingRequests/);
  assert.match(commandCentre, /case \.workouts:\s+AdminWorkoutOfDayView\(session: session\)/);
});

test('native workout model and API preserve Brisbane dates, bounds and publish history', async () => {
  const [models, api] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
  ]);

  assert.match(models, /struct AdminWorkoutOfDay: Identifiable, Codable, Hashable/);
  assert.match(models, /titleLimit = 120/);
  assert.match(models, /bodyLimit = 4_000/);
  assert.match(models, /TimeZone\(identifier: "Australia\/Brisbane"\)/);
  assert.match(models, /struct AdminWorkoutOfDayDraft: Equatable/);
  assert.match(models, /var validationMessage: String\?/);

  assert.match(api, /func adminWorkouts\(/);
  assert.match(api, /func adminWorkout\(/);
  assert.match(api, /func adminSaveWorkout\(/);
  assert.match(api, /func adminUpsertWorkout\(/);
  assert.match(api, /path: "\/rest\/v1\/workouts_of_the_day"/);
  assert.match(api, /if let existing[\s\S]*URLQueryItem\(name: "workout_date", value: "eq\.\\\(draft\.dateKey\)"\)[\s\S]*URLQueryItem\(name: "updated_at", value: "eq\.\\\(existing\.updated_at\)"\)[\s\S]*request\.httpMethod = "PATCH"/);
  assert.match(api, /else \{[\s\S]*path: "\/rest\/v1\/workouts_of_the_day"[\s\S]*request\.httpMethod = "POST"/);
  assert.doesNotMatch(api, /on_conflict[^\n]*workout_date|resolution=merge-duplicates/);
  assert.match(api, /encodeNil\(forKey: \.title\)[\s\S]*encodeNil\(forKey: \.published_at\)/);
  assert.match(api, /existing\?\.published_at\.map/);
  assert.match(api, /existing\?\.updated_at == draft\.sourceUpdatedAt/);
});

test('native workout editor supports daily drafting, TV preview and safe exits', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminWorkoutOfDayView.swift');

  assert.match(view, /struct AdminWorkoutOfDayView: View/);
  assert.match(view, /DatePicker\(/);
  assert.match(view, /AppConfig\.webURL\(path: "display"\)/);
  assert.match(view, /TextEditor\(text: \$draft\.body\)/);
  assert.match(view, /Show on the club TV/);
  assert.match(view, /RECENT WORKOUTS/);
  assert.match(view, /await api\.adminSaveWorkout/);
  assert.match(view, /\.adminOwnerExitState\(/);
  assert.match(view, /Discard unsaved workout edits\?/);
  assert.match(view, /XertHaptics\.play\(\.success\)/);
});
