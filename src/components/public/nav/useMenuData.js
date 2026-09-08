import { useEffect, useState } from 'react';
import { getClassSessions, getSoftLaunchSettings } from '@/lib/adminData';
import { getPublicClassAvailability } from '@/lib/submitForms';
import { getMyBookings } from '@/lib/bookingData';
import { fetchSiteContent } from '@/lib/siteContent';
import { CONTACT_DEFAULTS } from '@/lib/contentDefaults';

export default function useMenuData(userId) {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState(null);
  useEffect(() => {
    let active = true;
    setData(null);
    Promise.allSettled([
      Promise.all([getClassSessions(true), getPublicClassAvailability(), getSoftLaunchSettings()]),
      userId ? getMyBookings() : Promise.resolve([]),
      fetchSiteContent('contact'),
    ]).then(([classes, bookings, contact]) => {
      if (!active) return;
      setData({
        userId,
        classes: classes.status === 'fulfilled' ? classes.value : null,
        bookings: bookings.status === 'fulfilled' ? bookings.value : null,
        contact: { ...CONTACT_DEFAULTS, ...(contact.status === 'fulfilled' ? contact.value : null) },
      });
    });
    return () => { active = false; };
  }, [userId, attempt]);
  return { data: data?.userId === userId ? data : null, retry: () => setAttempt(value => value + 1) };
}
