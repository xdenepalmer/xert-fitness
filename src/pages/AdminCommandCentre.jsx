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
import CoachesManager from '@/components/admin/CoachesManager';
import EventsManager from '@/components/admin/EventsManager';
import MembersManager from '@/components/admin/MembersManager';
import OrdersManager from '@/components/admin/OrdersManager';
import ProductsManager from '@/components/admin/ProductsManager';
import ContentManager from '@/components/admin/ContentManager';

export default function AdminCommandCentre() {
  const [section, setSection] = useState('overview');

  const renderSection = () => {
    switch (section) {
      case 'overview': return <AdminOverview onNavigate={setSection} />;
      case 'members': return <LeadTable type="member" />;
      case 'trainers': return <LeadTable type="trainer" />;
      case 'partners': return <LeadTable type="partner" />;
      case 'calendar': return <ClassCalendarAdmin />;
      case 'coaches': return <CoachesManager />;
      case 'events': return <EventsManager />;
      case 'gym-members': return <MembersManager />;
      case 'orders': return <OrdersManager />;
      case 'products': return <ProductsManager />;
      case 'content': return <ContentManager />;
      case 'bookings': return <BookingRequestsTable />;
      case 'pt-requests': return <PTRequestsTable />;
      case 'availability': return <AvailabilityManager />;
      case 'settings': return <SoftLaunchSettings />;
      case 'campaigns': return <CampaignStats />;
      default: return <AdminOverview onNavigate={setSection} />;
    }
  };

  return (
    <AdminLayout activeSection={section} onSectionChange={setSection}>
      {renderSection()}
    </AdminLayout>
  );
}