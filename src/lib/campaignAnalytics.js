const BRISBANE_TIME_ZONE = 'Australia/Brisbane';

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: BRISBANE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDateKey(key, amount) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function cleanLabel(value) {
  const label = String(value || '').trim().replace(/\s+/g, ' ');
  return label || null;
}

function countLabels(rows, resolveLabel, fallback = null) {
  const counts = new Map();
  rows.forEach(row => {
    const label = cleanLabel(resolveLabel(row)) || fallback;
    if (!label) return;
    const key = label.toLocaleLowerCase('en-AU');
    const current = counts.get(key) || { label, count: 0 };
    current.count += 1;
    counts.set(key, current);
  });
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en-AU'));
}

export function filterCampaignRows(rows = [], { days = '30', now = new Date() } = {}) {
  const boundedRows = Array.isArray(rows) ? rows.filter(row => dateKey(row?.created_at)) : [];
  if (days === 'all') return boundedRows;
  const count = Number(days);
  if (!Number.isInteger(count) || count < 1 || count > 3660) throw new Error('Choose a valid campaign reporting range.');
  const cutoff = shiftDateKey(dateKey(now), -(count - 1));
  return boundedRows.filter(row => dateKey(row.created_at) >= cutoff);
}

export function summarizeCampaignAttribution(rows = [], options = {}) {
  const filteredRows = filterCampaignRows(rows, options);
  const attributed = filteredRows.filter(row => cleanLabel(row.utm_source) || cleanLabel(row.utm_medium) || cleanLabel(row.utm_campaign)).length;
  const sources = countLabels(filteredRows, row => row.utm_source || row.source, 'Direct / unknown');
  const mediums = countLabels(filteredRows, row => row.utm_medium, 'Unspecified');
  const campaigns = countLabels(filteredRows, row => row.utm_campaign);

  const referenceKey = dateKey(options.now || new Date());
  const dailyKeys = Array.from({ length: 30 }, (_, index) => shiftDateKey(referenceKey, index - 29));
  const dailyCounts = new Map(dailyKeys.map(key => [key, 0]));
  filteredRows.forEach(row => {
    const key = dateKey(row.created_at);
    if (dailyCounts.has(key)) dailyCounts.set(key, dailyCounts.get(key) + 1);
  });

  return {
    rows: filteredRows,
    total: filteredRows.length,
    attributed,
    direct: filteredRows.length - attributed,
    attributionRate: filteredRows.length ? attributed / filteredRows.length : 0,
    sources,
    mediums,
    campaigns,
    dailySignups: dailyKeys.map(key => ({ date: key, count: dailyCounts.get(key) || 0 })),
  };
}

export function campaignCsvRows(rows = []) {
  return rows
    .filter(row => dateKey(row?.created_at))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(row => ({
      created_at: row.created_at,
      brisbane_date: dateKey(row.created_at),
      source: cleanLabel(row.utm_source || row.source) || 'Direct / unknown',
      medium: cleanLabel(row.utm_medium) || '',
      campaign: cleanLabel(row.utm_campaign) || '',
      recorded_source: cleanLabel(row.source) || '',
    }));
}
