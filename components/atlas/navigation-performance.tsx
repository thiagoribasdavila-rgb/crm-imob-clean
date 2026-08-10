"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const CRITICAL_ROUTES = [
  "/dashboard",
  "/leads",
  "/pipeline",
  "/tasks",
  "/calendar",
  "/developments",
] as const;

const ACTION_SELECTOR = [
  "a[href]",
  "button",
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  "select",
  "summary",
].join(",");
const MAX_ROUTE_SESSION_MS = 30 * 60 * 1000;
const EXPERIENCE_VERSION = "atlas-v30-phase-59";

type UsageEventType =
  | "atlas.page_viewed"
  | "atlas.navigation_completed"
  | "atlas.route_session_completed";

type CommercialRole =
  | "director"
  | "superintendent"
  | "manager"
  | "broker"
  | "unknown";

type NavigationSample = {
  fromRoute: string;
  toRoute: string;
  startedAt: number;
};

type RouteSession = {
  route: string;
  role: CommercialRole;
  startedAt: number;
  clickCount: number;
  internalNavigationCount: number;
  submitIntentCount: number;
  errorCount: number;
  maxScrollDepthPercent: number;
  completionCount: number;
  decisionQualityRatings: number[];
  controlCounts: {
    link: number;
    button: number;
    selection: number;
    other: number;
  };
};

type RouteSessionExitReason = "navigation" | "hidden" | "pagehide";

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

function normalizeCommercialRole(role?: string): CommercialRole {
  const normalized = String(role || "").trim().toLowerCase();
  if (["director", "diretor", "director_decisor"].includes(normalized)) return "director";
  if (["superintendent", "superintendente"].includes(normalized)) return "superintendent";
  if (["manager", "gerente"].includes(normalized)) return "manager";
  if (["broker", "corretor"].includes(normalized)) return "broker";
  return "unknown";
}

function createRouteSession(route: string, role: CommercialRole): RouteSession {
  return {
    route,
    role,
    startedAt: performance.now(),
    clickCount: 0,
    internalNavigationCount: 0,
    submitIntentCount: 0,
    errorCount: 0,
    maxScrollDepthPercent: 0,
    completionCount: 0,
    decisionQualityRatings: [],
    controlCounts: { link: 0, button: 0, selection: 0, other: 0 },
  };
}

function controlKind(element: Element): keyof RouteSession["controlCounts"] {
  if (element instanceof HTMLAnchorElement) return "link";
  if (element instanceof HTMLSelectElement) return "selection";
  if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) return "selection";
  if (element instanceof HTMLButtonElement || element.getAttribute("role") === "button") return "button";
  return "other";
}

function isDisabledControl(element: Element) {
  if (element.getAttribute("aria-disabled") === "true") return true;
  return (
    (element instanceof HTMLButtonElement
      || element instanceof HTMLInputElement
      || element instanceof HTMLSelectElement)
    && element.disabled
  );
}

async function recordUsage(eventType: UsageEventType, payload: Record<string, unknown>) {
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

export function NavigationPerformance({ role }: { role?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);
  const navigationSample = useRef<NavigationSample | null>(null);
  const routeSession = useRef<RouteSession | null>(null);
  const currentRole = useRef<CommercialRole>(normalizeCommercialRole(role));
  const lastPageView = useRef("");

  useEffect(() => {
    currentRole.current = normalizeCommercialRole(role);
    if (routeSession.current && currentRole.current !== "unknown") {
      routeSession.current.role = currentRole.current;
    }
  }, [role]);

  const flushRouteSession = useCallback((exitReason: RouteSessionExitReason) => {
    const session = routeSession.current;
    if (!session) return;
    routeSession.current = null;
    const rawDurationMs = Math.max(0, Math.round(performance.now() - session.startedAt));
    const durationMs = Math.min(rawDurationMs, MAX_ROUTE_SESSION_MS);
    const decisionQualityAverage = session.decisionQualityRatings.length
      ? session.decisionQualityRatings.reduce((sum, value) => sum + value, 0) / session.decisionQualityRatings.length
      : null;
    void recordUsage("atlas.route_session_completed", {
      route: session.route,
      role: session.role,
      durationMs,
      durationClamped: rawDurationMs > MAX_ROUTE_SESSION_MS,
      clickCount: session.clickCount,
      internalNavigationCount: session.internalNavigationCount,
      submitIntentCount: session.submitIntentCount,
      experienceVersion: EXPERIENCE_VERSION,
      measurementCohort: "after",
      errorCount: session.errorCount,
      maxScrollDepthPercent: session.maxScrollDepthPercent,
      readEngaged: durationMs >= 8_000 && session.maxScrollDepthPercent >= 25,
      completionCount: session.completionCount,
      decisionQualityAverage,
      controlCounts: session.controlCounts,
      exitReason,
    });
  }, []);

  useEffect(() => {
    let frame = 0;
    const measureScroll = () => {
      frame = 0;
      const session = routeSession.current;
      if (!session) return;
      const available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const depth = Math.min(100, Math.max(0, Math.round((window.scrollY / available) * 100)));
      session.maxScrollDepthPercent = Math.max(session.maxScrollDepthPercent, depth);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(measureScroll); };
    const onError = () => { if (routeSession.current) routeSession.current.errorCount += 1; };
    const onTaskCompleted = (event: Event) => {
      const session = routeSession.current;
      if (!session) return;
      session.completionCount += 1;
      const rating = Number((event as CustomEvent<{ decisionQualityRating?: number }>).detail?.decisionQualityRating);
      if (Number.isInteger(rating) && rating >= 1 && rating <= 5) session.decisionQualityRatings.push(rating);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onError);
    window.addEventListener("atlas:operational-task-completed", onTaskCompleted);
    measureScroll();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onError);
      window.removeEventListener("atlas:operational-task-completed", onTaskCompleted);
    };
  }, []);

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
    if (routeSession.current && routeSession.current.route !== route) {
      flushRouteSession("navigation");
    }
    if (!routeSession.current) {
      routeSession.current = createRouteSession(route, currentRole.current);
    }
    if (lastPageView.current !== route) {
      lastPageView.current = route;
      void recordUsage("atlas.page_viewed", { route, role: currentRole.current });
    }
    const sample = navigationSample.current;
    if (sample && sample.toRoute === route) {
      navigationSample.current = null;
      void recordUsage("atlas.navigation_completed", {
        fromRoute: sample.fromRoute,
        toRoute: sample.toRoute,
        role: currentRole.current,
        durationMs: Math.max(0, Math.round(performance.now() - sample.startedAt)),
      });
    }
  }, [flushRouteSession, pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const source = event.target instanceof Element ? event.target : null;
      const action = source?.closest(ACTION_SELECTOR) ?? null;
      if (action && !isDisabledControl(action) && routeSession.current) {
        const kind = controlKind(action);
        routeSession.current.clickCount += 1;
        routeSession.current.controlCounts[kind] += 1;
      }

      const target = source?.closest<HTMLAnchorElement>("a[href]") ?? null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (
        destination.origin !== window.location.origin
        || destination.pathname === window.location.pathname
      ) return;
      if (routeSession.current) routeSession.current.internalNavigationCount += 1;
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
    const onSubmit = () => {
      if (routeSession.current) routeSession.current.submitIntentCount += 1;
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  useEffect(() => {
    const onPageHide = () => flushRouteSession("pagehide");
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushRouteSession("hidden");
      } else if (!routeSession.current) {
        routeSession.current = createRouteSession(
          normalizeRoute(window.location.pathname),
          currentRole.current,
        );
      }
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [flushRouteSession]);

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
