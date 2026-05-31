import type { ErrorRequestHandler } from "express";

import { HttpError } from "../errors/http-error";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  console.error(error);

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        request_id: req.context?.request_id
      }
    });
    return;
  }

  res.status(500).json({
    error: {
      code: "internal_server_error",
      message: "Something went wrong.",
      request_id: req.context?.request_id
    }
  });
};
