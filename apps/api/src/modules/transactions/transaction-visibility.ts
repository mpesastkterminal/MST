import type { UserContext } from "@mst/shared";

import {
  isBusinessOwner,
  isCashier,
  isSuperAdmin
} from "../../core/security/roles";

type QueryLike<TQuery> = {
  eq(column: string, value: string): TQuery;
};

export function applyTransactionVisibility<TQuery>(
  query: TQuery,
  context: UserContext
): TQuery {
  const scopedQuery = query as QueryLike<TQuery>;

  if (isSuperAdmin(context) || isBusinessOwner(context)) {
    return query;
  }

  if (isCashier(context)) {
    if (context.session?.session_id && context.session.terminal_id) {
      return (scopedQuery.eq(
        "session_id",
        context.session.session_id
      ) as QueryLike<TQuery>).eq("terminal_id", context.session.terminal_id);
    }

    return scopedQuery.eq("session_id", "__missing_session__");
  }

  if (context.branch_id) {
    return scopedQuery.eq("branch_id", context.branch_id);
  }

  return scopedQuery.eq("branch_id", "__missing_branch__");
}
