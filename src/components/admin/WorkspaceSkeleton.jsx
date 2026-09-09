import React from 'react';
import { ADMIN_PAGE, ADMIN_PANEL, ADMIN_TEXT } from './ui';

const repeat = (count, render) => Array.from({ length: count }, (_, index) => <React.Fragment key={index}>{render(index)}</React.Fragment>);
const Line = ({ size = 'long' }) => <span className="admin-skeleton-line" data-size={size} />;
const Control = () => <span className="admin-skeleton-control" />;
const Copy = () => <div className="min-w-0 flex-1 space-y-2"><Line size="medium" /><Line /></div>;
const Toolbar = ({ count = 3 }) => <div className="flex flex-wrap items-center justify-between gap-3"><Line size="title" /><div className="flex flex-wrap gap-2">{repeat(count, () => <Control />)}</div></div>;
const Field = ({ large = false }) => <div className="space-y-2"><Line size="short" /><div className={`admin-skeleton-field ${large ? 'admin-skeleton-editor' : ''}`} /></div>;
const Metrics = ({ count = 4, columns = 'grid-cols-2 sm:grid-cols-4' }) => <div className={`grid gap-3 ${columns}`}>{repeat(count, () => <div className={`${ADMIN_PANEL} admin-skeleton-metric p-4 space-y-3`}><Line size="title" /><Line size="short" /></div>)}</div>;

function PersonRows({ count = 4, metrics = false }) {
  return <div className="space-y-2">{repeat(count, () => <div className="bg-surface-ink border border-border-hairline p-4 flex flex-wrap items-center gap-4"><Copy />{metrics && <div className="flex gap-5">{repeat(3, () => <div className="space-y-2"><Line size="short" /><Line size="short" /></div>)}</div>}<div className="flex gap-2"><Control /><Control /></div></div>)}</div>;
}
function CalendarSkeleton() {
  return <><Toolbar count={2} /><div className={`${ADMIN_PANEL} p-4 space-y-3`}><Line size="medium" /><Line /></div><Toolbar count={2} />
    <div className="border border-border-hairline"><div className="grid grid-cols-7 border-b border-border-hairline">{repeat(7, () => <div className="p-2"><Line size="short" /></div>)}</div>
      {repeat(5, week => <div className="grid grid-cols-7 border-b border-border-hairline">{repeat(7, day => <div className="admin-skeleton-cell min-w-0 border-r border-border-hairline p-1 space-y-2"><Line size="short" />{(day + week) % 3 === 0 && <div className="hidden sm:block space-y-2"><Line size="medium" /><Line size="short" /></div>}</div>)}</div>)}
    </div><div className={`${ADMIN_PANEL} p-4 space-y-4`}><Line size="title" /><PersonRows count={2} /></div></>;
}
function WorkoutSkeleton() {
  return <><Toolbar count={1} /><Line /><div className="bg-surface-ink border border-border-hairline p-6 space-y-5"><div className="flex flex-wrap gap-2">{repeat(4, () => <Control />)}</div><Field /><Field large /><div className="flex justify-between gap-4"><Copy /><Control /></div><Control /></div></>;
}
function ContentSkeleton() {
  return <><Toolbar count={0} /><Line />{repeat(3, () => <article className={`${ADMIN_PANEL} overflow-hidden`}><div className="flex items-center gap-3 p-5 border-b border-border-hairline"><Control /><Copy /></div><div className="p-5 space-y-4"><Field /><Field /><Field /><div className="flex justify-end"><Control /></div></div></article>)}</>;
}
function FormCardsSkeleton() {
  return <><Toolbar count={1} /><Metrics /><Toolbar count={2} /><div className="grid gap-3 lg:grid-cols-2">{repeat(6, () => <article className={`${ADMIN_PANEL} p-5 flex items-start gap-4`}><Control /><Copy /><Line size="short" /></article>)}</div></>;
}
function ComposeSkeleton() {
  return <><Toolbar count={0} /><div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{repeat(4, () => <div className={`${ADMIN_PANEL} p-4 space-y-3`}><Control /><Copy /></div>)}</div><div className="grid gap-6 lg:grid-cols-2"><section className={`${ADMIN_PANEL} p-5 space-y-4`}><Field /><PersonRows count={4} /></section><section className={`${ADMIN_PANEL} p-5 space-y-4`}><Field large /><Copy /><Control /></section></div></>;
}
function TodaySkeleton() {
  return <><Toolbar count={1} /><section className="space-y-3"><Line size="short" /><article className={`${ADMIN_PANEL} p-5 sm:p-7 space-y-5`}><Line size="medium" /><Line size="title" /><Copy /><div className="flex flex-wrap gap-2">{repeat(3, () => <Control />)}</div></article></section><PersonRows count={2} /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{repeat(4, () => <div className={`${ADMIN_PANEL} p-4 space-y-3`}><Control /><Line size="medium" /></div>)}</div></>;
}

