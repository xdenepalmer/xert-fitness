import React, { lazy, Suspense, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
import { getAdminSectionFromPath, getAdminSectionPath } from '@/lib/adminNavigation';

// Admin tools are independently code-split. Most staff sessions only need one
// operational surface at a time, so there is no reason to preload the rest.
const AdminOverview = lazy(() => import('@/components/admin/AdminOverview'));
const LeadTable = lazy(() => import('@/components/admin/LeadTable'));
const ClassCalendarAdmin = lazy(() => import('@/components/admin/ClassCalendarAdmin'));
const BookingRequestsTable = lazy(() => import('@/components/admin/BookingRequestsTable'));
const PTRequestsTable = lazy(() => import('@/components/admin/PTRequestsTable'));
const AvailabilityManager = lazy(() => import('@/components/admin/AvailabilityManager'));
const SoftLaunchSettings = lazy(() => import('@/components/admin/SoftLaunchSettings'));
const CampaignStats = lazy(() => import('@/components/admin/CampaignStats'));
const CoachesManager = lazy(() => import('@/components/admin/CoachesManager'));
const EventsManager = lazy(() => import('@/components/admin/EventsManager'));
const MembersManager = lazy(() => import('@/components/admin/MembersManager'));
const OrdersManager = lazy(() => import('@/components/admin/OrdersManager'));
const ProductsManager = lazy(() => import('@/components/admin/ProductsManager'));
const ContentManager = lazy(() => import('@/components/admin/ContentManager'));
const OperationsHealth = lazy(() => import('@/components/admin/OperationsHealth'));

function SectionLoader() {
  return (
    <div className="p-6" role="status" aria-label="Loading section">
      <div className="h-24 bg-xert-ink animate-pulse border border-xert-steel/20" />
    </div>
  );
}

export default function AdminCommandCentre() {
  const location = useLocation();
  const navigate = useNavigate();
  const section = getAdminSectionFromPath(location.pathname);
  const canonicalPath = getAdminSectionPath(section);

  useEffect(() => {
    if (location.pathname !== canonicalPath) navigate(canonicalPath, { replace: true });
  }, [canonicalPath, location.pathname, navigate]);

  const setSection = useCallback(nextSection => {
    navigate(getAdminSectionPath(nextSection));
  }, [navigate]);

  const renderSection = () => {
    switch (section) {
      case 'overview': return <AdminOverview onNavigate={setSection} />;
      case 'health': return <OperationsHealth onNavigate={setSection} />;
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
      <Suspense fallback={<SectionLoader />}>
        {renderSection()}
      </Suspense>
    </AdminLayout>
  );
}
