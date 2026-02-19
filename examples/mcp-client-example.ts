/**
 * ERP MCP Server — Direct Client Example
 *
 * Demonstrates how to connect to the ERP MCP Server and call its tools
 * directly using the Model Context Protocol client, without going through
 * the CollectionsAgent or any higher-level orchestration.
 *
 * This is the raw MCP interaction layer — useful for understanding the
 * protocol, testing the server standalone, or building custom integrations.
 *
 * Usage:
 *   npx ts-node examples/mcp-client-example.ts [command] [args...]
 *
 * Commands:
 *   list                         List all tools exposed by the MCP server
 *   aging     <customerId>       Fetch AR aging data for a customer
 *   history   <customerId>       Fetch payment history for a customer
 *   customers                    List all customers with outstanding balances
 *   notes     <customerId> <msg> Write a collections note to the ERP
 *   all       <customerId>       Run all read tools for one customer (default: CUST-001)
 *
 * Examples:
 *   npx ts-node examples/mcp-client-example.ts list
 *   npx ts-node examples/mcp-client-example.ts aging CUST-001
 *   npx ts-node examples/mcp-client-example.ts history CUST-002
 *   npx ts-node examples/mcp-client-example.ts customers
 *   npx ts-node examples/mcp-client-example.ts notes CUST-001 "Spoke with AP dept, payment ETA March 1"
 *   npx ts-node examples/mcp-client-example.ts all CUST-003
 *
 * Requirements:
 *   - Configure .env (DEMO_MODE=true for mock data, no D365 credentials needed)
 *   - Run 'npm run build' if using compiled mode instead of ts-node
 */

import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// ---------------------------------------------------------------------------
// MCP Client bootstrap (same require() pattern as ERPConnector)
// ---------------------------------------------------------------------------

interface McpClientInfo    { name: string; version: string; }
interface McpClientOptions { capabilities: Record<string, unknown>; }
interface McpTransport     {}
interface McpTool {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required: string[]; };
}
interface McpContentBlock { type: string; text?: string; }
interface McpListResult   { tools: McpTool[]; }
interface McpCallResult   { content: McpContentBlock[]; isError?: boolean; }

interface McpClientInstance {
  connect(transport: McpTransport): Promise<void>;
  listTools(): Promise<McpListResult>;
  callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<McpCallResult>;
  close(): Promise<void>;
}

interface StdioTransportOptions { command: string; args: string[]; }

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require('@modelcontextprotocol/sdk/client') as
  { Client: new (info: McpClientInfo, opts: McpClientOptions) => McpClientInstance };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js') as
  { StdioClientTransport: new (opts: StdioTransportOptions) => McpTransport };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hr(title = '') {
  const line = '─'.repeat(60);
  console.log(title ? `\n${line}\n  ${title}\n${line}` : line);
}

function parseToolResult<T>(result: McpCallResult, toolName: string): T {
  const block = result.content[0];
  if (!block || block.type !== 'text' || block.text === undefined) {
    throw new Error(`Unexpected response from tool "${toolName}"`);
  }
  const parsed: unknown = JSON.parse(block.text);
  if (parsed !== null && typeof parsed === 'object' && 'error' in parsed) {
    throw new Error((parsed as { error: string }).error);
  }
  return parsed as T;
}

async function connectClient(): Promise<McpClientInstance> {
  const isCompiled  = __filename.endsWith('.js');
  const serverEntry = isCompiled
    ? path.resolve(__dirname, '../dist/mcp/erpMcpServer.js')
    : path.resolve(__dirname, '../src/mcp/erpMcpServer.ts');

  const transport = new StdioClientTransport({
    command: isCompiled ? 'node' : 'npx',
    args:    isCompiled ? [serverEntry] : ['ts-node', serverEntry],
  });

  const client = new Client(
    { name: 'mcp-client-example', version: '1.0.0' },
    { capabilities: {} },
  );

  await client.connect(transport);
  return client;
}

// ---------------------------------------------------------------------------
// Example 1: List all available tools
// ---------------------------------------------------------------------------

