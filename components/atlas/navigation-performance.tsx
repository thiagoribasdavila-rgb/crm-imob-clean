"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const CRITICAL_ROUTES = [
  "/dashboard",
  "/leads",
  "/pipeline",
  "/tasks",
  "/calendar",
  "/developments",
] as const;

type NavigationSample = {
  fromRoute: string;
  toRoute: string;
  startedAt: number;
};

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const NUMERIC_SEGMENT = /^\d+$/;

function normalizeRoute(pathname: string) {
  const cleanPath = pathname.split(/[?#]/, 1)[0] || "/";
  return cleanPath
    .split("/")
    .map((segment) => UUID_SEGMENT.test(segment) || NUMERIC_SEGMENT.test(segment) ? ":id" : segment.slice(0, 48))
    .join("/")
    .slice(0, 240);
}

async function recordUsage(eventType: "atlas.page_viewed" | "atlas.navigation_completed", payload: Record<string, unknown>) {
  if (navigator.doNotTrack === "1") return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/v3/events/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventType, source: "atlas.web.navigation", aggregateType: "product_usage", payload }),
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    // Telemetria nunca bloqueia a operação comercial.
  }
}

export function NavigationPerformance() {
  const pathname = usePathname();
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);
  const navigationSample = useRef<NavigationSample | null>(null);
  const lastPageView = useRef("");

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
    const route = normalizeRoute(pathname);
    if (lastPageView.current !== route) {
      lastPageView.current = route;
      void recordUsage("atlas.page_viewed", { route });
    }
    const sample = navigationSample.current;
    if (sample && sample.toRoute === route) {
      navigationSample.current = null;
      void recordUsage("atlas.navigation_completed", {
        fromRoute: sample.fromRoute,
        toRoute: sample.toRoute,
        durationMs: Math.max(0, Math.round(performance.now() - sample.startedAt)),
      });
    }
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      navigationSample.current = {
        fromRoute: normalizeRoute(window.location.pathname),
        toRoute: normalizeRoute(destination.pathname),
        startedAt: performance.now(),
      };
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
