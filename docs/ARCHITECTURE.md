# Architecture Overview

## System Architecture

The system is built as two complementary layers that share the same Dynamics 365 data source:

```
╔═══════════════════════════════════════════════════════════════════╗
║                    CONVERSATIONAL LAYER                           ║
║                                                                   ║
║   ┌─────────────────────────────────────────────────────────┐     ║
║   │              M365 Copilot Chat                          │     ║
║   │         (finance user interaction)                      │     ║
║   └──────────────────────┬──────────────────────────────────┘     ║
║                          │                                        ║
║   ┌──────────────────────▼──────────────────────────────────┐     ║
║   │            AR Collections Assistant                     │     ║
║   │              (Copilot Studio Agent)                     │     ║
║   │                                                         │     ║
║   │  • Natural language queries                             │     ║
║   │  • Risk assessment via instructions                     │     ║
║   │  • Draft communications                                 │     ║
║   │  • Payment plan proposals                               │     ║
║   └──────────────────────┬──────────────────────────────────┘     ║
║                          │  Dynamics 365 Knowledge Sources        ║
║                          │  (Account, Invoice, Task, Appointment) ║
╚══════════════════════════╪═══════════════════════════════════════╝
                           │
╔══════════════════════════╪═══════════════════════════════════════╗
║                    EXECUTION LAYER                                ║
║                          │                                        ║
║   ┌──────────────────────▼──────────────────────────────────┐     ║
║   │              Collections Agent                          │     ║
║   │              (collectionsAgent.ts)                      │     ║
║   │         Main orchestration & business logic             │     ║
║   └──────┬───────────────────────────────────┬──────────────┘     ║
║          │                                   │                    ║
║   ┌──────▼─────────────┐        ┌────────────▼────────────┐       ║
║   │   Risk Scoring     │        │     Dunning Service     │       ║
║   │   Service          │        │                         │       ║
║   │                    │        │  • GPT-5 email drafting │       ║
║   │  • Aging score 50% │        │  • GPT-5 Teams messages │       ║
║   │  • Payment score   │        │  • Fallback templates   │       ║
║   │    30%             │        └────────────┬────────────┘       ║
║   │  • Promise score   │                     │                    ║
║   │    20%             │        ┌────────────▼────────────┐       ║
║   │  • GPT-5 analysis  │        │   Payment Plan Service  │       ║
║   └──────┬─────────────┘        │                         │       ║
║          │                      │  • Amortization calc    │       ║
║          │                      │  • HTML email format    │       ║
║          │                      └────────────┬────────────┘       ║
║          │                                   │                    ║
║   ┌──────▼────────────────────────────────────▼──────────────┐    ║
║   │                    Connectors                            │    ║
║   │  ┌─────────────────────┐   ┌──────────────────────────┐  │    ║
║   │  │   ERP Connector     │   │    Graph Connector       │  │    ║
║   │  │  (erpConnector.ts)  │   │  (graphConnector.ts)     │  │    ║
║   │  │                     │   │                          │  │    ║
║   │  │  • D365 OData API   │   │  • /me/sendMail          │  │    ║
║   │  │  • OAuth2 client    │   │  • /chats (create)       │  │    ║
║   │  │    credentials      │   │  • /chats/{id}/messages  │  │    ║
║   │  │  • Account queries  │   │  • /users/{email}        │  │    ║
║   │  │  • Invoice queries  │   │  • Interactive browser   │  │    ║
║   │  │  • Task queries     │   │    authentication        │  │    ║
║   │  │  • Appt. queries    │   └──────────────┬───────────┘  │    ║
║   │  │  • Account PATCH    │                  │              │    ║
║   │  └──────────┬──────────┘                  │              │    ║
║   └─────────────╪───────────────────────────╪──────────────┘      ║
╚═════════════════╪═══════════════════════════╪════════════════════╝
                  │                           │
    ┌─────────────▼──────────┐   ┌────────────▼────────────────┐
    │    Dynamics 365        │   │     Microsoft 365           │
    │                        │   │                             │
    │  Entities:             │   │  • Outlook (send email)     │
    │  • account             │   │  • Teams (create chat,      │
    │  • invoice             │   │    send message)            │
    │  • invoicedetail       │   │  • Azure AD (user lookup)   │
    │  • task                │   │                             │
    │  • appointment         │   └─────────────────────────────┘
    └────────────────────────┘
                  │
    ┌─────────────▼──────────┐
    │    Azure OpenAI        │
    │                        │
    │  • GPT-5 reasoning     │
    │  • Risk recommendations│
    │  • Email content gen   │
    │  • Teams message gen   │
    └────────────────────────┘
```

---

## Data Flow

### 1. Risk Analysis Flow

