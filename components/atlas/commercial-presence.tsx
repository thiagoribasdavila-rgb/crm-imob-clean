"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function CommercialPresence() {
  useEffect(() => {
    let active = true;
    async function heartbeat() {
      if (!active || document.visibilityState === "hidden") return;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch("/api/v1/crm/distribution", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat", availability: "available" }),
      }).catch(() => undefined);
    }
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 30_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void heartbeat(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return null;
}
