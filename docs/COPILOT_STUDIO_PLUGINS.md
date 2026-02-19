# Copilot Studio Agent Configuration

This document describes how the AR Collections Assistant is configured in Copilot Studio
and how it integrates with Dynamics 365 as its primary data source.

## Architecture Overview

The system uses a **two-layer architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONVERSATIONAL LAYER                         │
│                                                                 │
│   M365 Copilot Chat  ←→  AR Collections Assistant               │
│                           (Copilot Studio Agent)                │
│                               ↕                                 │
│                   Dynamics 365 Knowledge Sources                │
│              (Account, Invoice, Task, Appointment)              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    EXECUTION LAYER                              │
│                                                                 │
│   Collections Engine (Node.js / TypeScript)                     │
│       ↕                  ↕                  ↕                   │
│  Dynamics 365      Azure OpenAI        Microsoft Graph          │
│  (OData REST API)  (GPT-5)            (Email + Teams)           │
└─────────────────────────────────────────────────────────────────┘
```

**Conversational Layer**: The Copilot Studio agent handles natural language queries,
grounded in live Dynamics 365 data via knowledge sources.

**Execution Layer**: The Node.js backend performs risk scoring, generates AI communications,
and sends emails/Teams messages via Microsoft Graph.

---

## Copilot Studio Agent Setup

### Agent Identity

| Field | Value |
|---|---|
| **Name** | AR Collections Assistant |
| **Description** | AI-powered collections and dunning assistant for your organization's accounts receivable team |
| **Environment** | PowerPlatform Sandbox |

### Agent Instructions

The agent is configured with the following system instructions:

```
You are an intelligent AR Collections Assistant for your organization's accounts receivable team.
You help collections specialists manage overdue customer accounts efficiently using real-time
data from Dynamics 365.

## Your Capabilities
You can answer questions about:
- Customer invoice aging (Current, 30, 60, 90, 120+ day buckets)
- Payment history and average days late
- Promise-to-pay records and fulfillment rates
- Customer account status and outstanding balances
- Collection prioritization and recommended actions

## Risk Scoring Framework
When assessing customer risk, use this weighted model:
- Aged Receivables (50% weight): % of balance over 90 days old
  - >50% aged = High risk
  - 25-50% aged = Medium risk
  - <25% aged = Low risk
- Payment History (30% weight): On-time rate and average days late
  - <40% on-time or >45 days late avg = High risk
  - 40-70% on-time = Medium risk
  - >70% on-time = Low risk
- Promise Keeping (20% weight): % of broken payment promises
  - >60% broken = High risk
  - 30-60% broken = Medium risk
  - <30% broken = Low risk

## Risk Thresholds
- HIGH risk (≥50%): Immediate action, escalate if no response in 48 hours
- MEDIUM risk (30-50%): Offer payment plan, follow up this week
- LOW risk (<30%): Standard reminder, automated follow-up

## Communication Guidelines
- HIGH risk: Firm, urgent tone. Reference broken promises. Request immediate partial payment.
- MEDIUM risk: Professional, solution-focused. Lead with payment plan options.
- LOW risk: Friendly reminder. Easy response path.

Always be professional, FDCPA compliant, and reference specific balances and dates from
Dynamics 365 data. Recommend clear next steps with timeframes.
```

### Conversation Starters

Configured in the agent's Overview tab:

| Title | Prompt |
|---|---|
| Morning Priorities | `Show me all customers with overdue balances that need my attention today, ranked by priority` |
| Customer Risk Analysis | `Analyze the risk and payment history for Northwind Traders` |
| Draft Dunning Email | `Draft a firm dunning email for a customer with $450,000 overdue for 120+ days and 6 broken promises` |
| Payment Plan | `Create a 6-month payment plan proposal for a customer with $450,000 overdue balance` |
| Collections Summary | `Give me a summary of our current AR aging position across all customers` |

---

## Dynamics 365 Knowledge Sources

The agent connects directly to Dynamics 365 as its knowledge source. These are the same
entities queried by the backend collections engine.

### How to Add Knowledge Sources

1. In Copilot Studio → **Knowledge** tab
2. Click **"+ Add knowledge"** → **"Dynamics 365"**
3. Select your Dynamics 365 environment
4. Search for and select each entity below

### Selected Entities (4 total)

#### 1. Account (`account`)
**Purpose**: Customer names, contact information, account status, and CRM notes

**Key fields used by the application**:
```
accountid     → Primary key for customer lookups
name          → Customer display name
description   → Collections notes and promise records (written back by engine)
```

**Application query**:
```
GET /api/data/v9.2/accounts({customerId})
```

---

#### 2. Invoice (`invoice`)
**Purpose**: AR aging data — invoice dates, due dates, status, and outstanding amounts

**Key fields used by the application**:
```
invoiceid           → Primary key, used to fetch line items
name                → Invoice reference number
totalamount         → Invoice total (calculated from invoicedetails)
datedelivered       → Invoice issue date (used for aging calculation)
duedate             → Payment due date (used to bucket into aging periods)
statecode           → 0 = Active/unpaid (only active invoices are queried)
statuscode          → Invoice status
_customerid_value   → Foreign key linking invoice to account
```

**Application query**:
```
GET /api/data/v9.2/invoices
  ?$filter=_customerid_value eq {customerId} and statecode eq 0
  &$select=invoiceid,name,totalamount,datedelivered,duedate,statecode,statuscode,createdon
  &$orderby=createdon desc