```
Collections Agent
  └─▶ ERPConnector.getARAgingData(customerId)
        └─▶ GET /accounts({customerId})            → customer name
        └─▶ GET /invoices?filter=customerid        → active invoices
        └─▶ GET /invoicedetails?filter=invoiceid   → line items (for totals)
        └─▶ calculateARAgingFromDynamicsInvoices() → aging buckets
  └─▶ ERPConnector.getPaymentHistory(customerId)
        └─▶ GET /tasks?filter=regardingobjectid    → payment records
        └─▶ GET /appointments?filter=regardingobjectid → promise records
        └─▶ calculatePaymentHistoryFromRecords()   → stats
  └─▶ RiskScoringService.calculateRiskScore(arData, paymentHistory)
        └─▶ calculateAgingScore()                  → 50% weight
        └─▶ calculatePaymentHistoryScore()         → 30% weight
        └─▶ calculatePromiseKeepingScore()         → 20% weight
        └─▶ Azure OpenAI GPT-5                     → recommendation text
  └─▶ Returns: RiskScore { score, riskLevel, factors, recommendation }
```

### 2. Dunning Communication Flow (High Risk)

```
Collections Agent
  └─▶ analyzeCustomerRisk()             → RiskScore (high)
  └─▶ DunningService.generateDunningEmail(customerName, arData, riskScore)
        └─▶ Azure OpenAI GPT-5          → personalized HTML email
        └─▶ Fallback template           → if GPT-5 unavailable
  └─▶ GraphConnector.sendEmail(to, subject, body)
        └─▶ InteractiveBrowserCredential → user authentication
        └─▶ POST /me/sendMail           → email sent from user's mailbox
  └─▶ DunningService.generateTeamsMessage(customerName, arData, riskScore)
        └─▶ Azure OpenAI GPT-5          → brief Teams message
  └─▶ GraphConnector.createChat(collectionsEmail)
        └─▶ GET /me                     → signed-in user ID
        └─▶ GET /users/{email}          → recipient user ID
        └─▶ POST /chats (oneOnOne)      → chat created with both members
  └─▶ GraphConnector.sendTeamsMessage(chatId, message)
        └─▶ POST /chats/{chatId}/messages → message sent
  └─▶ ERPConnector.updateCustomerNotes(customerId, note)
        └─▶ PATCH /accounts({customerId}) → audit trail in D365
```

### 3. Payment Plan Flow (Medium Risk)

```
Collections Agent
  └─▶ analyzeCustomerRisk()             → RiskScore (medium)
  └─▶ PaymentPlanService.createPaymentPlan(arData, months)
        └─▶ calculateMonthlyPayment()   → amortization formula
        └─▶ generatePaymentSchedule()   → monthly installments array
        └─▶ formatPlanForEmail()        → HTML formatted schedule
  └─▶ GraphConnector.sendEmail(to, subject, body)
        └─▶ POST /me/sendMail           → payment plan email sent
  └─▶ ERPConnector.updateCustomerNotes()
        └─▶ PATCH /accounts({customerId}) → plan recorded in D365
```

### 4. Batch Prioritization Flow

```
Collections Agent
  └─▶ ERPConnector.getCustomersWithOutstandingBalance()
        └─▶ GET /invoices?$select=_customerid_value → unique customer IDs
  └─▶ For each customer:
        └─▶ analyzeCustomerRisk()       → RiskScore
  └─▶ prioritizeCollectionEfforts()
        └─▶ sort by (riskScore × 0.6) + (outstandingBalance × 0.4)
  └─▶ Returns: PrioritizedCustomer[] sorted by priority score
```

---

## Authentication Architecture

The system uses **two different authentication flows** depending on the integration:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Azure AD (Entra ID)                        │
└────────────────────────────────────────────────────────────────┘
              │                              │
    ┌─────────▼──────────┐       ┌──────────▼───────────────┐
    │  Client Credentials│       │  Interactive Browser     │
    │  Flow (App-Only)   │       │  Flow (Delegated)        │
    │                    │       │                          │
    │  Used for:         │       │  Used for:               │
    │  Dynamics 365 API  │       │  Microsoft Graph API     │
    │                    │       │                          │
    │  ClientSecretCred- │       │  InteractiveBrowserCred- │
    │  ential            │       │  ential                  │
    │  (erpConnector.ts) │       │  (graphConnector.ts)     │
    │                    │       │                          │
    │  No user required  │       │  Browser opens once      │
    │  Runs automated    │       │  Token cached 90 days    │
    │  Service account   │       │  Managed device aware    │
    │  in D365           │       │  Conditional Access ok   │
    └─────────┬──────────┘       └──────────┬───────────────┘
              │                             │
    ┌─────────▼──────────┐       ┌──────────▼───────────────┐
    │   Dynamics 365     │       │    Microsoft Graph       │
    │   OData REST API   │       │    REST API              │
    │   v9.2             │       │    v1.0                  │
    └────────────────────┘       └──────────────────────────┘
