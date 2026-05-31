import cors from "cors";
import express from "express";
import helmet from "helmet";

import { errorHandler } from "./core/middleware/error-handler";
import { authenticationMiddleware } from "./core/middleware/authentication";
import { requestLogger } from "./core/middleware/request-logger";
import { tenantContextMiddleware } from "./core/middleware/tenant-context";
import { authRouter } from "./modules/auth/auth.routes";
import { branchesRouter } from "./modules/branches/branches.routes";
import { healthRouter } from "./modules/health/health.routes";
import { mpesaCallbackRouter } from "./modules/mpesa/mpesa-callback.routes";
import { transactionsRouter } from "./modules/transactions/transactions.routes";

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
  app.use("/businesses", branchesRouter);
  app.use("/businesses", transactionsRouter);

  app.use(errorHandler);

  return app;
}