async function listTools() {
  hr('LIST TOOLS — Discover what the ERP MCP Server exposes');
  console.log('Connecting to ERP MCP Server via stdio transport...\n');

  const client = await connectClient();

  try {
    const response = await client.listTools();

    console.log(`Found ${response.tools.length} tool(s):\n`);

    for (const tool of response.tools) {
      console.log(`  Tool: ${tool.name}`);
      console.log(`  Description: ${tool.description}`);

      const props = tool.inputSchema.properties;
      const propNames = Object.keys(props);
      if (propNames.length > 0) {
        console.log(`  Parameters:`);
        for (const prop of propNames) {
          const schema = props[prop] as { type?: string; description?: string };
          const required = tool.inputSchema.required.includes(prop) ? ' (required)' : ' (optional)';
          console.log(`    • ${prop}: ${schema.type ?? 'any'}${required} — ${schema.description ?? ''}`);
        }
      } else {
        console.log(`  Parameters: none`);
      }
      console.log();
    }
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// Example 2: Call get_ar_aging_data
// ---------------------------------------------------------------------------

async function fetchARAgingData(customerId: string) {
  hr(`GET AR AGING DATA — Customer: ${customerId}`);
  console.log('Calling tool: get_ar_aging_data\n');

  const client = await connectClient();

  try {
    console.log(`MCP Request:
  tool: get_ar_aging_data
  arguments: { customerId: "${customerId}" }
`);

    const result = await client.callTool({
      name: 'get_ar_aging_data',
      arguments: { customerId },
    });

    const data = parseToolResult<{
      customerId: string;
      customerName: string;
      totalOutstanding: number;
      current: number;
      days30: number;
      days60: number;
      days90: number;
      days120Plus: number;
      invoices: { invoiceId: string; amount: number; daysOverdue: number }[];
    }>(result, 'get_ar_aging_data');

    console.log('MCP Response (parsed):\n');
    console.log(`  Customer:          ${data.customerName} (${data.customerId})`);
    console.log(`  Total Outstanding: $${data.totalOutstanding.toLocaleString()}`);
    console.log();
    console.log(`  AR Aging Buckets:`);
    console.log(`    Current (0–29d): $${data.current.toLocaleString()}`);
    console.log(`    30–59 days:      $${data.days30.toLocaleString()}`);
    console.log(`    60–89 days:      $${data.days60.toLocaleString()}`);
    console.log(`    90–119 days:     $${data.days90.toLocaleString()}`);
    console.log(`    120+ days:       $${data.days120Plus.toLocaleString()}`);

    if (data.invoices.length > 0) {
      console.log(`\n  Open Invoices (${data.invoices.length}):`);
      for (const inv of data.invoices.slice(0, 5)) {
        console.log(`    ${inv.invoiceId}  $${inv.amount.toLocaleString()}  ${inv.daysOverdue}d overdue`);
      }
      if (data.invoices.length > 5) {
        console.log(`    ... and ${data.invoices.length - 5} more`);
      }
    }
    console.log();

    console.log('Raw JSON response:');
    console.log(result.content[0].text);
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// Example 3: Call get_payment_history
// ---------------------------------------------------------------------------

async function fetchPaymentHistory(customerId: string) {
  hr(`GET PAYMENT HISTORY — Customer: ${customerId}`);
  console.log('Calling tool: get_payment_history\n');

  const client = await connectClient();

  try {
    console.log(`MCP Request:
  tool: get_payment_history
  arguments: { customerId: "${customerId}" }
`);

    const result = await client.callTool({
      name: 'get_payment_history',
      arguments: { customerId },
    });

    const data = parseToolResult<{
      customerId: string;
      totalTransactions: number;
      onTimePaymentRate: number;
      averagePaymentDays: number;
      lastPaymentDate: string;
      promiseToPayHistory: { date: string; promisedAmount: number; promisedDate: string; fulfilled: boolean }[];
    }>(result, 'get_payment_history');

    console.log('MCP Response (parsed):\n');
    console.log(`  Customer:            ${data.customerId}`);
    console.log(`  Total Transactions:  ${data.totalTransactions}`);
    console.log(`  On-Time Rate:        ${(data.onTimePaymentRate * 100).toFixed(1)}%`);
    console.log(`  Avg Payment Days:    ${data.averagePaymentDays.toFixed(0)}`);
    console.log(`  Last Payment:        ${new Date(data.lastPaymentDate).toLocaleDateString()}`);

    if (data.promiseToPayHistory.length > 0) {
      console.log(`\n  Promise-to-Pay History (${data.promiseToPayHistory.length} records):`);
      for (const p of data.promiseToPayHistory.slice(0, 3)) {
        const status = p.fulfilled ? '✅ Fulfilled' : '❌ Broken';
        console.log(`    ${new Date(p.date).toLocaleDateString()}  $${p.promisedAmount.toLocaleString()}  ${status}`);
      }
    }
    console.log();

    console.log('Raw JSON response:');
    console.log(result.content[0].text);
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// Example 4: Call get_customers_with_outstanding_balance
// ---------------------------------------------------------------------------

async function fetchCustomers() {
  hr('GET CUSTOMERS WITH OUTSTANDING BALANCE');
  console.log('Calling tool: get_customers_with_outstanding_balance\n');

  const client = await connectClient();

  try {
    console.log(`MCP Request:
  tool: get_customers_with_outstanding_balance
  arguments: {}
`);

    const result = await client.callTool({
      name: 'get_customers_with_outstanding_balance',
      arguments: {},
    });

    const customerIds = parseToolResult<string[]>(result, 'get_customers_with_outstanding_balance');

    console.log('MCP Response (parsed):\n');
    console.log(`  ${customerIds.length} customer(s) with outstanding balances:\n`);
    for (const id of customerIds) {
      console.log(`    • ${id}`);
    }
    console.log();

    console.log('Raw JSON response:');
    console.log(result.content[0].text);
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// Example 5: Call update_customer_notes (write operation)
// ---------------------------------------------------------------------------

async function writeCustomerNote(customerId: string, note: string) {
  hr(`UPDATE CUSTOMER NOTES — Customer: ${customerId}`);
  console.log('Calling tool: update_customer_notes  [WRITE OPERATION]\n');

  const client = await connectClient();

  try {
    console.log(`MCP Request:
  tool: update_customer_notes
  arguments:
    customerId: "${customerId}"
    note: "${note}"
`);

    const result = await client.callTool({
      name: 'update_customer_notes',
      arguments: { customerId, note },
    });

    const response = parseToolResult<{ success: boolean }>(result, 'update_customer_notes');

    console.log('MCP Response (parsed):\n');
    if (response.success) {
      console.log(`  ✅ Note successfully written to ERP for customer ${customerId}`);
      console.log(`  Note: "${note}"`);
      if (process.env.DEMO_MODE === 'true') {
        console.log('\n  (DEMO_MODE=true — note logged but not persisted to Dynamics 365)');
      } else {
        console.log('\n  Note appended to account.description in Dynamics 365');
      }
    }
    console.log();

    console.log('Raw JSON response:');
    console.log(result.content[0].text);
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// Example 6: Run all read tools for one customer
// ---------------------------------------------------------------------------

async function runAll(customerId: string) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         ERP MCP Server — Full Tool Walkthrough              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nTarget customer: ${customerId}`);
  console.log(`Demo mode:       ${process.env.DEMO_MODE === 'true' ? 'ON (mock data)' : 'OFF (live D365)'}\n`);

  // Reuse a single client connection for the full walkthrough
  const isCompiled  = __filename.endsWith('.js');
  const serverEntry = isCompiled
    ? path.resolve(__dirname, '../dist/mcp/erpMcpServer.js')
    : path.resolve(__dirname, '../src/mcp/erpMcpServer.ts');

  const transport = new StdioClientTransport({
    command: isCompiled ? 'node' : 'npx',
    args:    isCompiled ? [serverEntry] : ['ts-node', serverEntry],
  });

  const client = new Client(
    { name: 'mcp-client-example', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);

  try {
    // --- Step 1: Discover tools ---
    hr('Step 1 of 5 — Discover available MCP tools');
    const { tools } = await client.listTools();
    console.log(`Server exposes ${tools.length} tools:`);
    for (const t of tools) console.log(`  • ${t.name}`);

    // --- Step 2: Get customer list ---
    hr('Step 2 of 5 — get_customers_with_outstanding_balance');
    const customersResult = await client.callTool({
      name: 'get_customers_with_outstanding_balance',
      arguments: {},
    });
    const allCustomers = parseToolResult<string[]>(customersResult, 'get_customers_with_outstanding_balance');
    console.log(`Customers with outstanding balances: ${allCustomers.join(', ')}`);

    // --- Step 3: AR aging data ---
    hr(`Step 3 of 5 — get_ar_aging_data (${customerId})`);
    const agingResult = await client.callTool({
      name: 'get_ar_aging_data',
      arguments: { customerId },
    });
    const aging = parseToolResult<{
      customerName: string;
      totalOutstanding: number;
      current: number;
      days30: number;
      days60: number;
      days90: number;
      days120Plus: number;
    }>(agingResult, 'get_ar_aging_data');
    console.log(`Customer: ${aging.customerName}`);
    console.log(`Total Outstanding: $${aging.totalOutstanding.toLocaleString()}`);
    console.log(`  Current:   $${aging.current.toLocaleString()}`);
    console.log(`  30d:       $${aging.days30.toLocaleString()}`);
    console.log(`  60d:       $${aging.days60.toLocaleString()}`);
    console.log(`  90d:       $${aging.days90.toLocaleString()}`);
    console.log(`  120d+:     $${aging.days120Plus.toLocaleString()}`);

    // --- Step 4: Payment history ---
    hr(`Step 4 of 5 — get_payment_history (${customerId})`);
    const historyResult = await client.callTool({
      name: 'get_payment_history',
      arguments: { customerId },
    });
    const history = parseToolResult<{
      totalTransactions: number;
      onTimePaymentRate: number;
      averagePaymentDays: number;
      promiseToPayHistory: { fulfilled: boolean }[];
    }>(historyResult, 'get_payment_history');
    console.log(`Transactions:    ${history.totalTransactions}`);
    console.log(`On-time rate:    ${(history.onTimePaymentRate * 100).toFixed(1)}%`);
    console.log(`Avg payment:     ${history.averagePaymentDays.toFixed(0)} days`);
    const fulfilled = history.promiseToPayHistory.filter(p => p.fulfilled).length;
    console.log(`Promises kept:   ${fulfilled} / ${history.promiseToPayHistory.length}`);

    // --- Step 5: Write a note ---
    hr(`Step 5 of 5 — update_customer_notes (${customerId})`);
    const noteText = `[MCP Example] Full walkthrough completed at ${new Date().toISOString()}`;
    const noteResult = await client.callTool({
      name: 'update_customer_notes',
      arguments: { customerId, note: noteText },
    });
    const noteResponse = parseToolResult<{ success: boolean }>(noteResult, 'update_customer_notes');
    console.log(noteResponse.success ? `✅ Note written: "${noteText}"` : '❌ Note write failed');

    hr();
    console.log('All 5 MCP tool interactions completed successfully.\n');
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const [cmd = 'all', arg1 = 'CUST-001', ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'list':
      await listTools();
      break;
    case 'aging':
      await fetchARAgingData(arg1);
      break;
    case 'history':
      await fetchPaymentHistory(arg1);
      break;
    case 'customers':
      await fetchCustomers();
      break;
    case 'notes':
      await writeCustomerNote(arg1, rest.join(' ') || 'Test note from MCP client example');
      break;
    case 'all':
      await runAll(arg1);
      break;
    default:
      console.log('Usage: npx ts-node examples/mcp-client-example.ts [list|aging|history|customers|notes|all] [customerId] [note]');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message ?? err);
    process.exit(1);
  });
}
