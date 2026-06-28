import React, { useEffect, useState } from 'react';
import AdminStatCard from './AdminStatCard';
import { getDashboardStats, getSoftLaunchSettings, getDefaultSettings } from '@/lib/adminData';

function getCountdown(targetDate) {
  if (!targetDate) return null;
  const diff = new Date(targetDate) - new Date();
  if (diff <= 0) return 'Launched';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return `${days}d`;
}

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(getDefaultSettings());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      getDashboardStats(),
      getSoftLaunchSettings(),
    ]).then(([s, cfg]) => {
      setStats(s);
      if (cfg) setSettings(cfg);
      setLoading(false);
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-6 space-y-8">
      {error && (
        <div className="bg-xert-red/10 border border-xert-red/30 p-4">
          <p className="font-body text-sm text-xert-red">Supabase error: {error}</p>
          <p className="font-body text-xs text-xert-concrete/50 mt-1">Check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables and Supabase table setup.</p>
        </div>
      )}

      {/* Security warning */}
      <div className="bg-yellow-900/20 border border-yellow-600/30 p-4">
        <p className="font-body text-sm text-yellow-400 font-semibold mb-1">⚠ Admin Area — Security Notice</p>
        <p className="font-body text-xs text-yellow-400/70 leading-relaxed">
          This admin area is currently accessible to any user. Before real operational use, implement Supabase RLS policies and add route-level authentication. See setup notes below.
        </p>
      </div>

      {/* Primary stats */}
      <div>
        <h2 className="font-display text-xs text-xert-concrete/40 uppercase tracking-wider mb-4">Foundation Interest</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <AdminStatCard label="Total member leads" value={stats?.totalMembers} loading={loading} accent />
          <AdminStatCard label="New this week" value={stats?.newThisWeek} loading={loading} />
          <AdminStatCard label="Trainer applicants" value={stats?.trainerApplicants} loading={loading} />
          <AdminStatCard label="Partner enquiries" value={stats?.partnerEnquiries} loading={loading} />
        </div>
      </div>

      {/* Interest breakdown */}
      <div>
        <h2 className="font-display text-xs text-xert-concrete/40 uppercase tracking-wider mb-4">Interest Breakdown</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <AdminStatCard label="PT interest" value={stats?.ptInterest} loading={loading} />
          <AdminStatCard label="Event prep interest" value={stats?.eventPrepInterest} loading={loading} />
          <AdminStatCard label="Pending bookings" value={stats?.pendingBookings} loading={loading} />
          <AdminStatCard label="PT requests" value={stats?.ptRequests} loading={loading} />
        </div>
      </div>

      {/* Launch status */}
      <div>
        <h2 className="font-display text-xs text-xert-concrete/40 uppercase tracking-wider mb-4">Launch Status</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <AdminStatCard
            label="Countdown"
            value={getCountdown(settings.target_launch_date)}
            sub={`Target: ${settings.target_launch_date || 'Not set'}`}
            loading={false}
            accent
          />
          <AdminStatCard label="Soft launch mode" value={settings.soft_launch_mode ? 'ON' : 'OFF'} loading={false} />
          <AdminStatCard label="Bookings enabled" value={settings.bookings_enabled ? 'YES' : 'NO'} loading={false} />
          <AdminStatCard label="Waitlisted" value={stats?.waitlistedBookings} loading={loading} />
        </div>
      </div>

      {/* Top insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top times */}
        <div className="bg-xert-ink border border-xert-steel/20 p-5">
          <h3 className="font-display text-xs text-xert-concrete/40 uppercase tracking-wider mb-4">Most Requested Training Times</h3>
          {loading ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-xert-charcoal animate-pulse" />)}</div> :
            stats?.topTimes?.length > 0 ? (
              <div className="space-y-3">
                {stats.topTimes.map((t, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="font-body text-sm text-xert-offwhite">{t.time}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-1.5 bg-xert-steel/20 rounded-full overflow-hidden">
                        <div className="h-full bg-xert-red rounded-full" style={{ width: `${Math.min(100, (t.count / (stats.topTimes[0]?.count || 1)) * 100)}%` }} />
                      </div>
                      <span className="font-display text-sm text-xert-concrete/60 tabular-nums w-6 text-right">{t.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="font-body text-sm text-xert-concrete/40">No data yet.</p>
          }
        </div>

        {/* Top goals */}
        <div className="bg-xert-ink border border-xert-steel/20 p-5">
          <h3 className="font-display text-xs text-xert-concrete/40 uppercase tracking-wider mb-4">Most Common Training Goals</h3>
          {loading ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-xert-charcoal animate-pulse" />)}</div> :
            stats?.topGoals?.length > 0 ? (
              <div className="space-y-3">
                {stats.topGoals.map((g, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="font-body text-sm text-xert-offwhite">{g.goal}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-1.5 bg-xert-steel/20 rounded-full overflow-hidden">
                        <div className="h-full bg-xert-orange rounded-full" style={{ width: `${Math.min(100, (g.count / (stats.topGoals[0]?.count || 1)) * 100)}%` }} />
                      </div>
                      <span className="font-display text-sm text-xert-concrete/60 tabular-nums w-6 text-right">{g.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="font-body text-sm text-xert-concrete/40">No data yet.</p>
          }
        </div>
      </div>
    </div>
  );
}