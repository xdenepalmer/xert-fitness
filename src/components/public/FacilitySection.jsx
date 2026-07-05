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

export default function FacilitySection() {
  return (
    <section id="facility" className="py-20 px-6" style={{ backgroundColor: '#101820' }}>
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 items-start">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
              <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>Facility</span>
            </div>

            <h2
              className="font-display uppercase mb-6"
              style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', lineHeight: 0.95, color: '#F1F3F4' }}
            >
              Built for coached<br />
              <span style={{ color: '#7BA7BC' }}>performance.</span>
            </h2>

            <p className="font-body leading-relaxed mb-6" style={{ color: 'rgba(209,221,230,0.72)' }}>
              XERT combines a main class training area with a dedicated accessory space so members can build strength, conditioning and recovery around their goals.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3 mb-6">
              {facilityStats.map(stat => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="flex items-center gap-4 border p-4" style={{ borderColor: 'rgba(123,167,188,0.16)', backgroundColor: 'rgba(50,72,90,0.14)' }}>
                    <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ backgroundColor: '#7BA7BC' }}>
                      <Icon className="w-5 h-5" style={{ color: '#101820' }} />
                    </div>
                    <div>
                      <p className="font-body text-xs uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.45)' }}>{stat.label}</p>
                      <p className="font-display text-xl uppercase text-xert-offwhite leading-none mt-1">{stat.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border p-5" style={{ borderColor: 'rgba(123,167,188,0.18)', backgroundColor: 'rgba(123,167,188,0.08)' }}>
              <div className="flex items-start gap-4">
                <CalendarDays className="w-6 h-6 shrink-0 mt-1" style={{ color: '#7BA7BC' }} />
                <div>
                  <p className="font-display text-xl uppercase text-xert-offwhite mb-2">Yearly Event Tracker</p>
                  <p className="font-body text-sm leading-relaxed" style={{ color: 'rgba(209,221,230,0.65)' }}>
                    A visual 12-month fitness planner tracks South East Queensland events so members can train, plan and build toward shared goals.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {equipmentGroups.map(group => {
                const Icon = group.icon;
                return (
                  <article key={group.label} className="border p-5 min-h-[11rem] flex flex-col" style={{ borderColor: 'rgba(123,167,188,0.14)', backgroundColor: 'rgba(50,72,90,0.14)' }}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-9 h-9 flex items-center justify-center" style={{ backgroundColor: 'rgba(123,167,188,0.14)' }}>
                        <Icon className="w-5 h-5" style={{ color: '#7BA7BC' }} />
                      </div>
                      <h3 className="font-display text-xl uppercase text-xert-offwhite leading-none">{group.label}</h3>
                    </div>
                    <p className="font-body text-sm leading-relaxed mt-auto" style={{ color: 'rgba(209,221,230,0.62)' }}>{group.items}</p>
                  </article>
                );
              })}
            </div>

            <p className="font-body text-sm leading-relaxed mt-5" style={{ color: 'rgba(209,221,230,0.45)' }}>
              Onsite parking, bathroom and changeroom access are planned as part of the member experience.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
