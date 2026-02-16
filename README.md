# Intelligent AR Collections & Dunning System

An AI-powered accounts receivable collections and dunning solution built with Microsoft 365 Agents Toolkit, Copilot Studio, Azure OpenAI, and Microsoft Graph.

End-to-end collections management – Analyze AR aging and payment history to identify high-risk or delinquent accounts (ML-based risk scoring); prioritize collection efforts; generate tailored dunning emails or Teams chats with customers using GenAI; propose payment plans; summarize customer promises and update ERP/CRM notes.

## 🌟 Features

- **ML-Based Risk Scoring**: Analyze AR aging and payment history to identify high-risk accounts using Azure OpenAI
- **Intelligent Prioritization**: Automatically prioritize collection efforts based on risk scores and outstanding balances
- **GenAI-Powered Communications**: Generate personalized dunning emails and Teams messages
- **Payment Plan Proposals**: Automatically create tailored payment plans with amortization
- **Promise Tracking & Summarization**: Track customer payment promises and analyze fulfillment rates
- **ERP/CRM Integration**: Seamlessly update notes and data in your existing systems
- **Multi-Channel Communication**: Reach customers via email (Outlook) and Teams

## 🏗️ Architecture

### Components

1. **Declarative Agent** (`src/agents/declarativeAgent.json`)
   - Configured for M365 Agents Toolkit & Copilot Studio
   - Defines capabilities, actions, and conversation starters

2. **Collections Agent** (`src/agents/collectionsAgent.ts`)
   - Main orchestration logic
   - Coordinates between services and connectors

3. **Services**
   - **Risk Scoring Service**: ML-based risk calculation using Azure OpenAI
   - **Dunning Service**: GenAI-powered communication generation
   - **Payment Plan Service**: Automated payment plan creation

4. **Connectors**
   - **ERP Connector**: Interface to AR aging and payment data
   - **Graph Connector**: Microsoft Graph API for email, Teams, and CRM

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- Azure OpenAI account with GPT-4 deployment
- Microsoft 365 tenant with appropriate permissions
- ERP system with API access

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Lwhieldon/Intelligent-AR-Collections-Dunning.git
cd Intelligent-AR-Collections-Dunning
```

2. Install dependencies:
```bash
npm install
```

### Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Configure your environment variables in `.env`

### Build and Run

```bash
npm run build
npm start
```

## 📖 Documentation

- [Setup Guide](SETUP.md) - Detailed setup and configuration instructions
- [Copilot Studio Plugins](docs/COPILOT_STUDIO_PLUGINS.md) - Plugin configuration guide
- [Examples](examples/) - Example workflows and usage patterns

## 🔍 Risk Scoring Algorithm

The risk scoring algorithm considers three main factors:

1. **Aging Score (40%)**: Based on the distribution of outstanding balances across aging buckets
2. **Payment History Score (35%)**: Based on average payment days and on-time payment rate
3. **Promise Keeping Score (25%)**: Based on the ratio of fulfilled to broken payment promises

Risk levels:
- **High Risk**: Score ≥ 0.7
- **Medium Risk**: Score ≥ 0.4
- **Low Risk**: Score < 0.4

## 💻 Usage Example

```typescript
import { CollectionsAgent } from './agents/collectionsAgent';

const agent = new CollectionsAgent();

// Analyze customer risk
const riskScore = await agent.analyzeCustomerRisk('CUST-001');
console.log(`Risk Level: ${riskScore.riskLevel}`);

// Prioritize collection efforts across all customers
const prioritizedCustomers = await agent.prioritizeCollectionEfforts();
console.log(`Top priority: ${prioritizedCustomers[0].customerName}`);

// Summarize customer payment promises
const promiseSummary = await agent.summarizeCustomerPromises('CUST-001');
console.log(`Fulfillment rate: ${promiseSummary.fulfillmentRate * 100}%`);

// Send dunning email
await agent.sendDunningEmail('CUST-001', 'customer@example.com');

// Create payment plan
await agent.proposePaymentPlan('CUST-001', 'customer@example.com', 6);

// Record customer promise
await agent.recordPromiseToPay('CUST-001', 5000, '2026-03-01', 'Payment committed');
```

## 📁 Project Structure

```
src/
├── agents/
│   ├── collectionsAgent.ts      # Main agent orchestration
│   └── declarativeAgent.json    # Copilot Studio configuration
├── connectors/
│   ├── erpConnector.ts          # ERP system integration
│   └── graphConnector.ts        # Microsoft Graph integration
├── services/
│   ├── riskScoringService.ts    # Risk calculation & ML
│   ├── dunningService.ts        # GenAI communication generation
│   └── paymentPlanService.ts    # Payment plan creation
└── types.ts                      # TypeScript interfaces
```

## 🔐 Security & Compliance

- All communications are professional and compliant with collections regulations
- Customer data is handled securely
- All actions are logged for audit trails
- Respects customer communication preferences
- Follows FDCPA (Fair Debt Collection Practices Act) guidelines

## 📄 License

MIT License - See LICENSE file for details
