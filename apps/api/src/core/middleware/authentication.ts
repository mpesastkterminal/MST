import type { RequestHandler } from "express";

import { getSupabaseAuthClient } from "../db/supabase";
import { serviceUnavailable, unauthorized } from "../errors/http-error";
import { readHeaderValue } from "../http/read-header";

export const authenticationMiddleware: RequestHandler = async (req, _res, next) => {
  try {
    const authorization = readHeaderValue(req.headers.authorization);

    if (!authorization?.startsWith("Bearer ")) {
      return next(unauthorized("Missing bearer token."));
    }

    const accessToken = authorization.slice("Bearer ".length).trim();

    if (!accessToken) {
      return next(unauthorized("Missing bearer token."));
    }

    const { data, error } = await getSupabaseAuthClient().auth.getUser(accessToken);

    if (error || !data.user) {
      return next(unauthorized("Invalid or expired bearer token."));
    }

    req.auth = {
      access_token: accessToken,
      user_id: data.user.id,
      email: data.user.email ?? null
    };

    return next();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing required")) {
      return next(serviceUnavailable(error.message));
    }

    return next(error);
  }
};
