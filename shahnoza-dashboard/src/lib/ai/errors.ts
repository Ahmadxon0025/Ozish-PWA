import "server-only";

/**
 * Central handling for AI failures so end users never see a raw provider error
 * (e.g. "Your credit balance is too low"). Two user-facing lines in Uzbek:
 *  - AI_UNAVAILABLE_UZ for the "can't run, not your fault, try later" class
 *    (out-of-credit / billing, quota, rate limit, overload, auth/config)
 *  - AI_ERROR_UZ for any other AI failure (a generic, safe fallback)
 */

export const AI_UNAVAILABLE_UZ =
  "AI vaqtincha ishlamayapti, birozdan keyin urinib ko'ring.";

export const AI_ERROR_UZ =
  "Kechirasiz, AI javob bera olmadi. Qayta urinib ko'ring.";

/**
 * True for provider errors where the AI is temporarily unavailable for a reason
 * the user can't fix and must not see raw: billing / out-of-credit, quota,
 * rate limit, overload, or auth/config problems.
 */
export function isAiUnavailableError(err: unknown): boolean {
  const e = err as
    | {
        status?: number;
        statusCode?: number;
        error?: { message?: string; type?: string };
        message?: string;
      }
    | null
    | undefined;
  const status = e?.status ?? e?.statusCode;
  const msg = String(e?.message ?? e?.error?.message ?? "").toLowerCase();
  const type = String(e?.error?.type ?? "").toLowerCase();

  // Hard HTTP signals from the Anthropic API.
  // 402 billing, 401/403 auth, 429 rate limit, 529 overloaded.
  if (
    status === 401 ||
    status === 402 ||
    status === 403 ||
    status === 429 ||
    status === 529
  ) {
    return true;
  }
  // "credit balance too low" arrives as a 400 invalid_request_error — match text.
  if (
    /credit balance|too low|billing|insufficient|quota|rate.?limit|overloaded|capacity/.test(
      msg,
    )
  ) {
    return true;
  }
  if (/overloaded|rate_limit|authentication|permission/.test(type)) return true;
  return false;
}

/**
 * A safe, user-facing message for ANY AI failure — never leaks raw provider
 * text. Use at conversational surfaces (Alfred web + Telegram, the brain).
 */
export function safeAiMessage(err: unknown): string {
  return isAiUnavailableError(err) ? AI_UNAVAILABLE_UZ : AI_ERROR_UZ;
}

/**
 * Normalize a caught AI error for rethrow. Unavailable-class errors become a
 * friendly Error (so any caller that surfaces `.message` shows the Uzbek line);
 * other errors are preserved for debugging. Logs the real error server-side.
 */
export function normalizeAiError(err: unknown): Error {
  if (isAiUnavailableError(err)) {
    console.error("AI unavailable:", err instanceof Error ? err.message : err);
    return new Error(AI_UNAVAILABLE_UZ);
  }
  return err instanceof Error ? err : new Error(String(err ?? "AI xatosi"));
}
