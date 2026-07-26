import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getCampaignAttributionRows } from '@/lib/adminData';
import { campaignCsvRows, summarizeCampaignAttribution } from '@/lib/campaignAnalytics';
import { downloadCsv } from '@/lib/csv';
import AdminLoadError from '@/components/admin/AdminLoadError';

const RANGE_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

function Breakdown({ title, items, total, emptyText }) {
  const headingId = `campaign-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
  return (
    <section className="bg-xert-ink border border-xert-steel/20 p-5" aria-labelledby={headingId}>
      <h3 id={headingId} className="font-display text-sm text-xert-concrete/50 uppercase tracking-wider mb-4">{title}</h3>
      {items.length === 0 ? (
        <p className="font-body text-sm text-xert-concrete/40">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {items.slice(0, 8).map(item => (
            <div key={item.label} className="flex items-center justify-between gap-4">
              <span className="font-body text-sm text-xert-offwhite min-w-0 truncate" title={item.label}>{item.label}</span>
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-20 h-1.5 bg-xert-steel/20 overflow-hidden" aria-hidden="true">
                  <div className="h-full bg-xert-steel" style={{ width: `${Math.min(100, (item.count / Math.max(total, 1)) * 100)}%` }} />
                </div>
                <span className="font-display text-sm text-xert-concrete/70 tabular-nums w-8 text-right">{item.count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function CampaignStats() {
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState('30');
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const loadVersion = useRef(0);

  const load = async () => {
    const version = loadVersion.current + 1;
    loadVersion.current = version;
    setLoading(true);
    setLoadError('');
    try {
      const nextRows = await getCampaignAttributionRows();
      if (version !== loadVersion.current) return;
      setRows(nextRows);
      setUpdatedAt(new Date());
      setHasLoaded(true);
    } catch (error) {
      if (version !== loadVersion.current) return;
      const message = error.message || 'Check the member interest table and admin permissions.';
      if (!hasLoaded) setLoadError(message);
      toast({ title: 'Campaign data unavailable', description: message, variant: 'destructive' });
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    return () => { loadVersion.current += 1; };
  }, []);

  const data = useMemo(() => summarizeCampaignAttribution(rows, { days: range }), [range, rows]);
  const chartMaximum = Math.max(...data.dailySignups.map(day => day.count), 1);
  const rangeLabel = RANGE_OPTIONS.find(option => option.value === range)?.label || 'Selected range';
  const attributionRate = new Intl.NumberFormat('en-AU', { style: 'percent', maximumFractionDigits: 0 }).format(data.attributionRate);

  const exportRows = () => downloadCsv(
    `xert-campaign-attribution-${range}-${new Date().toISOString().slice(0, 10)}.csv`,
    campaignCsvRows(data.rows),
    [
      { key: 'created_at', label: 'Created' },
      { key: 'brisbane_date', label: 'Brisbane Date' },
      { key: 'source', label: 'Attributed Source' },
      { key: 'medium', label: 'UTM Medium' },
      { key: 'campaign', label: 'UTM Campaign' },
      { key: 'recorded_source', label: 'Recorded Form Source' },
    ]
  );

  if (!hasLoaded && loading) return <div className="p-6"><div className="h-40 bg-xert-ink animate-pulse" /></div>;
  if (!hasLoaded && loadError) return <div className="p-6"><AdminLoadError message={loadError} onRetry={load} /></div>;

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg text-xert-offwhite uppercase">Campaign Attribution</h2>
          <p className="font-body text-xs text-xert-concrete/40 mt-1">
            Complete member-interest attribution in Australia/Brisbane time
            {updatedAt ? ` · refreshed ${updatedAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={range} onChange={event => setRange(event.target.value)} aria-label="Campaign reporting range"
            className="min-h-11 bg-xert-ink border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite">
            {RANGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" onClick={exportRows} disabled={loading || data.total === 0}
            className="min-h-11 inline-flex items-center gap-1.5 px-3 py-2 border border-xert-steel/40 font-body text-xs text-xert-concrete/70 uppercase tracking-wider hover:border-xert-steel disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button type="button" onClick={() => void load()} disabled={loading} title="Refresh campaign attribution" aria-label="Refresh campaign attribution"
            className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: `Leads · ${rangeLabel}`, value: data.total },
          { label: 'UTM attributed', value: data.attributed },
          { label: 'Direct / unknown', value: data.direct },
          { label: 'Attribution rate', value: attributionRate },
        ].map(metric => (
          <div key={metric.label} className="bg-xert-ink border border-xert-steel/20 p-4">
            <p className="font-display text-2xl text-xert-offwhite tabular-nums">{metric.value}</p>
            <p className="font-body text-xs text-xert-concrete/40 uppercase tracking-wider mt-1">{metric.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Breakdown title="Traffic Sources" items={data.sources} total={data.total} emptyText="No source data in this range." />
        <Breakdown title="Campaigns" items={data.campaigns} total={data.total} emptyText="No UTM campaigns in this range." />
        <Breakdown title="Channels / Mediums" items={data.mediums} total={data.total} emptyText="No channel data in this range." />
      </div>

      <section className="bg-xert-ink border border-xert-steel/20 p-5" aria-labelledby="campaign-daily-signups">
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <h3 id="campaign-daily-signups" className="font-display text-sm text-xert-concrete/50 uppercase tracking-wider">Daily Signups</h3>
          <span className="font-body text-xs text-xert-concrete/35">Latest 30 Queensland days</span>
        </div>
        <div role="list" aria-label="Daily member interest signups for the latest 30 Queensland days" className="overflow-x-auto pb-1">
          <div className="grid h-40 min-w-[620px] items-end gap-1 border-b border-xert-steel/20" style={{ gridTemplateColumns: `repeat(${data.dailySignups.length}, minmax(14px, 1fr))` }}>
            {data.dailySignups.map((day, index) => (
              <div key={day.date} role="listitem" aria-label={`${day.date}: ${day.count} signup${day.count === 1 ? '' : 's'}`} className="h-full flex flex-col justify-end items-center gap-1 group">
                <span className="font-body text-[10px] text-xert-concrete/0 group-hover:text-xert-concrete/60 tabular-nums">{day.count || ''}</span>
                <div className="w-full min-h-px bg-xert-steel/70 hover:bg-xert-steel transition-colors"
                  style={{ height: `${Math.max(day.count ? 5 : 1, (day.count / chartMaximum) * 110)}px` }}
                  title={`${day.date}: ${day.count} signup${day.count === 1 ? '' : 's'}`}
                  aria-hidden="true" />
                {(index % 5 === 0 || index === data.dailySignups.length - 1) ? (
                  <span className="font-body text-[9px] text-xert-concrete/35 whitespace-nowrap">{day.date.slice(5)}</span>
                ) : <span className="h-3" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
