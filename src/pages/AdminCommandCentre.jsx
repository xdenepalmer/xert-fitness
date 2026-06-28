import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import AdminOverview from '@/components/admin/AdminOverview';
import LeadTable from '@/components/admin/LeadTable';
import ClassCalendarAdmin from '@/components/admin/ClassCalendarAdmin';
import BookingRequestsTable from '@/components/admin/BookingRequestsTable';
import PTRequestsTable from '@/components/admin/PTRequestsTable';
import AvailabilityManager from '@/components/admin/AvailabilityManager';
import SoftLaunchSettings from '@/components/admin/SoftLaunchSettings';
import CampaignStats from '@/components/admin/CampaignStats';

export default function AdminCommandCentre() {
  const [section, setSection] = useState('overview');

  const renderSection = () => {
    switch (section) {
      case 'overview': return <AdminOverview />;
      case 'members': return <LeadTable type="member" />;
      case 'trainers': return <LeadTable type="trainer" />;
      case 'partners': return <LeadTable type="partner" />;
      case 'calendar': return <ClassCalendarAdmin />;
      case 'bookings': return <BookingRequestsTable />;
      case 'pt-requests': return <PTRequestsTable />;
      case 'availability': return <AvailabilityManager />;
      case 'settings': return <SoftLaunchSettings />;
      case 'campaigns': return <CampaignStats />;
      default: return <AdminOverview />;
    }
  };

  return (
    <AdminLayout activeSection={section} onSectionChange={setSection}>
      {renderSection()}
    </AdminLayout>
  );
}