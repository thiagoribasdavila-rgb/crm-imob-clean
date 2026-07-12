"use client";

import { track } from "@vercel/analytics";

type AtlasEventValue = string | number | boolean | null | undefined;
type AtlasEventProperties = Record<string, AtlasEventValue>;

export function trackAtlasEvent(name: string, properties: AtlasEventProperties = {}) {
  try {
    const safeProperties: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (value !== null && value !== undefined) safeProperties[key] = value;
    }
    track(name, safeProperties);
  } catch {
    // Analytics must never block product flows.
  }
}
