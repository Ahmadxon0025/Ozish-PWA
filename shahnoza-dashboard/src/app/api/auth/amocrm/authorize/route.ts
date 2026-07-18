import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { env, isAmocrmConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Kick off the AmoCRM OAuth flow. Redirects the account admin to amoCRM's
 * consent screen; amo redirects back to /api/auth/amocrm/callback with a code.
 */
export async function GET() {
  if (!isAmocrmConfigured()) {
    return NextResponse.json(
      { error: "AmoCRM not configured (AMOCRM_CLIENT_ID / SUBDOMAIN)." },
      { status: 412 },
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const authorizeUrl = new URL("https://www.amocrm.ru/oauth");
  authorizeUrl.searchParams.set("client_id", env.AMOCRM_CLIENT_ID);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("mode", "post_message");

  const res = NextResponse.redirect(authorizeUrl.toString());
  // CSRF: remember the state for the callback to verify.
  res.cookies.set("amocrm_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
