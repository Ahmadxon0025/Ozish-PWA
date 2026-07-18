import { redirect } from "next/navigation";

/**
 * The standalone Xarajatlar page was folded into Hisoblar (Kassa): expenses are
 * now recorded and viewed per-account there. This redirect keeps old links and
 * bookmarks working instead of 404-ing.
 */
export default function ExpensesPage() {
  redirect("/finance/accounts");
}
