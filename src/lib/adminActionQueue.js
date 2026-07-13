const ACTION_DEFINITIONS = [
  {
    key: 'pending-bookings',
    metric: 'pendingBookings',
    title: 'Confirm booking requests',
    singular: 'booking request needs a decision',
    plural: 'booking requests need a decision',
    target: 'bookings',
    tone: 'urgent',
  },
  {
    key: 'pt-requests',
    metric: 'ptRequests',
    title: 'Respond to PT requests',
    singular: 'private training request is waiting',
    plural: 'private training requests are waiting',
    target: 'pt-requests',
    tone: 'urgent',
  },
  {
    key: 'waitlists',
    metric: 'waitlistedBookings',
    title: 'Review class waitlists',
    singular: 'member is waiting for a class place',
    plural: 'members are waiting for class places',
    target: 'bookings',
    tone: 'attention',
  },
  {
    key: 'trainer-applicants',
    metric: 'trainerApplicants',
    title: 'Review trainer applicants',
    singular: 'new trainer application',
    plural: 'new trainer applications',
    target: 'trainers',
    tone: 'standard',
  },
  {
    key: 'partner-enquiries',
    metric: 'partnerEnquiries',
    title: 'Review partner enquiries',
    singular: 'new partner enquiry',
    plural: 'new partner enquiries',
    target: 'partners',
    tone: 'standard',
  },
];

export function buildAdminActionQueue(metrics) {
  if (!metrics) return [];

  return ACTION_DEFINITIONS.flatMap(action => {
    const count = metrics[action.metric];
    if (!Number.isSafeInteger(count) || count <= 0) return [];
    return [{
      key: action.key,
      title: action.title,
      detail: `${count} ${count === 1 ? action.singular : action.plural}`,
      count,
      target: action.target,
      tone: action.tone,
    }];
  });
}
