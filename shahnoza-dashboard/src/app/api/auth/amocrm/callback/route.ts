import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { exchangeCode } from "@/lib/amocrm/client";

export const dynamic = "force-dynamic";

/**
 * AmoCRM OAuth callback. Verifies state, exchanges the code for tokens, stores
 * them (encrypted), and redirects back to the integrations settings page.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const referer = url.searchParams.get("referer"); // e.g. shahnoza.amocrm.ru
  const errorParam = url.searchParams.get("error");

  const settings = new URL("/settings/integrations", env.APP_URL);

  if (errorParam) {
    settings.searchParams.set("amocrm", "error");
    settings.searchParams.set("message", errorParam);
    return NextResponse.redirect(settings);
  }
  if (!code) {
    settings.searchParams.set("amocrm", "error");
    settings.searchParams.set("message", "missing_code");
    return NextResponse.redirect(settings);
  }

  const expectedState = request.cookies.get("amocrm_oauth_state")?.value;
  if (expectedState && state && expectedState !== state) {
    settings.searchParams.set("amocrm", "error");
    settings.searchParams.set("message", "state_mismatch");
    return NextResponse.redirect(settings);
  }

  const baseDomain = referer || `${env.AMOCRM_SUBDOMAIN}.amocrm.ru`;

  try {
    await exchangeCode({ code, baseDomain });
    settings.searchParams.set("amocrm", "connected");
  } catch (err) {
    settings.searchParams.set("amocrm", "error");
    settings.searchParams.set(
      "message",
      err instanceof Error ? err.message.slice(0, 200) : "exchange_failed",
    );
  }

  const res = NextResponse.redirect(settings);
  res.cookies.delete("amocrm_oauth_state");
  return res;
}