```

### Dynamics 365 Permissions Required

| Permission | Type | Purpose |
|---|---|---|
| `Dynamics CRM — user_impersonation` | Delegated | Access D365 as application user |

### Microsoft Graph Permissions Required

| Permission | Type | Purpose |
|---|---|---|
| `Mail.Send` | Delegated | Send dunning emails from user's mailbox |
| `Chat.Create` | Delegated | Create one-on-one Teams chats |
| `ChatMessage.Send` | Delegated | Send messages in Teams chats |
| `User.Read` | Delegated | Read signed-in user's profile |
| `User.ReadBasic.All` | Delegated | Look up recipient user profiles |

---

## Dynamics 365 Entity Model

The system reads from and writes to these Dynamics 365 entities:

```
┌────────────────────────────────────────────────────────────────┐
│  account (READ + WRITE)                                        │
│  ─────────────────────────────────────────────────────────     │
│  accountid       PK — used for all related queries            │
│  name            Customer display name                        │
│  description     Collections notes (PATCH write-back)        │
└────────────────────┬───────────────────────────────────────────┘
                     │ 1:many
        ┌────────────▼────────────────────────────────────────┐
        │  invoice (READ)                                     │
        │  ────────────────────────────────────────────────── │
        │  invoiceid          PK                              │
        │  _customerid_value  FK → account                    │
        │  totalamount        Calculated from invoicedetails  │
        │  duedate            Used for aging bucket calc      │
        │  datedelivered      Invoice issue date              │
        │  statecode          0 = Active (only active queried)│
        └────────────┬────────────────────────────────────────┘
                     │ 1:many
        ┌────────────▼────────────────────────────────────────┐
        │  invoicedetail (READ)                               │
        │  ────────────────────────────────────────────────── │
        │  invoicedetailid    PK                              │
        │  _invoiceid_value   FK → invoice                    │
        │  extendedamount     Line item total (summed for     │
        │  baseamount         invoice totalamount)            │
        │  quantity           Used if extended/base missing   │
        │  priceperunit                                       │
        └─────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  task (READ)  — Payment history records                        │
│  ─────────────────────────────────────────────────────────     │
│  _regardingobjectid_value  FK → account                       │
│  subject     "Payment Received - On Time"                     │
│              "Payment Received - X days late"                 │
│  actualend   Date payment was received                        │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  appointment (READ)  — Promise-to-pay records                  │
│  ─────────────────────────────────────────────────────────     │
│  _regardingobjectid_value  FK → account                        │
│  subject     "Promise to Pay - Fulfilled"                      │
│              "Promise to Pay - Broken"                         │
│  scheduledend  Promise due date                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Risk Scoring Algorithm

### Factor Calculations

**Aging Score (50% weight)**
```typescript
const agedPercent = (days90 + days120Plus) / totalOutstanding;
const agingScore  = Math.min(agedPercent * 2, 1.0);
```
Balances over 90 days old drive the aging risk. Doubling the percentage means 50%
aged = 100% aging score, reflecting low collectability of heavily aged debt.

**Payment History Score (30% weight)**
```typescript
// Derived from Task records: parse "X days late" from subject
const latenessScore  = Math.min(averagePaymentDays / 90, 1.0);
const paymentScore   = (latenessScore + (1 - onTimePaymentRate)) / 2;
```
Combines two signals: how late payments typically are, and how often they're on time.

**Promise Keeping Score (20% weight)**
```typescript
// Derived from Appointment records: count Fulfilled vs Broken subjects
const promiseKeepingScore = brokenPromises / totalPromises;
```
Customers who repeatedly break commitments are higher risk regardless of balance size.

**Combined Score**
```typescript
const rawScore = (agingScore × 0.50) + (paymentScore × 0.30) + (promiseKeepingScore × 0.20);
```

### Risk Thresholds (configurable via `.env`)

| Risk Level | Default Threshold | Automated Action |
|---|---|---|
| **High** | ≥ 50% | Urgent dunning email + Teams alert to collections team |
| **Medium** | ≥ 30% | Payment plan proposal email |
| **Low** | < 30% | Standard reminder email |

### AI Enhancement

Azure OpenAI GPT-5 receives the calculated score and all three factor values,
then generates a context-aware recommendation string. For example:

> "Customer has a high risk score of 55.8%, driven primarily by 35.8% of balance
> aged 90+ days and a 75% broken promise rate. Recommend immediate phone contact,
> requesting partial payment of the 120+ day balance ($450K) within 5 business days.
> Escalate to senior collector if no response."

