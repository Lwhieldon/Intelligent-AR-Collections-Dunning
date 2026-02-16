export interface ARAgingData {
  customerId: string;
  customerName: string;
  totalOutstanding: number;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120Plus: number;
  invoices: Invoice[];
}

export interface Invoice {
  invoiceId: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  amountPaid: number;
  amountOutstanding: number;
  daysOverdue: number;
}

export interface PaymentHistory {
  customerId: string;
  averagePaymentDays: number;
  onTimePaymentRate: number;
  totalTransactions: number;
  lastPaymentDate: string;
  promiseToPayHistory: PromiseToPay[];
}

export interface PromiseToPay {
  date: string;
  promisedAmount: number;
  promisedDate: string;
  fulfilled: boolean;
  actualPaymentDate?: string;
}

export interface RiskScore {
  customerId: string;
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  factors: RiskFactor[];
  recommendation: string;
}

export interface RiskFactor {
  factor: string;
  impact: number;
  description: string;
}

export interface DunningAction {
  customerId: string;
  actionType: 'email' | 'teams-chat' | 'phone-call';
  priority: number;
  message: string;
  scheduledDate: string;
}

export interface PaymentPlan {
  customerId: string;
  totalAmount: number;
  numberOfPayments: number;
  paymentSchedule: PaymentScheduleItem[];
  interestRate?: number;
}

export interface PaymentScheduleItem {
  dueDate: string;
  amount: number;
  description: string;
}

export interface CRMNote {
  customerId: string;
  noteDate: string;
  author: string;
  content: string;
  category: 'promise-to-pay' | 'contact-attempt' | 'payment-plan' | 'general';
}

export interface PrioritizedCustomer {
  customerId: string;
  customerName: string;
  riskScore: RiskScore;
  totalOutstanding: number;
  priority: number;
}

export interface PromiseSummary {
  customerId: string;
  customerName: string;
  totalPromises: number;
  fulfilledPromises: number;
  brokenPromises: number;
  pendingPromises: number;
  totalPromisedAmount: number;
  fulfillmentRate: number;
  recentPromises: PromiseToPay[];
}
