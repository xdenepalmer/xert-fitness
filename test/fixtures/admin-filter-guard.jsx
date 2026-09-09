// Test-only composition: the real auth provider, admin route, owner controller
// and content editor run unchanged beside the real URL filter primitive.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '../../src/lib/query-client';
import { SupabaseAuthProvider } from '../../src/lib/SupabaseAuthContext';
import AdminRoute from '../../src/components/admin/AdminRoute';
import AdminCommandCentre from '../../src/pages/AdminCommandCentre';
import { AdminFilterBar } from '../../src/components/admin/ui';
import '../../src/index.css';

// Establish the actual editor path before mounting the router. This does not
// grant access; AdminRoute still requires the isolated fixture's admin session.
history.replaceState(null, '', '/admin/content?source=filter-guard&workspace=website');
createRoot(document.getElementById('filter-guard-fixture')).render(
  <SupabaseAuthProvider><QueryClientProvider client={queryClientInstance}><BrowserRouter>
    <AdminRoute>
      <aside aria-label="Isolated owner filter" style={{ position: 'relative', zIndex: 40, padding: '1rem', background: 'var(--surface-base)' }}>
        <AdminFilterBar queryKey="fixtureQuery" searchLabel="Isolated owner search" />
      </aside>
      <AdminCommandCentre />
    </AdminRoute>
  </BrowserRouter></QueryClientProvider></SupabaseAuthProvider>,
);
