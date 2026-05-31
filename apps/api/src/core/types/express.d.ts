import type { AuthContext, RequestContext } from "./request-context";

declare global {
  namespace Express {
    interface Request {
      auth: AuthContext;
      context: RequestContext;
    }
  }
}

export {};
