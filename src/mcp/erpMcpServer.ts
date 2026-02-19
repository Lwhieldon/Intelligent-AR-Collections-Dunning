#!/usr/bin/env node
/**
 * ERP MCP Server
 *
 * External MCP (Model Context Protocol) server that exposes AR Collections
 * data operations as standardized tools. The Collections Agent connects to
 * this server via the MCP client to access Dynamics 365 ERP data.
 *
 * Tools exposed:
 *   - get_ar_aging_data                      : Fetch AR aging buckets + invoices for a customer
 *   - get_payment_history                    : Fetch payment history and promise-to-pay records
 *   - get_customers_with_outstanding_balance : List all customers with outstanding balances
 *   - update_customer_notes                  : Write a collections note back to the ERP
 *
 * Transport: stdio (spawned as a child process by ERPConnector)
 */

import * as dotenv from 'dotenv';
import axios from 'axios';
import { ClientSecretCredential } from '@azure/identity';
import type { ARAgingData, PaymentHistory, Invoice } from '../types';

dotenv.config();

// ---------------------------------------------------------------------------
// Minimal MCP SDK type definitions (runtime resolved via require)
// ---------------------------------------------------------------------------

interface McpServerInfo   { name: string; version: string; }
interface McpCapabilities { capabilities: { tools: Record<string, unknown> }; }
interface McpTransport    {}
interface McpTool {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required: string[]; };
}
interface McpContent { type: 'text'; text: string; }
interface McpToolResult  { content: McpContent[]; isError?: boolean; }
interface McpToolListResult { tools: McpTool[]; }
interface McpRequest { params: { name: string; arguments: Record<string, unknown>; }; }

interface McpServerInstance {
  setRequestHandler(schema: unknown, handler: (req: McpRequest) => Promise<McpToolListResult | McpToolResult>): void;
  connect(transport: McpTransport): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Server }              = require('@modelcontextprotocol/sdk/server') as
  { Server: new (info: McpServerInfo, caps: McpCapabilities) => McpServerInstance };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js') as
  { StdioServerTransport: new () => McpTransport };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CallToolRequestSchema, ListToolsRequestSchema } =
  require('@modelcontextprotocol/sdk/types.js') as
  { CallToolRequestSchema: unknown; ListToolsRequestSchema: unknown };

// ---------------------------------------------------------------------------
// ERP / Dynamics 365 configuration
// ---------------------------------------------------------------------------

const ERP_API_ENDPOINT = process.env.ERP_API_ENDPOINT ?? '';
const ERP_RESOURCE     = process.env.ERP_RESOURCE ?? '';
const DEMO_MODE        = process.env.DEMO_MODE === 'true';

let credential: ClientSecretCredential | null = null;

function getCredential(): ClientSecretCredential {
  if (!credential) {
    credential = new ClientSecretCredential(
      process.env.ERP_TENANT_ID    ?? '',
      process.env.ERP_CLIENT_ID    ?? '',
      process.env.ERP_CLIENT_SECRET ?? '',
    );
  }
  return credential;
}

async function getAccessToken(): Promise<string> {
  const scope = ERP_RESOURCE.endsWith('/')
    ? `${ERP_RESOURCE}.default`
    : `${ERP_RESOURCE}/.default`;
  const tokenResponse = await getCredential().getToken(scope);
  return tokenResponse.token;
}

// ---------------------------------------------------------------------------
// ERP data functions
// ---------------------------------------------------------------------------