---

## Technology Stack

### Core Runtime
| Component | Technology | Version |
|---|---|---|
| Language | TypeScript | 5.x |
| Runtime | Node.js | 18+ |
| HTTP Client | axios | Latest |
| Build | tsc (TypeScript compiler) | — |

### Microsoft Services
| Service | SDK | Auth Method |
|---|---|---|
| Azure OpenAI (GPT-5) | `openai` | API Key or Entra ID |
| Dynamics 365 | axios + OData | Client Credentials |
| Microsoft Graph | `@microsoft/microsoft-graph-client` | Interactive Browser |
| Azure Identity | `@azure/identity` | — |

### Copilot Studio
| Component | Details |
|---|---|
| Agent type | Generative AI agent |
| Knowledge source | Dynamics 365 (4 entities) |
| Instructions | Risk scoring framework + communication guidelines |
| Channel | Microsoft 365 Copilot Chat |

---

## Workflow Modes

```
DEMO_MODE=true
  └─▶ Mock data returned from erpConnector.ts
  └─▶ No Dynamics 365 connection required
  └─▶ Useful for testing without D365 access

DEMO_MODE=false  (default)
  └─▶ Live Dynamics 365 OData queries
  └─▶ Random customer selection per workflow run
  └─▶ Real invoice aging, payment history, promise records
```

---

## Copilot Studio vs Execution Layer Comparison

| Capability | Copilot Studio Agent | Execution Layer (Node.js) |
|---|---|---|
| Natural language queries | ✅ | ❌ |
| Dynamics 365 data reading | ✅ Direct knowledge source | ✅ OData REST API |
| Risk score calculation | ✅ Via GPT + instructions | ✅ Weighted algorithm + GPT-5 |
| Draft emails / messages | ✅ AI generation | ✅ GPT-5 generation |
| Send emails | ❌ Read-only knowledge | ✅ Microsoft Graph `/me/sendMail` |
| Send Teams messages | ❌ Read-only knowledge | ✅ Microsoft Graph `/chats` |
| Write back to Dynamics 365 | ❌ | ✅ PATCH `/accounts` |
| Payment plan calculation | ✅ AI reasoning | ✅ Amortization formula |
| Runs without user present | ❌ Requires Copilot session | ✅ Headless after first auth |

---

## Production Deployment Architecture

For production deployment beyond the current local/demo setup:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Azure Cloud                             │
│                                                                 │
│  ┌──────────────────┐        ┌──────────────────────────────┐   │
│  │  Azure App       │        │  Azure Functions             │   │
│  │  Service         │        │  (Scheduled batch jobs)      │   │
│  │  (REST API host) │        │  e.g. daily high-risk scan   │   │
│  └──────────────────┘        └──────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────┐        ┌──────────────────────────────┐   │
│  │  Azure OpenAI    │        │  Azure Key Vault             │   │
│  │  (GPT-5)         │        │  (ERP_CLIENT_SECRET, keys)   │   │
│  └──────────────────┘        └──────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────┐        ┌──────────────────────────────┐   │
│  │  App Insights    │        │  Managed Identity            │   │
│  │  (telemetry)     │        │  (replace client secrets)    │   │
│  └──────────────────┘        └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                    │                        │
         ┌──────────▼──────────┐   ┌─────────▼────────────┐
         │   Dynamics 365      │   │   Microsoft 365      │
         │   (Dataverse)       │   │   (Graph API)        │
         └─────────────────────┘   └──────────────────────┘
```

**Recommended production changes:**
- Replace interactive browser auth with a **service account + client credentials** for Graph
- Use **Azure Managed Identity** instead of client secrets where possible
- Apply **Exchange ApplicationAccessPolicy** to restrict Mail.Send to specific mailboxes
- Add **Application Insights** for collections KPI telemetry

---

## Compliance & Security

| Concern | Implementation |
|---|---|
| **FDCPA compliance** | Professional tone enforced in GPT-5 system prompts |
| **Audit trail** | All actions written to D365 account description |
| **Least privilege** | Delegated permissions only — Graph acts as signed-in user |
| **Device compliance** | InteractiveBrowserCredential passes device state to Azure AD |
| **Conditional Access** | Supported via interactive browser authentication |
| **Secret rotation** | D365 client secret should rotate every 90 days |

---

## Related Documentation

- [SETUP.md](SETUP.md) — Step-by-step configuration guide
- [COPILOT_STUDIO_PLUGINS.md](COPILOT_STUDIO_PLUGINS.md) — Copilot Studio agent configuration
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) — Component overview
- [../README.md](../README.md) — Project overview
