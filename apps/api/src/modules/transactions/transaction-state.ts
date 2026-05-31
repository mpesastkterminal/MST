import type { TransactionStatus } from "@mst/shared";

import { conflict } from "../../core/errors/http-error";

const terminalStatuses = new Set<TransactionStatus>([
  "success",
  "failed",
  "reversed"
]);

const allowedTransitions: Record<TransactionStatus, TransactionStatus[]> = {
  pending: ["processing", "failed"],
  processing: ["success", "failed"],
  success: ["reversed"],
  failed: [],
  reversed: []
};

export function isTerminalTransactionStatus(status: TransactionStatus) {
  return terminalStatuses.has(status);
}

export function assertTransactionTransition(
  from: TransactionStatus,
  to: TransactionStatus
) {
  if (from === to) {
    return;
  }

  if (!allowedTransitions[from].includes(to)) {
    throw conflict(
      `Invalid transaction state transition from ${from} to ${to}.`,
      "invalid_transaction_state_transition"
    );
  }
}
