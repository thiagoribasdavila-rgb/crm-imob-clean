import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "config/operational-ux-phase-002-journeys.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const inputArgument = process.argv.find((argument) => argument.startsWith("--input="));
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Math.round(sorted[index]);
}

function eventType(event) {
  return String(event?.event_type ?? event?.eventType ?? "");
}

function eventPayload(event) {
  return event?.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload
    : {};
}

function readEvents(file) {
  const absolute = path.resolve(root, file);
  const parsed = JSON.parse(fs.readFileSync(absolute, "utf8"));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.events)) return parsed.events;
  throw new Error("O arquivo precisa conter um array ou um objeto com events[].");
}

function roleRouteKey(role, route) {
  return `${role || "unknown"}::${route || "/"}`;
}

const emptyReport = {
  phase: config.phase,
  measuredAt: new Date().toISOString(),
  status: "awaiting-real-sample",
  input: null,
  privacy: {
    directIdentifiersRead: false,
    queryStringsRead: false,
    fieldValuesRead: false,
  },
  totals: {
    events: 0,
    pageViews: 0,
    navigationCompletions: 0,
    routeSessions: 0,
  },
  navigation: {
    medianDurationMs: null,
    p95DurationMs: null,
  },
  routeSessions: {
    medianDurationMs: null,
    p95DurationMs: null,
    medianClicks: null,
    p95Clicks: null,
  },
  byRoleAndRoute: [],
  journeys: config.journeys.map((journey) => ({
    id: journey.id,
    measurementMode: journey.measurementMode,
    startViews: 0,
    navigationCompletions: 0,
    completionRate: null,
    medianNavigationDurationMs: null,
    startRouteSessions: 0,
    medianClicksOnStartRoute: null,
    status: "awaiting-real-sample",
  })),
  conclusion: "Sem amostra real: nenhuma taxa, duração ou quantidade de cliques foi estimada.",
};

let report = emptyReport;

if (inputArgument) {
  const inputFile = inputArgument.slice("--input=".length);
  const allEvents = readEvents(inputFile);
  const allowedTypes = new Set([
    "atlas.page_viewed",
    "atlas.navigation_completed",
    "atlas.route_session_completed",
  ]);
  const events = allEvents.filter((event) => allowedTypes.has(eventType(event)));
  const pageViews = events.filter((event) => eventType(event) === "atlas.page_viewed");
  const navigations = events.filter((event) => eventType(event) === "atlas.navigation_completed");
  const sessions = events.filter((event) => eventType(event) === "atlas.route_session_completed");
  const navigationDurations = navigations
    .map((event) => finiteNumber(eventPayload(event).durationMs))
    .filter((value) => value !== null);
  const sessionDurations = sessions
    .map((event) => finiteNumber(eventPayload(event).durationMs))
    .filter((value) => value !== null);
  const sessionClicks = sessions
    .map((event) => finiteNumber(eventPayload(event).clickCount))
    .filter((value) => value !== null);
  const groupedSessions = new Map();

  for (const event of sessions) {
    const payload = eventPayload(event);
    const role = String(payload.role || "unknown");
    const route = String(payload.route || "/");
    const key = roleRouteKey(role, route);
    const current = groupedSessions.get(key) ?? { role, route, durations: [], clicks: [] };
    const duration = finiteNumber(payload.durationMs);
    const clicks = finiteNumber(payload.clickCount);
    if (duration !== null) current.durations.push(duration);
    if (clicks !== null) current.clicks.push(clicks);
    groupedSessions.set(key, current);
  }

  const journeys = config.journeys.map((journey) => {
    const starts = pageViews.filter((event) => eventPayload(event).route === journey.startRoute);
    const completions = journey.startRoute === journey.endRoute
      ? []
      : navigations.filter((event) => {
        const payload = eventPayload(event);
        return payload.fromRoute === journey.startRoute && payload.toRoute === journey.endRoute;
      });
    const matchingSessions = sessions.filter((event) => eventPayload(event).route === journey.startRoute);
    const matchingClicks = matchingSessions
      .map((event) => finiteNumber(eventPayload(event).clickCount))
      .filter((value) => value !== null);
    const matchingDurations = completions
      .map((event) => finiteNumber(eventPayload(event).durationMs))
      .filter((value) => value !== null);
    const completionRate = journey.startRoute !== journey.endRoute && starts.length
      ? Math.round((completions.length / starts.length) * 1000) / 10
      : null;
    return {
      id: journey.id,
      measurementMode: journey.measurementMode,
      startViews: starts.length,
      navigationCompletions: completions.length,
      completionRate,
      medianNavigationDurationMs: percentile(matchingDurations, 0.5),
      startRouteSessions: matchingSessions.length,
      medianClicksOnStartRoute: percentile(matchingClicks, 0.5),
      status: starts.length || matchingSessions.length ? "sample-observed" : "awaiting-real-sample",
    };
  });

  report = {
    ...emptyReport,
    measuredAt: new Date().toISOString(),
    status: events.length ? "real-sample-measured" : "awaiting-real-sample",
    input: path.relative(root, path.resolve(root, inputFile)).replaceAll(path.sep, "/"),
    totals: {
      events: events.length,
      pageViews: pageViews.length,
      navigationCompletions: navigations.length,
      routeSessions: sessions.length,
    },
    navigation: {
      medianDurationMs: percentile(navigationDurations, 0.5),
      p95DurationMs: percentile(navigationDurations, 0.95),
    },
    routeSessions: {
      medianDurationMs: percentile(sessionDurations, 0.5),
      p95DurationMs: percentile(sessionDurations, 0.95),
      medianClicks: percentile(sessionClicks, 0.5),
      p95Clicks: percentile(sessionClicks, 0.95),
    },
    byRoleAndRoute: [...groupedSessions.values()]
      .map((group) => ({
        role: group.role,
        route: group.route,
        sessions: group.durations.length,
        medianDurationMs: percentile(group.durations, 0.5),
        medianClicks: percentile(group.clicks, 0.5),
      }))
      .sort((left, right) => left.role.localeCompare(right.role) || left.route.localeCompare(right.route)),
    journeys,
    conclusion: events.length
      ? "Amostra real agregada. Jornadas na mesma rota continuam sem alegação de conclusão até existir evento de domínio."
      : emptyReport.conclusion,
  };
}

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputArgument) {
  const outputFile = path.resolve(root, outputArgument.slice("--output=".length));
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, serialized);
}
process.stdout.write(serialized);