async function getARAgingData(customerId: string): Promise<ARAgingData> {
  if (DEMO_MODE) return getMockARAgingData(customerId);

  process.stderr.write(`📊 Querying Dynamics 365 for customer: ${customerId}\n`);
  const token = await getAccessToken();

  const accountResponse = await axios.get(
    `${ERP_API_ENDPOINT}/accounts(${customerId})`,
    { headers: erpHeaders(token) },
  );
  const account = accountResponse.data;
  process.stderr.write(`✅ Found account: ${account.name ?? customerId}\n`);

  process.stderr.write('📄 Querying invoices for customer...\n');
  // Fetch all three D365 calculated amount fields so we have fallbacks.
  // totalamount = sum of line items + tax (may be null on draft invoices)
  // totallineitemamount = sum of line items before tax (often populated when totalamount is not)
  // totalamountlessfreight = totallineitemamount - freight (another fallback)
  const invoicesResponse = await axios.get(
    `${ERP_API_ENDPOINT}/invoices?$filter=_customerid_value eq ${customerId} and statecode eq 0` +
    `&$select=invoiceid,name,totalamount,totallineitemamount,totalamountlessfreight,totaltax,datedelivered,duedate,statecode,statuscode,createdon` +
    `&$orderby=createdon desc`,
    { headers: erpHeaders(token) },
  );
  const dynamics365Invoices: any[] = invoicesResponse.data.value;
  process.stderr.write(`✅ Found ${dynamics365Invoices.length} invoices\n`);

  process.stderr.write('📦 Fetching line items for invoices...\n');
  // Enrich each invoice: resolve the best available amount across all sources
  for (const invoice of dynamics365Invoices) {
    // D365 header-level fallback chain (server-calculated fields)
    const headerAmount: number =
      (invoice.totalamount > 0        ? invoice.totalamount        : null) ??
      (invoice.totallineitemamount > 0 ? invoice.totallineitemamount : null) ??
      (invoice.totalamountlessfreight > 0 ? invoice.totalamountlessfreight : null) ??
      0;

    try {
      const lineItemsResponse = await axios.get(
        `${ERP_API_ENDPOINT}/invoicedetails?$filter=_invoiceid_value eq ${invoice.invoiceid}` +
        `&$select=invoicedetailid,quantity,priceperunit,baseamount,extendedamount`,
        { headers: erpHeaders(token) },
      );
      const lineItems: any[] = lineItemsResponse.data.value;

      let lineItemTotal = 0;
      for (const li of lineItems) {
        // extendedamount is D365's calculated quantity*priceperunit; fall back to baseamount
        // or manual calculation if both are null
        const liAmount: number =
          (li.extendedamount > 0 ? li.extendedamount : null) ??
          (li.baseamount      > 0 ? li.baseamount      : null) ??
          ((li.quantity != null && li.priceperunit != null) ? li.quantity * li.priceperunit : null) ??
          0;
        lineItemTotal += liAmount;
      }

      // Prefer line-item total if it has a value; fall back to the header amount
      invoice.totalamount = lineItemTotal > 0 ? lineItemTotal : headerAmount;
    } catch {
      // Line-item query failed — fall back to whatever the invoice header says
      invoice.totalamount = headerAmount;
    }
  }

  const result = calculateARAgingFromDynamicsInvoices(account, dynamics365Invoices);
  const fmt = (n: number) => `$${n.toLocaleString()}`;
  process.stderr.write(`💰 Total Outstanding: ${fmt(result.totalOutstanding)}\n`);
  process.stderr.write(`   Current:           ${fmt(result.current)}\n`);
  process.stderr.write(`   30 days:           ${fmt(result.days30)}\n`);
  process.stderr.write(`   60 days:           ${fmt(result.days60)}\n`);
  process.stderr.write(`   90 days:           ${fmt(result.days90)}\n`);
  process.stderr.write(`   120+ days:         ${fmt(result.days120Plus)}\n`);
  return result;
}

function calculateARAgingFromDynamicsInvoices(account: any, d365Invoices: any[]): ARAgingData {
  const today = new Date();
  const invoices: Invoice[] = [];
  let totalOutstanding = 0, current = 0, days30 = 0, days60 = 0, days90 = 0, days120Plus = 0;

  for (const inv of d365Invoices) {
    const dueDate     = inv.duedate        ? new Date(inv.duedate)        : new Date();
    const invoiceDate = inv.datedelivered  ? new Date(inv.datedelivered)  : new Date();
    const amount      = inv.totalamount ?? 0;
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);

    if      (daysOverdue < 30)  current     += amount;
    else if (daysOverdue < 60)  days30      += amount;
    else if (daysOverdue < 90)  days60      += amount;
    else if (daysOverdue < 120) days90      += amount;
    else                        days120Plus += amount;

    totalOutstanding += amount;
    invoices.push({
      invoiceId:        inv.invoiceid,
      invoiceDate:      invoiceDate.toISOString(),
      dueDate:          dueDate.toISOString(),
      amount,
      amountPaid:       0,
      amountOutstanding: amount,
      daysOverdue:      Math.max(0, daysOverdue),
    });
  }

  return {
    customerId:       account.accountid,
    customerName:     account.name ?? 'Unknown Customer',
    totalOutstanding, current, days30, days60, days90, days120Plus, invoices,
  };
}

