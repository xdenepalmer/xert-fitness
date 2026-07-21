import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const getHashId = (hash) => {
  const rawId = hash.slice(1);

  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
};

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;

    if (hash) {
      const id = getHashId(hash);
      const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
      let settled = false;

      const scrollToTarget = () => {
        const target = document.getElementById(id);
        if (!target) return false;
        target.scrollIntoView({ behavior, block: "start" });
        settled = true;
        return true;
      };

      // Lazy routes and authenticated account sections can render after the
      // first frame. Keep watching briefly so notification/deep-link returns
      // still land on the requested content during a cold launch.
      if (scrollToTarget()) return undefined;

      const observer = new MutationObserver(() => {
        if (scrollToTarget()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });

      const frame = window.requestAnimationFrame(() => {
        if (scrollToTarget()) observer.disconnect();
      });
      const timeout = window.setTimeout(() => {
        if (!settled) scrollToTarget();
        observer.disconnect();
      }, 5000);

      return () => {
        observer.disconnect();
        window.cancelAnimationFrame(frame);
        window.clearTimeout(timeout);
      };
    }

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);

  return null;
}
