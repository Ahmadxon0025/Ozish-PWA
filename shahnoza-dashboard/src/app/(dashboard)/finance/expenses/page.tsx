import { redirect } from "next/navigation";

/**
 * The standalone Xarajatlar page was folded into Hisoblar (Kassa): expenses are
 * now recorded and viewed per-account there. This redirect keeps old links and
 * bookmarks working. Access control is enforced at /finance/accounts which has
 * hard owner-only role checks.
 */
export default function ExpensesPage() {
  redirect("/finance/accounts");
}
