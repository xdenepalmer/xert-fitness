import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { campaignCsvRows, filterCampaignRows, summarizeCampaignAttribution } from '../src/lib/campaignAnalytics.js';

const NOW = new Date('2026-07-13T02:00:00.000Z');
const rows = [
  { id: '1', created_at: '2026-07-12T15:30:00.000Z', utm_source: 'Facebook', utm_medium: 'Paid Social', utm_campaign: 'Winter Push', source: 'website' },
  { id: '2', created_at: '2026-07-13T01:00:00.000Z', utm_source: ' facebook ', utm_medium: 'paid social', utm_campaign: 'Winter Push', source: 'website' },
  { id: '3', created_at: '2026-07-01T00:00:00.000Z', utm_source: null, utm_medium: null, utm_campaign: null, source: 'Website' },
  { id: '4', created_at: '2026-05-01T00:00:00.000Z', utm_source: 'Instagram', utm_medium: 'organic', utm_campaign: null, source: 'website' },
  { id: 'bad', created_at: 'not-a-date', utm_source: 'Bad data' },
];

test('summarizes complete campaign attribution in Brisbane reporting days', () => {
  const summary = summarizeCampaignAttribution(rows, { days: '30', now: NOW });

  assert.equal(summary.total, 3);
  assert.equal(summary.attributed, 2);
  assert.equal(summary.direct, 1);
  assert.equal(summary.attributionRate, 2 / 3);
  assert.deepEqual(summary.sources.slice(0, 2), [
    { label: 'Facebook', count: 2 },
    { label: 'Website', count: 1 },
  ]);
  assert.deepEqual(summary.mediums.slice(0, 2), [
    { label: 'Paid Social', count: 2 },
    { label: 'Unspecified', count: 1 },
  ]);
  assert.equal(summary.campaigns[0].count, 2);
  assert.equal(summary.dailySignups.find(day => day.date === '2026-07-13').count, 2);
});

test('supports all-time filtering and exports attribution without member PII', () => {
  assert.equal(filterCampaignRows(rows, { days: 'all', now: NOW }).length, 4);
  assert.throws(() => filterCampaignRows(rows, { days: 'invalid', now: NOW }), /valid campaign reporting range/i);

  const exported = campaignCsvRows(rows);
  assert.equal(exported.length, 4);
  assert.equal(exported[0].brisbane_date, '2026-07-13');
  assert.deepEqual(Object.keys(exported[0]), ['created_at', 'brisbane_date', 'source', 'medium', 'campaign', 'recorded_source']);
});

test('campaign admin query pages through the complete deterministic lead set', async () => {
  const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function getCampaignAttributionRows');
  const end = source.indexOf('export async function updateLeadStatus', start);
  const query = source.slice(start, end);

  assert.match(query, /collectAdminPages/);
  assert.match(query, /count:\s*'exact'/);
  assert.match(query, /\.order\('created_at',[\s\S]*\.order\('id'/);
  assert.match(query, /\.range\(from, from \+ pageSize - 1\)/);
  assert.doesNotMatch(query, /full_name|email|phone/);
});
