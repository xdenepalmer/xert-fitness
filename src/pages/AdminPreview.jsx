import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import AdminToday from '@/components/admin/AdminToday';

// Development-only: renders the owner shell and Today with fixture data so the
// layout can be reviewed and screenshotted without a Supabase session. Not
// routed in production builds.
const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const later = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();

const FIXTURE = {
  name: 'Byron',
  stats: { pendingBookings: 3, ptRequests: 1, waitlistedBookings: 2, trainerApplicants: 0, partnerEnquiries: 0 },
  ops: {
    available: true,
    rows: [
      { session_id: 'a', title: 'Foundation Strength', start_time: inTwoHours, status: 'published', coach_name: 'Byron', location_zone: 'Main floor', confirmed_count: 6, capacity: 8, requested_count: 2, public_request_count: 1, waitlist_count: 2, attendance_due: false },
      { session_id: 'b', title: 'Engine Intervals', start_time: later, status: 'published', coach_name: 'Kirra', location_zone: 'Turf', confirmed_count: 4, capacity: 8, requested_count: 0, public_request_count: 0, waitlist_count: 0, attendance_due: false },
    ],
  },
  launch: { target_launch_date: '2026-09-14' },
};

export default function AdminPreview() {
  const [section, setSection] = useState('overview');
  const navigate = key => { setSection(key); return true; };
  return (
    <AdminLayout activeSection={section} onSectionChange={navigate}>
      {section === 'overview'
        ? <AdminToday preview={FIXTURE} onNavigate={navigate} />
        : <div className="p-8 font-body text-sm text-xert-pale/60">Preview stub for <strong className="text-xert-offwhite">{section}</strong>. The real screen loads live data.</div>}
    </AdminLayout>
  );
}
