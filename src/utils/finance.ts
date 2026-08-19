export function isInflow(transaction: { type?: string; status?: string }) {
  return (
    (transaction.type === "deposit" || transaction.type === "reverse") &&
    transaction.status !== "failed"
  );
}

export function isOutflow(transaction: { type?: string; status?: string }) {
  return (
    (transaction.type === "withdraw" || transaction.type === "debit") &&
    transaction.status !== "failed"
  );
}

export function sumBy(
  transactions: Array<{ type?: string; status?: string; amount?: number }>,
  predicate: (transaction: { type?: string; status?: string; amount?: number }) => boolean
) {
  return transactions
    .filter(predicate)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
}