```

**Aging bucket logic** (calculated from `duedate`):
```
daysOverdue < 0   → Current (not yet due)
daysOverdue 0-29  → Current
daysOverdue 30-59 → 30 days
daysOverdue 60-89 → 60 days
daysOverdue 90-119 → 90 days
daysOverdue ≥ 120  → 120+ days (highest risk bucket)
```

**Note on invoice totals**: Dynamics 365 calculates `totalamount` from `invoicedetail`
(line item) records. The backend queries `invoicedetails` separately and calculates the
sum — this entity is not needed as a knowledge source since totals already appear on
the Invoice record.

---

#### 3. Task (`task`)
**Purpose**: Payment history records — tracks individual payment transactions and delays

**Key fields used by the application**:
```
subject              → Payment record description
                       Format: "Payment Received - On Time" or "Payment Received - X days late"
actualend            → Date payment was received
description          → Additional payment context
statecode            → Task completion status
_regardingobjectid   → Links task to the customer account
```

**Application query**:
```
GET /api/data/v9.2/tasks
  ?$filter=_regardingobjectid_value eq {customerId}
  &$select=subject,actualend,description,statecode,statuscode
  &$top=50
```

**Risk scoring use**: Payment tasks are parsed to calculate:
- `onTimePaymentRate` — count of "On Time" tasks / total tasks
- `averagePaymentDays` — extracted from "X days late" in subject line

---

#### 4. Appointment (`appointment`)
**Purpose**: Promise-to-pay records — tracks customer payment commitments and fulfillment

**Key fields used by the application**:
```
subject              → Promise record description
                       Format: "Promise to Pay - Fulfilled" or "Promise to Pay - Broken"
scheduledend         → Promise due date
description          → Promise amount and context
statuscode           → Appointment outcome
statecode            → 0 = Open, 1 = Completed
_regardingobjectid   → Links appointment to the customer account
```

**Application query**:
```
GET /api/data/v9.2/appointments
  ?$filter=_regardingobjectid_value eq {customerId}
  &$select=subject,scheduledend,description,statuscode,statecode
  &$top=50
```

**Risk scoring use**: Appointment records are parsed to calculate:
- `promiseToPayHistory` — array of fulfilled vs broken promises
- `promiseKeepingScore` — broken promises / total promises (20% weight in risk model)

---

## Authentication

### Dynamics 365 (Execution Layer - Backend)

The backend Node.js application uses **OAuth2 client credentials flow** (service-to-service):

```typescript
// src/connectors/erpConnector.ts
const credential = new ClientSecretCredential(
  process.env.ERP_TENANT_ID,
  process.env.ERP_CLIENT_ID,
  process.env.ERP_CLIENT_SECRET
);

