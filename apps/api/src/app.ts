import cors from "cors";
import express from "express";
import helmet from "helmet";

import { errorHandler } from "./core/middleware/error-handler";
import { authenticationMiddleware } from "./core/middleware/authentication";
import { requestLogger } from "./core/middleware/request-logger";
import { tenantContextMiddleware } from "./core/middleware/tenant-context";
import { auditRouter, platformAuditRouter } from "./modules/audit/audit.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { branchesRouter } from "./modules/branches/branches.routes";
import { businessesRouter } from "./modules/businesses/businesses.routes";
import {
  dashboardRouter,
  platformDashboardRouter
} from "./modules/dashboard/dashboard.routes";
import { healthRouter } from "./modules/health/health.routes";
import { mpesaCallbackRouter } from "./modules/mpesa/mpesa-callback.routes";
import { mpesaCredentialsRouter } from "./modules/mpesa/mpesa-credentials.routes";
import {
  operationsRouter,
  platformOperationsRouter
} from "./modules/operations/operations.routes";
import {
  platformReportsRouter,
  reportsRouter
} from "./modules/reports/reports.routes";
import { sessionsRouter } from "./modules/sessions/sessions.routes";
import { terminalsRouter } from "./modules/terminals/terminals.routes";
import { transactionsRouter } from "./modules/transactions/transactions.routes";
import { usersRouter } from "./modules/users/users.routes";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? true }));
  app.use(express.json());
  app.use(requestLogger);

  app.use("/health", healthRouter);
  app.use("/mpesa/callback", mpesaCallbackRouter);

  app.use(authenticationMiddleware);
  app.use(tenantContextMiddleware);

  app.use("/auth", authRouter);
  app.use("/platform", platformDashboardRouter);
  app.use("/platform", platformAuditRouter);
  app.use("/platform", platformOperationsRouter);
  app.use("/platform", platformReportsRouter);
  app.use("/businesses", businessesRouter);
  app.use("/businesses", auditRouter);
  app.use("/businesses", branchesRouter);
  app.use("/businesses", dashboardRouter);
  app.use("/businesses", mpesaCredentialsRouter);
  app.use("/businesses", operationsRouter);
  app.use("/businesses", reportsRouter);
  app.use("/businesses", sessionsRouter);
  app.use("/businesses", terminalsRouter);
  app.use("/businesses", transactionsRouter);
  app.use("/businesses", usersRouter);

  app.use(errorHandler);

  return app;
}
