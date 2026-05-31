import { Router } from "express";

import { asyncHandler } from "../../core/http/async-handler";
import { handleStkCallback } from "./stk-callback.service";

export const mpesaCallbackRouter = Router();

mpesaCallbackRouter.post(
  "/stk/:requestId/:callbackToken",
  asyncHandler(async (req, res) => {
    const result = await handleStkCallback(
      String(req.params.requestId),
      String(req.params.callbackToken),
      req.body
    );

    res.status(200).json(result);
  })
);
