/**
 * Shared profit-distribution business logic.
 *
 * Rules for expense deduction:
 *  - If profit is null/undefined → expenses do NOT touch capitalReturn
 *  - Expenses reduce profit first; overflow reduces capitalReturn
 */
export function computeExpenseDeduction(
  capitalReturn: number,
  profit: number | null | undefined,
  expenses: number
): { netCapitalReturn: number; netProfit: number | null; fromProfit: number; fromCapital: number } {
  if (profit == null) {
    return { netCapitalReturn: capitalReturn, netProfit: null, fromProfit: 0, fromCapital: 0 };
  }
  const fromProfit = Math.min(expenses, profit);
  const remainder = expenses - fromProfit;
  const fromCapital = Math.min(remainder, capitalReturn);
  return {
    netProfit: profit - fromProfit,
    netCapitalReturn: capitalReturn - fromCapital,
    fromProfit,
    fromCapital,
  };
}
