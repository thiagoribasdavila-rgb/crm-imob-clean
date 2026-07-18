"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const CRITICAL_ROUTES = [
  "/dashboard",
  "/leads",
  "/pipeline",
  "/tasks",
  "/calendar",
  "/developments",
] as const;

export function NavigationPerformance() {
  const pathname = usePathname();
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    const warmCriticalRoutes = () => {
      for (const href of CRITICAL_ROUTES) router.prefetch(href);
    };
    const windowWithIdle = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (windowWithIdle.requestIdleCallback) {
      const handle = windowWithIdle.requestIdleCallback(warmCriticalRoutes);
      return () => windowWithIdle.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(warmCriticalRoutes, 800);
    return () => window.clearTimeout(handle);
  }, [router]);

  useEffect(() => {
    setNavigating(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      setNavigating(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!navigating) return;
    const timeout = window.setTimeout(() => setNavigating(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [navigating]);

  return (
    <div className="atlas-navigation-feedback" data-visible={navigating ? "true" : "false"}>
      <span className="atlas-navigation-progress" aria-hidden="true" />
      <span className="sr-only" role="status" aria-live="polite">
        {navigating ? "Abrindo a próxima área" : ""}
      </span>
    </div>
  );
}
