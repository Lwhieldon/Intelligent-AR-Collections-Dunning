# ERP MCP Server

## Overview

The ERP MCP Server (`src/mcp/erpMcpServer.ts`) is a standalone **external server** that implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) to expose Dynamics 365 AR Collections data as standardized tools.

The Collections Agent connects to this server via an MCP client (`src/connectors/erpConnector.ts`), which spawns the server as a child process and communicates over **stdin/stdout (stdio transport)**.

```
CollectionsAgent
    │
    └─▶ ERPConnector (MCP Client)
              │   stdio transport (JSON-RPC)
              │   ◄──────────────────────────►
              └─▶ erpMcpServer (MCP Server)
                        │
                        └─▶ Dynamics 365 OData REST API
                              (or mock data in DEMO_MODE)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Collections Agent (collectionsAgent.ts)                            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ TypeScript method calls
┌───────────────────────────────▼─────────────────────────────────────┐
│  ERP Connector (erpConnector.ts)  ← MCP CLIENT                      │
│                                                                     │
│  • Spawns erpMcpServer as a child process on first call             │
│  • Sends JSON-RPC requests over the child process stdin             │
│  • Receives JSON-RPC responses from the child process stdout        │
│  • Parses and type-casts responses back to TypeScript types         │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ stdio (JSON-RPC 2.0)
                                │ stdin  ──────────►
                                │ stdout ◄──────────
┌───────────────────────────────▼─────────────────────────────────────┐
│  ERP MCP Server (erpMcpServer.ts)  ← MCP SERVER                     │
│                                                                     │
│  Registered tools:                                                  │
│    • get_ar_aging_data                                              │
│    • get_payment_history                                            │
│    • get_customers_with_outstanding_balance                         │
│    • update_customer_notes                                          │
│                                                                     │
│  Authentication: Azure AD OAuth2 client credentials                 │
│  Modes: DEMO_MODE=true (mock) / DEMO_MODE=false (live D365)         │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS / OData REST
┌───────────────────────────────▼─────────────────────────────────────┐
│  Dynamics 365  (accounts, invoices, invoicedetails, tasks, appts.)  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tool Reference

### `get_ar_aging_data`

Fetch AR aging data and open invoices for a specific customer.

**Input**
```json
{
  "customerId": "CUST-001"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `customerId` | `string` | Yes | Customer ID in the ERP system |

**Output** — `ARAgingData`
```json
{
  "customerId": "CUST-001",
  "customerName": "Contoso Ltd",
  "totalOutstanding": 125000,
  "current": 50000,
  "days30": 30000,
  "days60": 25000,
  "days90": 15000,
  "days120Plus": 5000,
  "invoices": [
    {
      "invoiceId": "INV-001",
      "invoiceDate": "2025-12-01T00:00:00.000Z",
      "dueDate": "2026-01-01T00:00:00.000Z",
      "amount": 30000,
      "amountPaid": 0,
      "amountOutstanding": 30000,
      "daysOverdue": 15
    }
  ]
}
```

**D365 queries (production mode)**
```
GET /accounts({customerId})
GET /invoices?$filter=_customerid_value eq {customerId} and statecode eq 0
GET /invoicedetails?$filter=_invoiceid_value eq {invoiceId}
```

---

### `get_payment_history`

Fetch payment history, on-time rate, and promise-to-pay records for a customer.

**Input**
```json
{
  "customerId": "CUST-001"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `customerId` | `string` | Yes | Customer ID in the ERP system |

**Output** — `PaymentHistory`
```json
{
  "customerId": "CUST-001",
  "totalTransactions": 12,
  "onTimePaymentRate": 0.67,
  "averagePaymentDays": 35,
  "lastPaymentDate": "2026-01-20T00:00:00.000Z",
  "promiseToPayHistory": [
    {
      "date": "2025-12-01T00:00:00.000Z",
      "promisedAmount": 25000,
      "promisedDate": "2026-01-01T00:00:00.000Z",
      "fulfilled": true,
      "actualPaymentDate": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

**D365 queries (production mode)**
```
GET /tasks?$filter=_regardingobjectid_value eq {customerId}
GET /appointments?$filter=_regardingobjectid_value eq {customerId}
```

---

### `get_customers_with_outstanding_balance`

Return all customer IDs that have active invoices in the ERP system.

**Input**
```json
{}
```
*(No parameters)*

**Output** — `string[]`
```json
["CUST-001", "CUST-002", "CUST-003"]
```

**D365 query (production mode)**
```
GET /invoices?$select=_customerid_value&$top=100
```

---

### `update_customer_notes`

Append a collections activity note to the customer record in Dynamics 365.

**Input**
```json
{
  "customerId": "CUST-001",
  "note": "Spoke with AP dept — payment expected by March 1, 2026"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `customerId` | `string` | Yes | Customer ID in the ERP system |
| `note` | `string` | Yes | Note text to append to the customer record |

**Output**
```json
{ "success": true }
```

**D365 operation (production mode)**
```
PATCH /accounts({customerId})
  body: { description: "{note}\n[Updated: {timestamp}]" }
```

---

## Running the Server

### Standalone (for manual testing or external integration)

```bash
# After building
npm run mcp-server

# During development (ts-node)
npm run mcp-server:dev
```

The server communicates over **stdin/stdout** using JSON-RPC 2.0 message framing. Once running, you can send MCP protocol messages directly:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} }
```

### Automatic (via ERPConnector)

When any code calls `ERPConnector.getARAgingData()` (or any other method), the connector automatically:
1. Resolves the server entry point (`dist/mcp/erpMcpServer.js` or `src/mcp/erpMcpServer.ts`)
2. Spawns the server as a child process
3. Establishes the MCP client connection over stdio
4. Calls the appropriate tool
5. Returns the parsed TypeScript type

The server process is reused for the lifetime of the `ERPConnector` instance and shut down on `connector.close()`.

---

## Running Examples

### Quick start — demo mode (no D365 credentials needed)

Ensure `.env` has `DEMO_MODE=true`, then:

```bash
# See all available MCP tools and their schemas
npx ts-node examples/mcp-client-example.ts list

# Full walkthrough: all 5 tools, single customer
npx ts-node examples/mcp-client-example.ts all CUST-001
```

### Individual tool calls

```bash
# Fetch AR aging buckets for a customer
npx ts-node examples/mcp-client-example.ts aging CUST-001

# Fetch payment history and promise-to-pay records
npx ts-node examples/mcp-client-example.ts history CUST-002

# List all customers with outstanding balances
npx ts-node examples/mcp-client-example.ts customers

# Write a collections note back to the ERP
npx ts-node examples/mcp-client-example.ts notes CUST-001 "Agreed to payment plan, first installment March 1"
```

### Expected output — `list`

```
────────────────────────────────────────────────────────────
  LIST TOOLS — Discover what the ERP MCP Server exposes
────────────────────────────────────────────────────────────
Connecting to ERP MCP Server via stdio transport...

Found 4 tool(s):

  Tool: get_ar_aging_data
  Description: Fetch AR aging data for a customer from the ERP system (Dynamics 365)...
  Parameters:
    • customerId: string (required) — Customer ID in the ERP system

  Tool: get_payment_history
  Description: Fetch payment history for a customer...
  Parameters:
    • customerId: string (required) — Customer ID in the ERP system

  Tool: get_customers_with_outstanding_balance
  Description: Return all customer IDs that have outstanding balances...
  Parameters: none

  Tool: update_customer_notes
  Description: Append a collections note to the customer record...
  Parameters:
    • customerId: string (required) — Customer ID in the ERP system
    • note: string (required) — Note content to record
```

### Expected output — `all CUST-001`

```
╔══════════════════════════════════════════════════════════════╗
║         ERP MCP Server — Full Tool Walkthrough              ║
╚══════════════════════════════════════════════════════════════╝

Target customer: CUST-001
Demo mode:       ON (mock data)

────────────────────────────────────────────────────────────
  Step 1 of 5 — Discover available MCP tools
────────────────────────────────────────────────────────────
Server exposes 4 tools:
  • get_ar_aging_data
  • get_payment_history
  • get_customers_with_outstanding_balance
  • update_customer_notes

────────────────────────────────────────────────────────────
  Step 2 of 5 — get_customers_with_outstanding_balance
────────────────────────────────────────────────────────────
Customers with outstanding balances: CUST-001, CUST-002, CUST-003

────────────────────────────────────────────────────────────
  Step 3 of 5 — get_ar_aging_data (CUST-001)
────────────────────────────────────────────────────────────
Customer: Contoso Ltd
Total Outstanding: $125,000
  Current:   $50,000
  30d:       $30,000
  60d:       $25,000
  90d:       $15,000
  120d+:     $5,000

────────────────────────────────────────────────────────────
  Step 4 of 5 — get_payment_history (CUST-001)
────────────────────────────────────────────────────────────
Transactions:    12
On-time rate:    67.0%
Avg payment:     35 days
Promises kept:   1 / 2

────────────────────────────────────────────────────────────
  Step 5 of 5 — update_customer_notes (CUST-001)
────────────────────────────────────────────────────────────
✅ Note written: "[MCP Example] Full walkthrough completed at 2026-02-19T..."

────────────────────────────────────────────────────────────
All 5 MCP tool interactions completed successfully.
```

---

## Protocol Details

The server uses the **stdio transport** defined in the MCP specification:

| Aspect | Detail |
|---|---|
| **Transport** | stdio (stdin/stdout) |
| **Framing** | Newline-delimited JSON-RPC 2.0 |
| **SDK** | `@modelcontextprotocol/sdk` v1.26.0 |
| **Methods supported** | `tools/list`, `tools/call` |
| **Initialization** | Standard MCP handshake on connect |

### Message format

**Tool list request**
```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} }
```

**Tool call request**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_ar_aging_data",
    "arguments": { "customerId": "CUST-001" }
  }
}
```

**Tool call response**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"customerId\":\"CUST-001\",\"customerName\":\"Contoso Ltd\",...}"
      }
    ]
  }
}
```

**Error response**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{ "type": "text", "text": "{\"error\":\"Failed to fetch AR aging data\"}" }],
    "isError": true
  }
}
```

---

## Configuration

All configuration is via environment variables (inherited from the parent process or `.env`):

| Variable | Used For | Required |
|---|---|---|
| `DEMO_MODE` | `true` = mock data, `false` = live D365 | No (default: unset = live) |
| `ERP_API_ENDPOINT` | Dynamics 365 OData endpoint | Production only |
| `ERP_RESOURCE` | D365 resource URL for OAuth scope | Production only |
| `ERP_TENANT_ID` | Azure AD tenant ID | Production only |
| `ERP_CLIENT_ID` | Azure AD app client ID | Production only |
| `ERP_CLIENT_SECRET` | Azure AD app client secret | Production only |

---

## Adding New Tools

To add a new ERP tool to the server:

1. **Add the data function** in `src/mcp/erpMcpServer.ts`:
```typescript
async function getCustomerCreditLimit(customerId: string): Promise<number> {
  if (DEMO_MODE) return 100000;
  const token = await getAccessToken();
  const res = await axios.get(`${ERP_API_ENDPOINT}/accounts(${customerId})?$select=creditlimit`, { headers: erpHeaders(token) });
  return res.data.creditlimit;
}
```

2. **Register the tool schema** in the `ListToolsRequestSchema` handler:
```typescript
{
  name: 'get_customer_credit_limit',
  description: 'Fetch the credit limit for a customer.',
  inputSchema: {
    type: 'object',
    properties: { customerId: { type: 'string', description: 'Customer ID' } },
    required: ['customerId'],
  },
},
```

3. **Add the case** in the `CallToolRequestSchema` handler:
```typescript
case 'get_customer_credit_limit': {
  const data = await getCustomerCreditLimit(args.customerId as string);
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}
```

4. **Add the wrapper method** in `src/connectors/erpConnector.ts`:
```typescript
async getCustomerCreditLimit(customerId: string): Promise<number> {
  return this.callTool<number>('get_customer_credit_limit', { customerId });
}
```

5. Rebuild: `npm run build`

---

## Related Files

| File | Role |
|---|---|
| `src/mcp/erpMcpServer.ts` | MCP server — tool definitions + D365 logic |
| `src/connectors/erpConnector.ts` | MCP client — spawns server, calls tools |
| `examples/mcp-client-example.ts` | Runnable example — direct MCP interaction |
| `src/agents/collectionsAgent.ts` | High-level orchestrator using ERPConnector |
| `docs/ARCHITECTURE.md` | Full system architecture |
| `docs/SETUP.md` | Configuration and credentials setup |
