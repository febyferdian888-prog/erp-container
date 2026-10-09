/**
 * Single source of truth for project/order profitability (Tahap 3). Mirrors
 * the design lesson from lib/invoice-money.ts: never let two screens compute
 * the same number two different ways.
 *
 * Cost sources, each counted exactly once:
 * - actualCost: vendor Bills already received against this project's POs,
 *   plus approved Reimbursements tagged to the project. A Bill is the real
 *   incurred cost; the PO that produced it is not counted again.
 * - committedCost: the remaining un-billed value of this project's still-open
 *   POs (PO total minus bills already raised against that same PO). This is
 *   money committed but not yet an actual cost.
 * - estimatedCostToComplete (ETC): a manual PIC estimate (Project.estimatedCostToComplete).
 *   Nothing in the transaction data can predict unstarted work, so this is
 *   never guessed — null means "not entered yet" and the caller must say so.
 *
 * Change orders: only status="approved" rows ever move contractValue or
 * budget. Pending/rejected ones are tracked (visible on the project) but
 * never silently change the money — see ChangeOrder model comment.
 */

export interface ProjectPO {
  id: string;
  poNumber: string;
  status: string;
  itemsSubtotal: number; // pre-tax PO value
  billedSubtotal: number; // pre-tax sum of bills raised against this PO
}

export interface ApprovedChangeOrder {
  valueImpact: number;
  budgetImpact: number;
}

export interface ProjectFinancialsInput {
  budget: number;
  contractValue: number | null; // from linked SalesOrder items, pre-tax
  estimatedCostToComplete: number | null;
  pos: ProjectPO[];
  unlinkedBillsSubtotal: number; // bills tied to the project's SalesOrder but not to any of its POs (e.g. direct project costs)
  approvedReimbursements: number;
  approvedChangeOrders: ApprovedChangeOrder[];
  invoicedRevenue: number; // sum of grandTotal of invoices linked to the project's SalesOrder
  cashInReceived: number; // sum of actual cash collected (paidAmount - pphAmount) on those invoices
  cashOutPaid: number; // sum of actual cash paid (paidAmount - pphAmount) on the project's bills
}

export interface ProjectFinancials {
  contractValue: number | null;
  baseContractValue: number | null; // contract value before change orders
  budget: number;
  baseBudget: number; // budget before change orders
  changeOrderValueTotal: number;
  changeOrderBudgetTotal: number;
  actualCost: number;
  committedCost: number;
  estimatedCostToComplete: number | null;
  estimatedFinalCost: number | null; // null when ETC has not been entered
  estimatedMargin: number | null;
  estimatedMarginPercent: number | null;
  budgetDeviation: number; // (estimatedFinalCost ?? actualCost + committedCost) - budget
  hasCostData: boolean; // any bill/reimbursement/PO recorded at all
  isFinal: boolean; // true only once ETC is entered — everything else is a running/partial view
  invoicedRevenue: number;
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeProjectFinancials(input: ProjectFinancialsInput): ProjectFinancials {
  const billedFromPOs = input.pos.reduce((s, po) => s + po.billedSubtotal, 0);
  const actualCost = round2(billedFromPOs + input.unlinkedBillsSubtotal + input.approvedReimbursements);
  const committedCost = round2(
    input.pos.reduce((s, po) => {
      if (po.status === "cancelled") return s;
      const remaining = po.itemsSubtotal - po.billedSubtotal;
      return s + Math.max(0, remaining);
    }, 0)
  );

  const changeOrderValueTotal = round2(input.approvedChangeOrders.reduce((s, c) => s + c.valueImpact, 0));
  const changeOrderBudgetTotal = round2(input.approvedChangeOrders.reduce((s, c) => s + c.budgetImpact, 0));
  const contractValue = input.contractValue !== null ? round2(input.contractValue + changeOrderValueTotal) : null;
  const budget = round2(input.budget + changeOrderBudgetTotal);

  const hasCostData = input.pos.length > 0 || input.unlinkedBillsSubtotal > 0 || input.approvedReimbursements > 0;
  const etc = input.estimatedCostToComplete;
  const estimatedFinalCost = etc !== null ? round2(actualCost + committedCost + etc) : null;
  const estimatedMargin = estimatedFinalCost !== null && contractValue !== null ? round2(contractValue - estimatedFinalCost) : null;
  const estimatedMarginPercent = estimatedMargin !== null && contractValue ? round2((estimatedMargin / contractValue) * 10000) / 100 : null;
  const budgetDeviation = round2((estimatedFinalCost ?? actualCost + committedCost) - budget);

  const cashIn = round2(input.cashInReceived);
  const cashOut = round2(input.cashOutPaid);

  return {
    contractValue,
    baseContractValue: input.contractValue !== null ? round2(input.contractValue) : null,
    budget,
    baseBudget: round2(input.budget),
    changeOrderValueTotal,
    changeOrderBudgetTotal,
    actualCost,
    committedCost,
    estimatedCostToComplete: etc !== null ? round2(etc) : null,
    estimatedFinalCost,
    estimatedMargin,
    estimatedMarginPercent,
    budgetDeviation,
    hasCostData,
    isFinal: etc !== null,
    invoicedRevenue: round2(input.invoicedRevenue),
    cashIn,
    cashOut,
    netCashFlow: round2(cashIn - cashOut),
  };
}
