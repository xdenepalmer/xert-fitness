import React from 'react';
import { Activity, Bike, Building2, CalendarDays, Dumbbell, HeartPulse, MapPin, ShieldCheck, Zap } from 'lucide-react';

const facilityStats = [
  { label: 'Location', value: 'Kingaroy QLD 4610', icon: MapPin },
  { label: 'Facility Size', value: '200sqm+', icon: Building2 },
  { label: 'Training Areas', value: 'Class + accessory', icon: Activity },
];

const equipmentGroups = [
  {
    label: 'Conditioning',
    icon: Bike,
    items: 'Concept2 rowers, bike ergs, ski erg and Rogue Echo bikes.',
  },
  {
    label: 'Strength',
    icon: Dumbbell,
    items: 'Power racks, squat stands, dumbbells, barbells, bumper plates and specialty bars.',
  },
  {
    label: 'Power',
    icon: Zap,
    items: 'Wallballs, kettlebells, soft plyometric boxes, heavy sandbags and skipping ropes.',
  },
  {
    label: 'Gymnastics',
    icon: Activity,
    items: 'Ab mats, rings, crash mats, pull-up stations, vertical rope climbs and ab wheels.',
  },
  {
    label: 'Accessory',
    icon: HeartPulse,
    items: 'Bands, foam rollers, trigger point balls, ankle mobilisers, weighted vests and benches.',
  },
  {
    label: 'Facility Support',
    icon: ShieldCheck,
    items: 'First aid and AED, sanitary equipment, change room, air conditioning, fans and workout displays.',
  },
];

const SOLID_TILE = { backgroundColor: '#7BA7BC', color: '#101820' };

export default function FacilitySection() {
  return (
    <section id="facility" className="bg-xert-navy px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="h-px w-6 bg-xert-steel" />
              <span className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">Facility</span>
            </div>

            <h2
              className="mb-6 font-display uppercase text-xert-offwhite"
              style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', lineHeight: 0.95 }}
            >
              Built for coached<br />
              <span className="text-xert-steel">performance.</span>
            </h2>

            <p className="mb-6 max-w-[44ch] font-body leading-relaxed text-xert-pale/75">
              XERT combines a main class training area with a dedicated accessory space so members can build strength, conditioning and recovery around their goals.
            </p>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {facilityStats.map(stat => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="xert-card-flat flex items-center gap-4 p-4">
                    <div className="xert-icon-tile" style={SOLID_TILE}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-body text-xs uppercase tracking-wider text-xert-pale/50">{stat.label}</p>
                      <p className="mt-1 font-display text-xl uppercase leading-none text-xert-offwhite">{stat.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="xert-card-accent p-5">
              <div className="flex items-start gap-4">
                <div className="xert-icon-tile">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <p className="mb-2 font-display text-xl uppercase text-xert-offwhite">Yearly Event Tracker</p>
                  <p className="font-body text-sm leading-relaxed text-xert-pale/70">
                    A visual 12-month fitness planner tracks South East Queensland events so members can train, plan and build toward shared goals.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {equipmentGroups.map(group => {
                const Icon = group.icon;
                return (
                  <article key={group.label} className="xert-card flex flex-col p-5">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="xert-icon-tile">
                        <Icon className="w-5 h-5" />
                      </div>
                      <h3 className="font-display text-xl uppercase leading-none text-xert-offwhite">{group.label}</h3>
                    </div>
                    <p className="font-body text-sm leading-relaxed text-xert-pale/65">{group.items}</p>
                  </article>
                );
              })}
            </div>

            <p className="mt-5 font-body text-sm leading-relaxed text-xert-pale/50">
              Onsite parking, bathroom and changeroom access are planned as part of the member experience.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
