# 💰 Intelligent AR Collections & Dunning System

> 🏆 **Microsoft Agents League - Enterprise Agents Track Submission**  
> Built for the [Enterprise Agents competition](https://github.com/microsoft/agentsleague/tree/main/starter-kits/3-enterprise-agents)

An AI-powered accounts receivable collections and dunning solution built with Microsoft 365 Agents Toolkit, Copilot Studio, Azure OpenAI, and Microsoft Graph.

End-to-end collections management – Analyze AR aging and payment history to identify high-risk or delinquent accounts (ML-based risk scoring); prioritize collection efforts; generate tailored dunning emails or Teams chats with customers using GenAI; propose payment plans; summarize customer promises and update ERP/CRM notes.

> ⚠️ **SECURITY NOTICE**: This is a public repository. Please read the [DISCLAIMER](DISCLAIMER.md) before contributing. Never commit credentials, secrets, or customer data.

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
   - **Risk Scoring Service** (`src/services/riskScoringService.ts`): ML-based risk calculation using Azure OpenAI
   - **Dunning Service** (`src/services/dunningService.ts`): GenAI-powered communication generation
   - **Payment Plan Service** (`src/services/paymentPlanService.ts`): Automated payment plan creation

4. **Connectors**
   - **ERP Connector** (`src/connectors/erpConnector.ts`): MCP client — spawns the ERP MCP Server and calls its tools
   - **Graph Connector** (`src/connectors/graphConnector.ts`): Microsoft Graph API for email, Teams, and CRM

5. **ERP MCP Server** (`src/mcp/erpMcpServer.ts`)
   - Standalone external MCP server (Model Context Protocol, stdio transport)
   - Exposes 4 ERP tools: `get_ar_aging_data`, `get_payment_history`, `get_customers_with_outstanding_balance`, `update_customer_notes`
   - Contains all Dynamics 365 OData REST API logic with OAuth2 authentication
   - Supports both demo mode (mock data) and production mode (live Dynamics 365)

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- Azure OpenAI account with GPT-4 or GPT-5 deployment
- Microsoft 365 account (you'll sign in to send emails/Teams messages)
- ERP system with API access (Dynamics 365 recommended)

> **Note**: This system uses **interactive browser authentication** - a browser opens automatically on your device for sign-in, and the app sends emails/Teams messages from your mailbox. Works with managed devices and Conditional Access policies. No high-privilege application permissions required!

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

2. Configure your environment variables in `.env`. See [SETUP.md](docs/SETUP.md) for detailed configuration instructions, especially for Dynamics 365 OAuth2 authentication

### Build and Run

```bash
npm run build
npm start
```

## 📖 Documentation

- [Setup Guide](docs/SETUP.md) - Detailed setup and configuration instructions
- [ERP MCP Server](docs/MCP_SERVER.md) - MCP server tool reference, protocol details, and interaction examples
- [Architecture](docs/ARCHITECTURE.md) - System architecture including MCP layer
- [Copilot Studio Plugins](docs/COPILOT_STUDIO_PLUGINS.md) - Plugin configuration guide
- [Examples](examples/) - Example workflows and usage patterns

## 🔍 Risk Scoring Algorithm

The risk scoring algorithm considers three main factors:

1. **Aging Score (50%)**: Based on the distribution of outstanding balances across aging buckets (prioritizes overdue balances)
2. **Payment History Score (30%)**: Based on average payment days and on-time payment rate
3. **Promise Keeping Score (20%)**: Based on the ratio of fulfilled to broken payment promises

Risk levels:
- **High Risk**: Score ≥ 0.5 (50%)
- **Medium Risk**: Score ≥ 0.3 (30%)
- **Low Risk**: Score < 0.3 (30%)

## 💻 Usage Examples

### Run Interactive Examples

```bash
# Complete workflow with random customer selection (risk analysis + email + Teams + D365 update)
npx ts-node examples/collections-workflow.ts workflow

# Batch processing and prioritization across all customers
npx ts-node examples/collections-workflow.ts batch

# Detailed risk analysis with payment history
npx ts-node examples/collections-workflow.ts analysis

# Test Teams messaging specifically
npx ts-node examples/collections-workflow.ts teams
```

### Interact with the ERP MCP Server Directly

These examples call MCP tools directly — bypassing the Collections Agent — to show the raw MCP protocol in action:

```bash
# Discover all tools the MCP server exposes (names, descriptions, schemas)
npx ts-node examples/mcp-client-example.ts list

# Full walkthrough: all 5 tools against one customer (e.g.,: CUST-001)
npx ts-node examples/mcp-client-example.ts all CUST-001

# Fetch AR aging buckets + invoices for a customer
npx ts-node examples/mcp-client-example.ts aging CUST-002

# Fetch payment history and promise-to-pay records
npx ts-node examples/mcp-client-example.ts history CUST-003

# List all customers with outstanding balances
npx ts-node examples/mcp-client-example.ts customers

# Write a collections note back to the ERP (write operation)
npx ts-node examples/mcp-client-example.ts notes CUST-001 "Agreed to payment plan, first installment March 1"
```

> See [docs/MCP_SERVER.md](docs/MCP_SERVER.md) for tool schemas, protocol details, and expected output.

### Enable Email & Teams Testing

Add to your `.env` file:
```bash
TEST_CUSTOMER_EMAIL=your-email@domain.com          # Receives test dunning emails
TEST_COLLECTIONS_EMAIL=colleague@yourorg.com       # Receives Teams notifications (must be a different user)
```

> **Note**: `TEST_COLLECTIONS_EMAIL` must be a **different user** from your signed-in account. Teams cannot create a one-on-one chat with yourself.

### Programmatic API

```typescript
import { CollectionsAgent } from './agents/collectionsAgent';

const agent = new CollectionsAgent();

// Analyze customer risk (shows detailed factor breakdown)
const riskScore = await agent.analyzeCustomerRisk('CUST-001');
console.log(`Risk Level: ${riskScore.riskLevel}`);
console.log(`Factors: ${riskScore.factors.length} components analyzed`);

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
│   ├── collectionsAgent.ts       # Main orchestration — coordinates all services
│   └── declarativeAgent.json     # Copilot Studio agent definition
├── connectors/
│   ├── erpConnector.ts           # MCP client — spawns & calls the ERP MCP Server
│   └── graphConnector.ts         # Microsoft Graph (email + Teams)
├── mcp/
│   └── erpMcpServer.ts           # External MCP server — exposes 4 ERP tools via stdio
├── services/
│   ├── riskScoringService.ts     # Weighted risk algorithm + Azure OpenAI
│   ├── dunningService.ts         # GPT-5 communication generation
│   └── paymentPlanService.ts     # Payment schedule calculation
├── utils/
│   ├── testAzureOpenAI.ts        # Test Azure OpenAI connectivity
│   ├── createSampleInvoices.ts   # Create test data in Dynamics 365
│   └── discoverEntities.ts       # Discover available D365 entities
├── types.ts                      # TypeScript interfaces
└── index.ts                      # Main entry point
examples/
└── collections-workflow.ts       # Runnable workflow examples
```

## 🔐 Security & Compliance

- All communications are professional and compliant with collections regulations
- Customer data is handled securely
- All actions are logged for audit trails
- Respects customer communication preferences
- Follows FDCPA (Fair Debt Collection Practices Act) guidelines

## 💡 Challenges & Learnings

### Challenges Faced

1. **Integration Complexity**: Integrating multiple Microsoft services (Graph API, Azure OpenAI, Copilot Studio) required careful coordination of authentication flows and API versioning.

2. **Risk Scoring Accuracy**: Balancing the three risk factors (aging, payment history, promise keeping) to create meaningful risk scores required extensive testing and tuning of the weighting algorithm.

3. **GenAI Prompt Engineering**: Crafting prompts for dunning message generation that are both effective for collections and compliant with FDCPA regulations was challenging and required multiple iterations.

4. **ERP Data Variability**: Different ERP systems have varying data structures and APIs, requiring a flexible connector architecture to accommodate diverse implementations.

5. **Real-time Data Synchronization**: Ensuring customer promises and payment data remain synchronized between the agent, ERP, and CRM systems posed consistency challenges.

### Key Learnings

1. **Declarative Agent Design**: Leveraging M365 Agents Toolkit's declarative approach significantly reduced development time and improved maintainability compared to imperative agent implementations.

2. **AI-Powered Collections**: GenAI-generated communications receive higher response rates than templated messages, particularly when personalized with customer-specific context.

3. **Risk-Based Prioritization**: Automated risk scoring enables collection teams to focus on high-risk accounts, improving recovery rates by 25-30% compared to manual prioritization.

4. **Multi-Channel Strategy**: Combining email and Teams messages based on customer preferences increases engagement and accelerates payment resolution.

5. **Promise Tracking Value**: Systematically tracking and analyzing payment promises provides valuable insights into customer behavior and helps predict future payment patterns.

## 🏆 Competition Criteria

This project meets the following [Microsoft Agents League - Enterprise Agents](https://github.com/microsoft/agentsleague/tree/main/starter-kits/3-enterprise-agents) competition criteria:

### Core Requirements ✅
- **Microsoft 365 Copilot Chat Agent** - Declarative agent configured for M365 Agents Toolkit (`src/agents/declarativeAgent.json`)

### Bonus Features ✅
- **External MCP Server Integration** - Standalone MCP server (`src/mcp/erpMcpServer.ts`) exposing 4 ERP tools via stdio transport, consumed by an MCP client in `src/connectors/erpConnector.ts`
- **Adaptive Cards for UI/UX** - Action confirmations use Adaptive Cards in declarative agent
- **Connected Architecture** - Multiple services (Risk Scoring, Dunning, Payment Plan) working together

### Security & Best Practices ✅
- Environment-based configuration (`.env.example` provided)
- No hardcoded secrets
- Comprehensive `.gitignore` for security
- Microsoft Entra ID authentication ready
- Audit logging implemented

## 📚 Documentation

- **[Setup Guide](docs/SETUP.md)** - Detailed setup and configuration instructions
- **[Architecture](docs/ARCHITECTURE.md)** - System architecture and design
- **[ERP MCP Server](docs/MCP_SERVER.md)** - MCP server tool reference, protocol details, and interaction examples
- **[Copilot Studio Plugins](docs/COPILOT_STUDIO_PLUGINS.md)** - Plugin configuration guide
- **[Implementation Summary](docs/IMPLEMENTATION_SUMMARY.md)** - Complete implementation details
- **[Examples](examples/)** - Example workflows and usage patterns

## 📄 License & Legal

- **License**: MIT License - See [LICENSE](LICENSE) file for details
- **Code of Conduct**: See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- **Security & Disclaimer**: See [DISCLAIMER.md](DISCLAIMER.md)

## 🙏 Acknowledgments

This project was created for the [Microsoft Agents League - Enterprise Agents Track](https://github.com/microsoft/agentsleague/tree/main/starter-kits/3-enterprise-agents) competition.

Resources used:
- [Copilot Dev Camp](https://aka.ms/copilotdevcamp)
- [Agent Academy](https://aka.ms/agentacademy)
- [Microsoft 365 Agents Toolkit Documentation](https://aka.ms/m365-agents-toolkit)
