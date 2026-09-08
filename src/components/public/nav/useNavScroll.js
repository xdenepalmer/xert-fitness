import { useEffect } from 'react';

export default function useNavScroll() {
  useEffect(() => {
    const root = document.documentElement;
    let frame;
    const update = () => {
      frame = null;
      root.style.setProperty('--public-nav-collapse', String(Math.min(1, Math.max(0, window.scrollY / 96))));
      const total = root.scrollHeight - window.innerHeight;
      root.style.setProperty('--public-page-progress', String(total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0));
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
    };
  }, []);
}