async function getPaymentHistory(customerId: string): Promise<PaymentHistory> {
  if (DEMO_MODE) return getMockPaymentHistory(customerId);

  process.stderr.write('📜 Fetching payment history from tasks and appointments...\n');
  const token = await getAccessToken();

  const [tasksRes, appointmentsRes] = await Promise.all([
    axios.get(
      `${ERP_API_ENDPOINT}/tasks?$filter=_regardingobjectid_value eq ${customerId}` +
      `&$select=subject,actualend,description,statecode,statuscode&$top=50`,
      { headers: erpHeaders(token) },
    ),
    axios.get(
      `${ERP_API_ENDPOINT}/appointments?$filter=_regardingobjectid_value eq ${customerId}` +
      `&$select=subject,scheduledend,description,statuscode,statecode&$top=50`,
      { headers: erpHeaders(token) },
    ),
  ]);

  const tasks = tasksRes.data.value;
  const appointments = appointmentsRes.data.value;
  process.stderr.write(`✅ Found ${tasks.length} payment records and ${appointments.length} promises\n`);

  return calculatePaymentHistoryFromRecords(customerId, tasks, appointments);
}

function calculatePaymentHistoryFromRecords(
  customerId: string,
  tasks: any[],
  appointments: any[],
): PaymentHistory {
  let onTimeCount = 0, totalDaysLate = 0;

  for (const task of tasks) {
    const subject = task.subject ?? '';
    if (subject.includes('On Time')) onTimeCount++;
    const match = subject.match(/(\d+) days late/);
    if (match) totalDaysLate += parseInt(match[1]);
  }

  const promiseToPayHistory = appointments.map((appt: any) => ({
    date:           appt.scheduledend ?? new Date().toISOString(),
    promisedAmount: 5000,
    promisedDate:   appt.scheduledend ?? new Date().toISOString(),
    fulfilled:      (appt.subject ?? '').includes('Fulfilled'),
  }));

  const totalTransactions  = tasks.length;
  const onTimePaymentRate  = totalTransactions > 0 ? onTimeCount / totalTransactions : 1;
  const averagePaymentDays = totalTransactions > 0 ? 30 + totalDaysLate / totalTransactions : 30;

  return {
    customerId,
    totalTransactions,
    onTimePaymentRate,
    averagePaymentDays,
    promiseToPayHistory,
    lastPaymentDate: tasks.length > 0 ? tasks[0].actualend : new Date().toISOString(),
  };
}

async function getCustomersWithOutstandingBalance(): Promise<string[]> {
  if (DEMO_MODE) return ['CUST-001', 'CUST-002', 'CUST-003'];

  const token = await getAccessToken();

  try {
    const res = await axios.get(
      `${ERP_API_ENDPOINT}/invoices?$select=_customerid_value&$top=100`,
      { headers: erpHeaders(token) },
    );
    const ids = new Set<string>();
    for (const inv of res.data.value) {
      if (inv._customerid_value) ids.add(inv._customerid_value);
    }
    return Array.from(ids);
  } catch {
    const res = await axios.get(
      `${ERP_API_ENDPOINT}/accounts?$select=accountid&$top=10`,
      { headers: erpHeaders(token) },
    );
    return res.data.value.map((a: any) => a.accountid);
  }
}

async function updateCustomerNotes(customerId: string, note: string): Promise<void> {
  if (DEMO_MODE) {
    process.stderr.write(`✅ Updated notes for customer ${customerId} (demo mode)\n`);
    return;
  }

  const token = await getAccessToken();
  await axios.patch(
    `${ERP_API_ENDPOINT}/accounts(${customerId})`,
    { description: `${note}\n[Updated: ${new Date().toISOString()}]` },
    { headers: erpHeaders(token) },
  );
  process.stderr.write(`✅ Updated notes for customer ${customerId} in Dynamics 365\n`);
}

