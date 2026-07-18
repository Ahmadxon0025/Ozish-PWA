import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

/**
 * Server-side tRPC caller for React Server Components.
 * Usage: const data = await api.dashboard.summary();
 */
const createContext = cache(async () => {
  const h = new Headers(headers());
  return createTRPCContext({ headers: h });
});

export const api = createCaller(createContext);
