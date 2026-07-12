import { createClient } from "@/utils/supabase/server";
import type { AtlasDataContext } from "./types";
import { assertAtlasDataContext } from "./permissions";

export async function getAtlasSupabase(context: AtlasDataContext) {
  assertAtlasDataContext(context);

  const supabase = await createClient();

  return {
    supabase,
    organizationId: context.organizationId,
    userId: context.userId,
  };
}
