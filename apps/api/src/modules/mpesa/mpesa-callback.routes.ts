import { Router } from "express";

export const mpesaCallbackRouter = Router();

mpesaCallbackRouter.post("/stk/:requestId", (req, res) => {
  res.status(202).json({
    status: "accepted",
    request_id: req.params.requestId,
    message: "Callback received. Full reconciliation is deferred to Phase 3."
  });
});
