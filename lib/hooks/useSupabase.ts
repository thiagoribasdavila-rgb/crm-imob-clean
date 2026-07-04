"use client";

import { useMemo } from "react";
import { getSupabase } from "@/lib/supabase/safeClient";

export function useSupabase() {
  return useMemo(() => getSupabase(), []);
}