function erpHeaders(token: string) {
  return {
    Authorization:    `Bearer ${token}`,
    'Content-Type':   'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version':    '4.0',
  };
}

// ---------------------------------------------------------------------------
// Mock data (DEMO_MODE=true)
// ---------------------------------------------------------------------------

function getMockARAgingData(customerId: string): ARAgingData {
  const data: Record<string, ARAgingData> = {
    'CUST-001': {
      customerId: 'CUST-001', customerName: 'Contoso Ltd',
      totalOutstanding: 125000, current: 50000, days30: 30000,
      days60: 25000, days90: 15000, days120Plus: 5000,
      invoices: [{
        invoiceId: 'INV-001',
        invoiceDate: new Date(Date.now() - 45 * 86_400_000).toISOString(),
        dueDate:     new Date(Date.now() - 15 * 86_400_000).toISOString(),
        amount: 30000, amountPaid: 0, amountOutstanding: 30000, daysOverdue: 15,
      }],
    },
    'CUST-002': {
      customerId: 'CUST-002', customerName: 'Fabrikam Inc',
      totalOutstanding: 85000, current: 60000, days30: 15000,
      days60: 10000, days90: 0, days120Plus: 0, invoices: [],
    },
    'CUST-003': {
      customerId: 'CUST-003', customerName: 'Adventure Works',
      totalOutstanding: 200000, current: 80000, days30: 50000,
      days60: 40000, days90: 20000, days120Plus: 10000, invoices: [],
    },
  };
  return data[customerId] ?? data['CUST-001'];
}

function getMockPaymentHistory(customerId: string): PaymentHistory {
  return {
    customerId,
    averagePaymentDays: 35,
    onTimePaymentRate:  0.67,
    totalTransactions:  12,
    lastPaymentDate: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    promiseToPayHistory: [
      {
        date:          new Date(Date.now() - 60 * 86_400_000).toISOString(),
        promisedAmount: 25000,
        promisedDate:  new Date(Date.now() - 30 * 86_400_000).toISOString(),
        fulfilled: true,
        actualPaymentDate: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      },
      {
        date:          new Date(Date.now() - 90 * 86_400_000).toISOString(),
        promisedAmount: 35000,
        promisedDate:  new Date(Date.now() - 75 * 86_400_000).toISOString(),
        fulfilled: false,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'erp-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_ar_aging_data',
      description:
        'Fetch AR aging data for a customer from the ERP system (Dynamics 365). ' +
        'Returns aging buckets (current, 30, 60, 90, 120+ days) and individual invoices.',
      inputSchema: {
        type: 'object',
        properties: { customerId: { type: 'string', description: 'Customer ID in the ERP system' } },
        required: ['customerId'],
      },
    },
    {
      name: 'get_payment_history',
      description:
        'Fetch payment history for a customer, including on-time rate, ' +
        'average payment days, and promise-to-pay records.',
      inputSchema: {
        type: 'object',
        properties: { customerId: { type: 'string', description: 'Customer ID in the ERP system' } },
        required: ['customerId'],
      },
    },
    {
      name: 'get_customers_with_outstanding_balance',
      description: 'Return all customer IDs that have outstanding balances in the ERP system.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'update_customer_notes',
      description: 'Append a collections note to the customer record in the ERP system.',
      inputSchema: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'Customer ID in the ERP system' },
          note:       { type: 'string', description: 'Note content to record' },
        },
        required: ['customerId', 'note'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_ar_aging_data': {
        const data = await getARAgingData(args.customerId as string);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      }
      case 'get_payment_history': {
        const data = await getPaymentHistory(args.customerId as string);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      }
      case 'get_customers_with_outstanding_balance': {
        const data = await getCustomersWithOutstandingBalance();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      }
      case 'update_customer_notes': {
        await updateCustomerNotes(args.customerId as string, args.note as string);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }] };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now running — communicates via stdin/stdout with the MCP client
}

main().catch((err) => {
  process.stderr.write(`[ERP MCP Server] Fatal error: ${err}\n`);
  process.exit(1);
});
