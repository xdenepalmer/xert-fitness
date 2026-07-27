import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('native acquisition forms keep validation and submit reachable above phone chrome', async () => {
  const explore = await read(
    '../ios/XertFitnessApp/XertFitnessApp/Views/ExploreView.swift',
  )
  const start = explore.indexOf('private struct NativeInterestFormView: View')
  const end = explore.indexOf('private struct NativeMultiSelect: View', start)
  const form = explore.slice(start, end)

  assert.ok(start >= 0 && end > start)
  assert.match(form, /Form \{[\s\S]*XertScrollEndSpacer\(\)/)
  assert.match(form, /\.scrollDismissesKeyboard\(\.interactively\)/)
  assert.match(
    form,
    /\.safeAreaInset\(edge: \.bottom, spacing: 0\) \{[\s\S]*interestSubmitBar/,
  )
  assert.match(form, /private var interestSubmitBar: some View/)
  assert.match(form, /Button\(action: submit\)/)
  assert.match(form, /accessibilityIdentifier\("interest\.submit"\)/)
  assert.match(form, /attemptedSubmit && validationMessage != nil/)
  assert.match(form, /Text\(store\.isSubmittingInterest \? "Submitting\.\.\." : "Submit \\\(kind\.title\)"\)/)
})

test('native Explore detail pages scroll their final content above the persistent dock', async () => {
  const explore = await read(
    '../ios/XertFitnessApp/XertFitnessApp/Views/ExploreView.swift',
  )
  const coachStart = explore.indexOf('private struct CoachProfileView: View')
  const coachEnd = explore.indexOf('private struct CoachPhoto: View', coachStart)
  const guideStart = explore.indexOf('private struct TrainingGuideDetailView: View')
  const coach = explore.slice(coachStart, coachEnd)
  const guide = explore.slice(guideStart)

  assert.ok(coachStart >= 0 && coachEnd > coachStart)
  assert.ok(guideStart >= 0)
  assert.match(coach, /\.padding\(\.bottom, XertScreenLayout\.scrollEndClearance\)/)
  assert.match(guide, /\.padding\(\.bottom, XertScreenLayout\.scrollEndClearance\)/)
})