const token = await credential.getToken(`${ERP_RESOURCE}/.default`);
```

**Required environment variables**:
```env
ERP_API_ENDPOINT=https://your-org.api.crm.dynamics.com/api/data/v9.2
ERP_CLIENT_ID=your-app-registration-client-id
ERP_CLIENT_SECRET=your-client-secret
ERP_TENANT_ID=your-tenant-id
ERP_RESOURCE=https://your-org.api.crm.dynamics.com/
```

**Required Azure AD permissions** (Application type):
- `Dynamics CRM` → `user_impersonation`

**Required Dynamics 365 setup**:
1. Create an Application User in Dynamics 365 linked to the Azure AD app
2. Assign the Application User the **Collections Manager** or **System Customizer** security role
3. Ensure the user has read access to: Account, Invoice, Task, Appointment entities

---

### Microsoft Graph (Email + Teams - Execution Layer)

The backend uses **interactive browser authentication** (delegated flow) for sending
emails and Teams messages:

```typescript
// src/connectors/graphConnector.ts
const credential = new InteractiveBrowserCredential({
  tenantId: process.env.GRAPH_TENANT_ID,
  clientId: process.env.GRAPH_CLIENT_ID,
  redirectUri: 'http://localhost:3000',
});
```

**Authentication characteristics**:
- Opens browser automatically on first run
- Passes device compliance for Conditional Access policies
- Works with managed/corporate devices enrolled in Intune
- Token cached after first sign-in

**Required Azure AD app registration configuration**:
- Platform: **Mobile and desktop applications**
- Redirect URI: `http://localhost:3000`
- Allow public client flows: **Yes**

**Required Microsoft Graph delegated permissions**:
| Permission | Purpose |
|---|---|
| `Mail.Send` | Send dunning emails from signed-in user's mailbox |
| `Chat.Create` | Create one-on-one Teams chats |
| `ChatMessage.Send` | Send messages in Teams chats |
| `User.Read` | Read signed-in user profile |
| `User.ReadBasic.All` | Look up recipient user profiles |

**Required environment variables**:
```env
GRAPH_CLIENT_ID=your-app-registration-client-id
GRAPH_TENANT_ID=your-tenant-id
```

**Note**: No client secret required for delegated (interactive browser) authentication.

---

## Dynamics 365 Data Setup

To populate the system with test data, use the provided utility:

```bash
npm run create-invoices
```

This creates the following records in Dynamics 365:

### Invoices (per customer)
- Current invoices
- 30-day overdue invoices
- 60-day overdue invoices
- 90-day overdue invoices
- 120+ day overdue invoices (highest risk — triggers high-risk workflow)

### Tasks (Payment History)
- 20 payment records per customer
- Mix of on-time and late payments
- Subject format: `"Payment Received - On Time"` or `"Payment Received - X days late"`

### Appointments (Promises to Pay)
- 8-9 promise records per customer
- Mix of fulfilled and broken promises
- Subject format: `"Promise to Pay - Fulfilled"` or `"Promise to Pay - Broken"`

---

## Write-Back Operations

The collections engine writes the following data back to Dynamics 365:

### Account Notes (PATCH)
When a collections action is taken (email sent, promise recorded):
```
PATCH /api/data/v9.2/accounts({customerId})
Body: { description: "{note}\n[Updated: {timestamp}]" }
```

This creates a full audit trail of all collections activity on the customer account.

---

## Copilot Studio vs. Backend Engine: What Each Does

| Capability | Copilot Studio Agent | Backend Engine |
|---|---|---|
| **Natural language queries** | ✅ | ❌ |
| **D365 data reading** | ✅ Direct via knowledge source | ✅ Via OData REST API |
| **Risk score calculation** | ✅ Via instructions/reasoning | ✅ Weighted algorithm + GPT-5 |
| **Draft emails/messages** | ✅ AI generation | ✅ GPT-5 generation |
| **Send emails** | ❌ (advisory only) | ✅ Via Microsoft Graph |
| **Send Teams messages** | ❌ (advisory only) | ✅ Via Microsoft Graph |
| **Write back to D365** | ❌ (read-only knowledge) | ✅ PATCH account notes |
| **Payment plan calculation** | ✅ AI reasoning | ✅ Amortization formula |

---

## Security Considerations

- **Client secrets** for Dynamics 365 access should be stored in Azure Key Vault in production
- **Delegated permissions** for Microsoft Graph ensure emails/Teams messages can only be sent
  as the signed-in user — not as any arbitrary user
- **Conditional Access** policies are supported via interactive browser authentication
- **Read-only knowledge** in Copilot Studio ensures the agent cannot modify D365 data
- **Rotate client secrets** every 90 days (Dynamics 365 application user credentials)
- **Audit trail** maintained in Dynamics 365 account description field for all collections actions

---

## Related Documentation

- [SETUP.md](SETUP.md) — Environment configuration and Azure AD setup
- [ARCHITECTURE.md](ARCHITECTURE.md) — Full system architecture
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) — Component overview
- `src/agents/declarativeAgent.json` — Declarative agent definition
- `src/connectors/erpConnector.ts` — Dynamics 365 OData queries
- `src/connectors/graphConnector.ts` — Microsoft Graph integration
