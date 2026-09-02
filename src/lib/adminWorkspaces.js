import {
  BarChart3, BellRing, CalendarDays, CalendarRange, ClipboardCheck, ClipboardList, DollarSign,
  Dumbbell, Handshake, Inbox, LayoutDashboard, ListChecks, MessageSquareText, PenSquare, ScrollText,
  Settings, ShieldCheck, Ticket, Trophy, Tv, UserCog, Users, UserSquare2,
} from 'lucide-react';

// One information architecture powers the desktop sidebar and command palette.
// The labels mirror the native owner workspace so Byron never has to learn two
// different admin products.
export const ADMIN_WORKSPACE_GROUPS = Object.freeze([
  {
    key: 'today',
    label: null,
    items: [
      { key: 'overview', label: 'Today', mobileLabel: 'Today', detail: 'Priorities, classes and business pulse', icon: LayoutDashboard },
    ],
  },
  {
    key: 'operate',
    label: 'Operate',
    items: [
      { key: 'gym-members', label: 'Members', mobileLabel: 'Members', detail: 'Accounts, credits and member records', icon: Users },
      { key: 'calendar', label: 'Class Calendar', mobileLabel: 'Classes', detail: 'Schedule, rosters and attendance', icon: CalendarDays },
      { key: 'workouts', label: 'Workout of the Day', detail: 'Program the in-club display', icon: Tv },
      { key: 'bookings', label: 'Booking Requests', detail: 'Resolve public and member requests', icon: Inbox },
      { key: 'pt-requests', label: 'PT Requests', detail: 'Approve and complete private training', icon: Dumbbell },
      { key: 'availability', label: 'Availability', detail: 'Bookable windows and blackouts', icon: CalendarRange },
    ],
  },
  {
    key: 'grow',
    label: 'Grow',
    items: [
      { key: 'members', label: 'Member Leads', detail: 'New member opportunities', icon: ClipboardList },
      { key: 'trainers', label: 'Trainer Applicants', detail: 'Coach and trainer intake', icon: UserCog },
      { key: 'partners', label: 'Partner Enquiries', detail: 'Local partner opportunities', icon: Handshake },
      { key: 'campaigns', label: 'Campaign Attribution', detail: 'Acquisition sources and campaigns', icon: BarChart3 },
    ],
  },
  {
    key: 'publish',
    label: 'Publish',
    items: [
      { key: 'forms', label: 'Forms & Surveys', detail: 'Build, publish and analyse forms', icon: ListChecks },
      { key: 'announcements', label: 'Member Notices', detail: 'Reach web and iOS members', icon: BellRing },
      { key: 'sms', label: 'Text Members', detail: 'SMS any group with a mobile on file', icon: MessageSquareText },
      { key: 'content', label: 'Site Content', detail: 'Public copy, FAQs and media', icon: PenSquare },
      { key: 'coaches', label: 'Team Directory', detail: 'Coaches and practitioners', icon: UserSquare2 },
      { key: 'events', label: 'Event Calendar', detail: 'Training and competition calendar', icon: Trophy },
    ],
  },
  {
    key: 'commerce',
    label: 'Commerce',
    items: [
      { key: 'orders', label: 'Orders & Revenue', detail: 'Payments, refunds and recovery', icon: DollarSign },
      { key: 'products', label: 'Session Packs & Pricing', detail: 'Credits, pricing and Stripe links', icon: Ticket },
    ],
  },
  {
    key: 'platform',
    label: 'Platform',
    items: [
      { key: 'settings', label: 'Member App Controls', detail: 'Launch, booking and payment switches', icon: Settings },
      { key: 'health', label: 'Operations Health', detail: 'Stripe, schema and push readiness', icon: ShieldCheck },
      { key: 'fitbox', label: 'FitBox Review', detail: 'Review provider signals without changing XERT records', icon: ClipboardCheck },
      { key: 'audit', label: 'Admin Audit', detail: 'Protected operational history', icon: ScrollText },
    ],
  },
]);

export const ADMIN_WORKSPACES = Object.freeze(ADMIN_WORKSPACE_GROUPS.flatMap(group => group.items));

// The three owner jobs used throughout a normal shift stay one tap away on
// small screens. They are selected from the same catalogue as the desktop
// sidebar so routes, labels and icons cannot drift between layouts.
export const ADMIN_MOBILE_WORKSPACES = Object.freeze(ADMIN_WORKSPACES.filter(item => item.mobileLabel));

export const ADMIN_QUICK_ACTIONS = Object.freeze([
  { key: 'calendar', label: 'Create a class', icon: CalendarDays, params: { action: 'create' } },
  { key: 'workouts', label: "Set today's workout", icon: Tv },
  { key: 'forms', label: 'Create a form or survey', icon: ListChecks, params: { action: 'create' } },
  { key: 'announcements', label: 'Publish a member notice', icon: BellRing, params: { action: 'create' } },
  { key: 'products', label: 'Create a session pack', icon: Ticket, params: { action: 'create' } },
  { key: 'coaches', label: 'Add a team member', icon: UserSquare2, params: { action: 'create' } },
]);
