import "server-only";
import { buildDailyFinanceReport } from "./finance-reports";
import { sendMessage, financeGroupId } from "./bot";

export { buildDailyFinanceReport as buildDailyReport };

export async function sendDailyReport(): Promise<{
  sent: boolean;
  text: string;
}> {
  const text = await buildDailyFinanceReport();
  const fgId = financeGroupId();
  const ok = fgId ? (await sendMessage(fgId, text)) !== null : false;
  return { sent: ok, text };
}