/** Placeholder structures mirror each workspace's header, controls and real row/card primitives. */
export function WorkspaceSkeleton({ section }) {
  let content;
  if (section === 'calendar') content = <CalendarSkeleton />;
  else if (section === 'workouts') content = <WorkoutSkeleton />;
  else if (section === 'content') content = <ContentSkeleton />;
  else if (section === 'forms') content = <FormCardsSkeleton />;
  else if (section === 'overview') content = <TodaySkeleton />;
  else if (['sms', 'emails', 'announcements'].includes(section)) content = <ComposeSkeleton />;
  else if (section === 'gym-members') content = <><Toolbar count={4} /><Metrics count={6} columns="grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" /><div className={`${ADMIN_PANEL} p-4 space-y-4`}><Line size="medium" /><PersonRows count={2} /></div><PersonRows metrics /></>;
  else if (section === 'settings') content = <><Toolbar count={0} />{repeat(3, () => <div className={`${ADMIN_PANEL} p-5 space-y-4`}><Line size="title" /><Field /><div className="flex justify-between gap-4"><Copy /><Control /></div></div>)}</>;
  else if (section === 'availability') content = <><Toolbar count={1} /><section className={`${ADMIN_PANEL} p-4 space-y-3`}><Line size="title" />{repeat(7, () => <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline py-3"><Line size="short" /><div className="flex gap-2"><Control /><Control /></div></div>)}</section></>;
  else if (['coaches', 'events', 'products'].includes(section)) content = <><Toolbar count={1} />{repeat(3, () => <article className={`${ADMIN_PANEL} p-5 space-y-4`}><div className="flex items-start gap-4"><Control /><Copy /><Control /></div><div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{repeat(3, () => <Field />)}</div></article>)}</>;
  else if (['health', 'fitbox', 'campaigns'].includes(section)) content = <><Toolbar count={2} /><Metrics /><div className="grid gap-4 lg:grid-cols-2">{repeat(4, () => <section className={`${ADMIN_PANEL} p-5 space-y-4`}><Line size="title" /><PersonRows count={2} /></section>)}</div></>;
  else content = <><Toolbar count={3} />{section === 'orders' && <Metrics count={5} columns="grid-cols-1 sm:grid-cols-2 lg:grid-cols-5" />}<div className="flex flex-wrap items-center gap-3"><Control /><Line size="medium" /><Control /></div><PersonRows count={5} metrics={section === 'orders'} /></>;
  return <section role="status" aria-label="Loading section" data-workspace-skeleton={section} className={`${ADMIN_PAGE} ${section === 'workouts' ? 'max-w-3xl' : section === 'settings' ? 'max-w-2xl' : ''}`}><span className={`sr-only ${ADMIN_TEXT.lede}`}>Loading workspace content</span><div aria-hidden="true" className="admin-skeleton animate-pulse">{content}</div></section>;
}
