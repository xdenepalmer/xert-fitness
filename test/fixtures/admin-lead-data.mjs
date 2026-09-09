// Fictional, read-only server-shaped lead data for the real admin UI.
// No app imports, provider dispatches or mutation support.
const memberStatuses = ['new', 'contacted', 'joined', 'casual'];

function lead(type, index) {
  const number = String(index + 1).padStart(3, '0');
  const common = {
    id: `fixture-${type}-lead-${number}`,
    full_name: `Lead ${type[0].toUpperCase() + type.slice(1)} ${number}`,
    email: `lead.${type}.${number}@example.invalid`, phone: '',
    status: type === 'member' ? memberStatuses[index % memberStatuses.length] : 'reviewing',
    admin_notes: index === 0 ? 'Fictional internal note: follow up after the introduction session.' : '',
    utm_source: index % 2 ? 'fixture_referral' : 'fixture_website', utm_medium: 'test', utm_campaign: 'design-proof',
    created_at: new Date(Date.UTC(2026, 7, 31, 12) - index * 3600000).toISOString(),
  };
  if (type === 'member') return { ...common, suburb_town: 'Byron Bay', current_training_level: 'Returning to training',
    main_training_goals: ['Build strength', 'Train consistently'], preferred_training_times: ['Early morning', 'Evening'] };
  if (type === 'trainer') return { ...common, qualifications: 'Certificate IV in Fitness; strength and conditioning experience',
    short_intro: 'Fictional coach with an interest in accessible, well-planned group training.' };
  return { ...common, business_name: `Fictional Recovery Studio ${number}`, profession: 'Exercise physiologist',
    short_intro: 'Fictional local business interested in a collaborative member wellbeing programme.' };
}

export function installLeadData() {
  const tables = {
    member_interest: Array.from({ length: 112 }, (_, index) => lead('member', index)),
    trainer_interest: Array.from({ length: 6 }, (_, index) => lead('trainer', index)),
    partner_interest: Array.from({ length: 5 }, (_, index) => lead('partner', index)),
  };
  return {
    read(name, url) {
      if (!Object.hasOwn(tables, name)) return undefined;
      const params = url.searchParams;
      let rows = tables[name];
      const status = params.get('status');
      if (status?.startsWith('eq.')) rows = rows.filter(row => row.status === status.slice(3));
      const search = /full_name\.ilike\.%([^%]*)%/.exec(params.get('or') || '')?.[1]?.toLowerCase();
      if (search) rows = rows.filter(row => row.full_name.toLowerCase().includes(search) || row.email.toLowerCase().includes(search));
      const total = rows.length;
      const offset = Math.max(0, Number(params.get('offset') || 0));
      const limit = Math.max(0, Number(params.get('limit') || 50));
      const fields = params.get('select')?.split(',').map(field => field.trim());
      rows = rows.slice(offset, offset + limit).map(row => fields && !fields.includes('*')
        ? Object.fromEntries(fields.map(field => [field, row[field] ?? null])) : row);
      return { rows: structuredClone(rows), total, offset };
    },
    leadState(id) {
      if (!tables.member_interest.some(row => row.id === id)) return undefined;
      return { ready: false, configuration_issue: 'Provider handoff is disabled in this read-only design fixture.', current_job: null, link: null };
    },
  };
}
