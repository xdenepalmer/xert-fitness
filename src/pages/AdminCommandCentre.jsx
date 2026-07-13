import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
import { getAdminSectionFromPath, getAdminSectionPath } from '@/lib/adminNavigation';
import { UNSAVED_ADMIN_CHANGES_MESSAGE } from '@/lib/siteContentDraft';

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
  const routeSection = getAdminSectionFromPath(location.pathname);
  const [section, setActiveSection] = useState(routeSection);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const canonicalPath = getAdminSectionPath(section);
  const intent = new URLSearchParams(location.search);

  const confirmDiscard = useCallback(() => (
    !hasUnsavedChanges || window.confirm(UNSAVED_ADMIN_CHANGES_MESSAGE)
  ), [hasUnsavedChanges]);

  useEffect(() => {
    if (routeSection === section) {
      if (location.pathname !== canonicalPath) navigate(canonicalPath, { replace: true });
      return;
    }
    if (!confirmDiscard()) {
      navigate(canonicalPath, { replace: true });
      return;
    }
    setHasUnsavedChanges(false);
    setActiveSection(routeSection);
  }, [canonicalPath, confirmDiscard, location.pathname, navigate, routeSection, section]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warnBeforeUnload = event => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const setSection = useCallback((nextSection, params) => {
    if (nextSection === section) {
      navigate(getAdminSectionPath(nextSection, params));
      return true;
    }
    if (!confirmDiscard()) return false;
    setHasUnsavedChanges(false);
    setActiveSection(nextSection);
    navigate(getAdminSectionPath(nextSection, params));
    return true;
  }, [confirmDiscard, navigate, section]);

  const confirmLeaveAdmin = useCallback(() => {
    if (!confirmDiscard()) return false;
    setHasUnsavedChanges(false);
    return true;
  }, [confirmDiscard]);

  const consumeIntent = useCallback(() => {
    navigate(canonicalPath, { replace: true });
  }, [canonicalPath, navigate]);

  const renderSection = () => {
    switch (section) {
      case 'overview': return <AdminOverview onNavigate={setSection} />;
      case 'health': return <OperationsHealth onNavigate={setSection} />;
      case 'members': return <LeadTable type="member" />;
      case 'trainers': return <LeadTable type="trainer" />;
      case 'partners': return <LeadTable type="partner" />;
      case 'calendar': return <ClassCalendarAdmin initialAction={intent.get('action')} onIntentHandled={consumeIntent} />;
      case 'coaches': return <CoachesManager initialAction={intent.get('action')} onIntentHandled={consumeIntent} />;
      case 'events': return <EventsManager initialAction={intent.get('action')} onIntentHandled={consumeIntent} />;
      case 'gym-members': return <MembersManager initialMemberId={intent.get('member')} onIntentHandled={consumeIntent} />;
      case 'orders': return <OrdersManager />;
      case 'products': return <ProductsManager initialAction={intent.get('action')} onIntentHandled={consumeIntent} />;
      case 'content': return <ContentManager onDirtyChange={setHasUnsavedChanges} />;
      case 'bookings': return <BookingRequestsTable />;
      case 'pt-requests': return <PTRequestsTable />;
      case 'availability': return <AvailabilityManager />;
      case 'settings': return <SoftLaunchSettings onDirtyChange={setHasUnsavedChanges} />;
      case 'campaigns': return <CampaignStats />;
      default: return <AdminOverview onNavigate={setSection} />;
    }
  };

  return (
    <AdminLayout activeSection={section} onSectionChange={setSection} hasUnsavedChanges={hasUnsavedChanges} onConfirmLeave={confirmLeaveAdmin}>
      <Suspense fallback={<SectionLoader />}>
        {renderSection()}
      </Suspense>
    </AdminLayout>
  );
}
