import { createTRPCRouter, createCallerFactory } from "@/server/api/trpc";
import { dashboardRouter } from "./routers/dashboard";
import { salesRouter } from "./routers/sales";
import { leadsRouter } from "./routers/leads";
import { expensesRouter } from "./routers/expenses";
import { financeRouter } from "./routers/finance";
import { usersRouter } from "./routers/users";
import { tasksRouter } from "./routers/tasks";
import { integrationsRouter } from "./routers/integrations";
import { accountsRouter } from "./routers/accounts";

export const appRouter = createTRPCRouter({
  dashboard: dashboardRouter,
  sales: salesRouter,
  leads: leadsRouter,
  expenses: expensesRouter,
  finance: financeRouter,
  users: usersRouter,
  tasks: tasksRouter,
  integrations: integrationsRouter,
  accounts: accountsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
