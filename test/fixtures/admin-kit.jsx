// Test entry only: no production route, account, service, or mutable remote data.
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link } from 'react-router-dom';
import {
  AdminButton, AdminDataTable, AdminFilterBar, AdminStatCard, AdminEmptyState,
  AdminSkeleton, AdminBadge, AdminDrawer, AdminFormField, AdminSegmented, AdminTimeline,
} from '../../src/components/admin/ui';
import { kitRows, kitTimeline } from './admin-kit-data.mjs';
import '../../src/index.css';
import './admin-kit.css';

const statuses = ['active', 'pending', 'cancelled', 'unknown'];
const columns = [
  { key: 'name', header: 'Member', sortable: true, render: row => <div><strong>{row.name}</strong><p>{row.detail}</p></div> },
  { key: 'amountInCents', header: 'Amount', sortable: true, sortValue: row => row.amountInCents, render: row => `$${(row.amountInCents / 100).toFixed(2)}` },
  { key: 'status', header: 'Status', render: row => <AdminBadge status={row.status}>{row.status}</AdminBadge> },
];

function KitFixture() {
  const [filters, setFilters] = useState({});
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [density, setDensity] = useState('comfortable');
  const [narrow, setNarrow] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [input, setInput] = useState('');
  const [fieldChanges, setFieldChanges] = useState(0);
  const [view, setView] = useState('upcoming');
  const [state, setState] = useState('ready');
  const fieldRef = useRef(null);
  const rows = kitRows.filter(row =>
    (!filters.memberStatus || row.status === filters.memberStatus)
    && (!filters.memberQuery || `${row.name} ${row.email}`.toLowerCase().includes(filters.memberQuery.toLowerCase())));
  return <main className="kit-fixture" data-density={density}>
    <h1>Command Centre kit fixture</h1>
    <p>Fictional records only. Nothing here is sent or saved to XERT.</p>
    <div className="kit-fixture-tools">
      <AdminButton variant="ghost" onClick={() => setNarrow(value => !value)}>{narrow ? 'Full width' : 'Narrow column'}</AdminButton>
      <AdminButton variant="ghost" onClick={() => setDensity(value => value === 'compact' ? 'comfortable' : 'compact')}>{density === 'compact' ? 'Comfortable density' : 'Compact density'}</AdminButton>
      <AdminButton onClick={() => setDrawerOpen(true)}>Open member drawer</AdminButton>
      <AdminButton variant="ghost" onClick={() => setState('error')}>Simulate table error</AdminButton>
      <AdminButton variant="ghost" onClick={() => setState('loading')}>Simulate table loading</AdminButton>
      <AdminButton variant="ghost" onClick={() => setState('ready')}>Restore fixture data</AdminButton>
      <Link to="?source=retained&memberStatus=pending#kit">Visit pending filter</Link>
    </div>
    <output aria-label="Selected fixture keys">{[...selectedKeys].sort().join(',')}</output>
    <output aria-label="Filtered fixture count">{rows.length}</output>
    <div className="kit-fixture-column" data-narrow={narrow}>
      <AdminFilterBar queryKey="memberQuery" searchLabel="Search fictional members" filters={[
        { key: 'memberStatus', label: 'Member status', options: [{value: '', label: 'All statuses'}, ...statuses.map(value => ({value, label: value}))] },
      ]} onChange={setFilters} />
      <AdminDataTable rows={rows} columns={columns} label="Fictional members" selectable
        selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys}
        loading={state === 'loading'} error={state === 'error' ? 'Fictional table is temporarily unavailable.' : null}
        onRetry={() => setState('ready')} emptyTitle="No matching fictional members"
        emptyDescription="Change the search or status filter to see records." />
      <AdminStatCard label="Fictional memberships" value="320" detail="Local verification records, not live membership totals" />
      <div className="kit-short-segments"><AdminSegmented label="Short segment targets" options={[
        {value: 'one', label: '1'}, {value: 'two', label: '2'}, {value: 'three', label: '3'},
      ]} /></div>
      <AdminSegmented label="Fixture view" value={view} onValueChange={setView} options={[
        {value: 'upcoming', label: 'Upcoming'}, {value: 'disabled', label: 'Unavailable', disabled: true}, {value: 'past', label: 'Past'},
      ]} />
      <output aria-label="Fixture view value">{view}</output>
      <AdminEmptyState title="No follow-ups" description="New fictional review requests would appear here." action={<AdminButton variant="ghost" onClick={() => setDrawerOpen(true)}>Create fictional note</AdminButton>} />
      <AdminSkeleton variant="editor" label="Loading fictional editor" />
      <AdminTimeline items={kitTimeline} label="Fictional member timeline" />
    </div>
    <AdminDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Fictional member detail"
      description="An isolated drawer for keyboard and text-size checks."
      footer={<AdminButton onClick={() => setDrawerOpen(false)}>Done reviewing fixture</AdminButton>}>
      <p id="fixture-original-description">Keep this original input description.</p>
      <AdminFormField id="fictional-note" label="Fictional note" helper="No data leaves this fixture."
        error={input ? undefined : 'Enter a fictional note.'} required>
        <input ref={fieldRef} value={input} aria-describedby="fixture-original-description"
          onChange={event => { setInput(event.target.value); setFieldChanges(value => value + 1); }} />
      </AdminFormField>
      <AdminButton variant="ghost" onClick={() => fieldRef.current?.focus()}>Focus fictional note</AdminButton>
      <output aria-label="Field change count">{fieldChanges}</output>
      <AdminTimeline items={kitTimeline} label="Drawer timeline" />
    </AdminDrawer>
  </main>;
}
createRoot(document.getElementById('kit-fixture')).render(<BrowserRouter><KitFixture /></BrowserRouter>);
