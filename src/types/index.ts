export type Language = 'ar' | 'en';
export type UserRole = 'manager' | 'staff';

export type PageKey =
  | 'dashboard' | 'inventory' | 'carLoading' | 'sales' | 'customers'
  | 'payments' | 'expenses' | 'salaries' | 'generalTransfers'
  | 'accountTransfers' | 'ledger' | 'reports' | 'capital' | 'auditLog' | 'settings';

export interface PagePermission {
  pageKey: PageKey;
  canView: boolean;
  canWrite: boolean;
}

export interface Role {
  id: string;
  name: string;
  nameEn: string;
  permissions: PagePermission[];
  isSalesperson: boolean;
  isDefault?: boolean;
}

export interface User {
  id: string;
  name: string;
  username: string;
  password: string;
  roleId: string;
  salespersonId?: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  name: string;
}

export interface Salesperson {
  id: string;
  name: string;
}

export interface City {
  id: string;
  name: string;
}

export interface Car {
  id: string;
  name: string;
}

export interface BankAccount {
  id: string;
  name: string;
  transferFee: number;
  balance?: number;
}

export interface Shipment {
  id: string;
  name: string;
  isClosed?: boolean;                // true = finalized, no edits allowed (synced to cloud)
  shareholdersPercent?: number;      // % of gross profit going to shareholders (e.g. 40)
  managementFeePercent?: number;     // % of partners' share going as management fee (e.g. 20)
  managementFeeRecipientId?: string; // operating partner who receives the management fee
}

export interface Employee {
  id: string;
  name: string;
  phone?: string;
  jobTitle?: string;
}

export interface Partner {
  id: string;
  name: string;
  isOperatingPartner?: boolean;
}

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface Customer {
  id: string;
  name: string;
  cityId: string;
  salespersonId: string;
  carId: string;
  phone: string;
  notes: string;
  debt?: number;
}

export interface InventoryTransaction {
  id: string;
  date: string;
  shipmentId: string;
  productId: string;
  type: 'receive' | 'load' | 'transfer' | 'sell' | 'return' | 'shipment_transfer';
  fromLocation: 'warehouse' | string; // string is carId
  toLocation: 'warehouse' | string; // string is carId
  qty: number;
  referenceId?: string; // invoiceId, etc.
  invoiceId?: string;
  fromShipmentId?: string; // for inter-shipment transfers
  toShipmentId?: string; // for inter-shipment transfers
  notes?: string;
}

export interface InvoiceLine {
  productId: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  date: string;
  customerId: string;
  salespersonId: string;
  cityId: string;
  carId: string;
  shipmentId: string;
  lines: InvoiceLine[];
  total: number;
  paymentType: 'cash' | 'credit';
  bankAccountId?: string; // if cash
}

export interface Payment {
  id: string;
  date: string;
  customerId: string;
  salespersonId?: string;
  cityId?: string;
  shipmentId: string;
  bankAccountId: string;
  amount: number;
  notes: string;
}

export interface Expense {
  id: string;
  date: string;
  categoryId: string;
  description: string;
  amount: number;
  bankAccountId: string;
  shipmentId: string;
  carId?: string;
  notes: string;
  settled?: boolean;
  settledDate?: string;
  partnerId?: string; // optional: partner to whom this expense is attributed for profit distribution
}

export interface Salary {
  id: string;
  date: string;
  shipmentId: string;
  employeeId: string;
  type: 'salary' | 'allowance';
  bankAccountId: string;
  month: string;
  amount: number;
  notes: string;
}

export type GeneralTransferType = 'capital' | 'capital_contribution' | 'capital_return' | 'drawings' | 'profit_payment';

export interface GeneralTransfer {
  id: string;
  date: string;
  description: string;
  shipmentId: string;
  partnerId: string;
  transferType?: GeneralTransferType;
  beneficiaryPartnerId?: string; // for capital type: the investor/partner
  amountSDG: number;
  exchangeRate: number;
  amountSAR: number;
  splits: { bankAccountId: string; amount: number }[];
}

export interface AccountTransfer {
  id: string;
  date: string;
  type: 'transfer' | 'opening_balance';
  fromBankAccountId?: string;
  toBankAccountId: string;
  amount: number;
  transferFee: number;
  notes: string;
}

export interface LedgerEntry {
  id: string;
  date: string;
  fromAccount?: string;
  toAccount?: string;
  description: string;
  amountIn: number;
  amountOut: number;
  sourceModule: 'payment' | 'expense' | 'salary' | 'general_transfer' | 'account_transfer' | 'sale_cash' | 'shipment_transfer';
  linkedId: string;
  referenceId?: string;
  invoiceId?: string;
  shipmentId?: string;
}

export interface CapitalContribution {
  id: string;
  partnerId: string;
  shipmentId: string;
  amountSAR: number;
  date: string;
  notes?: string;
  profitRate?: number; // optional per-investor profit rate (e.g. 3 = 3%). Pool is split by capital × profitRate weight.
}

// ─── Manual Profit Distribution ──────────────────────────────────
/**
 * A single person's manual profit distribution entry for a shipment.
 * `profit` is null/undefined when the user has not assigned any profit.
 */
export interface ManualProfitEntry {
  partnerId: string;
  capitalReturn: number;   // SAR — from capital-return transactions
  expenses: number;        // SAR — expenses attributed to this person
  profit: number | null;   // SAR — manually entered; null = not assigned
}

/**
 * The full manual profit distribution record for one shipment.
 */
export interface ManualProfitDistribution {
  shipmentId: string;
  savedAt: string;
  entries: ManualProfitEntry[];
}

export interface ShipmentTransferLine {
  productId: string;
  qty: number;
  unitCost: number;
  total: number;
}

export interface ShipmentTransfer {
  id: string;
  date: string;
  fromShipmentId: string;
  toShipmentId: string;
  items: ShipmentTransferLine[];
  totalAmount: number;
  notes?: string;
}

export interface AuditLogDetail {
  stateKey: string;
  addedIds: string[];
  updatedIds: string[];
  deletedIds: string[];
  changedFields: string[];
  /**
   * Full per-record snapshots keyed by record ID.
   * Only present on entries created after full-snapshot support was added.
   * Key '_' is used for scalar (non-array) state changes.
   */
  snapshots?: Record<string, { before?: Record<string, unknown>; after?: Record<string, unknown> }>;
  /** Legacy compat: snapshot of first affected record before change. */
  before?: Record<string, unknown>;
  /** Legacy compat: snapshot of first affected record after change. */
  after?: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string | null;
  userName: string;
  action: 'create' | 'update' | 'delete' | 'mixed';
  details: AuditLogDetail[];
  timestampTrusted?: boolean;
}

export interface AppState {
  language: Language;
  userRole: UserRole;
  exchangeRate: number;
  managementFeePercent: number;
  managementFeeRecipientId: string;
  products: Product[];
  salespeople: Salesperson[];
  cities: City[];
  cars: Car[];
  bankAccounts: BankAccount[];
  shipments: Shipment[];
  employees: Employee[];
  partners: Partner[];
  expenseCategories: ExpenseCategory[];
  customers: Customer[];
  inventoryTransactions: InventoryTransaction[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  salaries: Salary[];
  generalTransfers: GeneralTransfer[];
  accountTransfers: AccountTransfer[];
  ledger: LedgerEntry[];
  capitalContributions: CapitalContribution[];
  manualProfitDistributions: ManualProfitDistribution[];
  shipmentTransfers: ShipmentTransfer[];
  auditLogs: AuditLogEntry[];
  roles: Role[];
  users: User[];
  currentUser: User | null;
}
