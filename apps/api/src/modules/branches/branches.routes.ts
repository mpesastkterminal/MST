import { Router } from "express";
import { Permission } from "@mst/shared";

import { createUserSupabaseClient } from "../../core/db/supabase";
import { asyncHandler } from "../../core/http/async-handler";
import {
  enforceBusinessParam,
  requirePermission
} from "../../core/middleware/permissions";
import { serviceUnavailable } from "../../core/errors/http-error";

export const branchesRouter = Router({ mergeParams: true });

branchesRouter.get(
  "/:businessId/branches",
  enforceBusinessParam,
  requirePermission(Permission.BranchesRead),
  asyncHandler(async (req, res) => {
    const db = createUserSupabaseClient(req.auth.access_token);
    let query = db
      .from("branches")
      .select("id,business_id,name,code,status,created_at")
      .eq("business_id", req.context.user.business_id)
      .order("created_at", { ascending: false });

    if (req.context.user.branch_id) {
      query = query.eq("id", req.context.user.branch_id);
    }

    const { data, error } = await query;

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({ branches: data ?? [] });
  })
);
