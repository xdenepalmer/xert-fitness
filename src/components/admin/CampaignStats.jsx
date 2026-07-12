import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AdminLoadError from '@/components/admin/AdminLoadError';

export default function CampaignStats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data: members, error } = await supabase.from('member_interest').select('utm_source, utm_medium, utm_campaign, source, created_at');
      if (error) throw error;
      
      const sourceCounts = {};
      const campaignCounts = {};
      const mediumCounts = {};
      const weeklySignups = {};

      (members || []).forEach(m => {
        const src = m.utm_source || m.source || 'direct';
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;

        if (m.utm_campaign) campaignCounts[m.utm_campaign] = (campaignCounts[m.utm_campaign] || 0) + 1;
        if (m.utm_medium) mediumCounts[m.utm_medium] = (mediumCounts[m.utm_medium] || 0) + 1;

        const week = new Date(m.created_at).toISOString().slice(0, 10);
        weeklySignups[week] = (weeklySignups[week] || 0) + 1;
      });

      setData({
        sources: Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
        campaigns: Object.entries(campaignCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
        mediums: Object.entries(mediumCounts).sort((a, b) => b[1] - a[1]),
        weeklySignups: Object.entries(weeklySignups).sort().slice(-14),
        total: (members || []).length,
      });
    } catch (error) {
      setLoadError(error.message || 'Check the member interest table and admin permissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="p-6"><div className="h-40 bg-xert-ink animate-pulse" /></div>;
  if (loadError) return <div className="p-6"><AdminLoadError message={loadError} onRetry={load} /></div>;

  return (
    <div className="p-6 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic sources */}
        <div className="bg-xert-ink border border-xert-steel/20 p-5">
          <h3 className="font-display text-sm text-xert-concrete/40 uppercase tracking-wider mb-4">Traffic Sources</h3>
          {data?.sources?.length === 0 ? (
            <p className="font-body text-sm text-xert-concrete/40">No UTM data yet.</p>
          ) : (
            <div className="space-y-3">
              {(data?.sources || []).map(([src, count], i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <span className="font-body text-sm text-xert-offwhite capitalize">{src}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-1.5 bg-xert-steel/20 rounded-full overflow-hidden">
                      <div className="h-full bg-xert-red rounded-full" style={{ width: `${Math.min(100, (count / (data.total || 1)) * 100)}%` }} />
                    </div>
                    <span className="font-display text-sm text-xert-concrete/60 tabular-nums w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campaigns */}
        <div className="bg-xert-ink border border-xert-steel/20 p-5">
          <h3 className="font-display text-sm text-xert-concrete/40 uppercase tracking-wider mb-4">Campaigns</h3>
          {data?.campaigns?.length === 0 ? (
            <p className="font-body text-sm text-xert-concrete/40">No campaign data yet.</p>
          ) : (
            <div className="space-y-3">
              {(data?.campaigns || []).map(([camp, count], i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <span className="font-body text-sm text-xert-offwhite">{camp}</span>
                  <span className="font-display text-sm text-xert-concrete/60 tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Daily signups */}
      <div className="bg-xert-ink border border-xert-steel/20 p-5">
        <h3 className="font-display text-sm text-xert-concrete/40 uppercase tracking-wider mb-4">Recent Daily Signups</h3>
        {data?.weeklySignups?.length === 0 ? (
          <p className="font-body text-sm text-xert-concrete/40">No signup data yet.</p>
        ) : (
          <div className="flex items-end gap-2 h-24 overflow-x-auto scrollbar-hide">
            {(data?.weeklySignups || []).map(([date, count], i) => {
              const maxCount = Math.max(...(data?.weeklySignups?.map(([, c]) => c) || [1]));
              return (
                <div key={i} className="flex flex-col items-center gap-1 shrink-0">
                  <div className="w-6 bg-xert-red/60 hover:bg-xert-red transition-colors rounded-sm"
                    style={{ height: `${(count / maxCount) * 80}px` }}
                    title={`${date}: ${count}`} />
                  <span className="font-body text-xs text-xert-concrete/30 rotate-45 origin-left translate-y-2">{date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
