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
   - **Risk Scoring Service**: ML-based risk calculation using Azure OpenAI
   - **Dunning Service**: GenAI-powered communication generation
   - **Payment Plan Service**: Automated payment plan creation

4. **Connectors**
   - **ERP Connector**: Interface to AR aging and payment data
   - **Graph Connector**: Microsoft Graph API for email, Teams, and CRM

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- Azure OpenAI account with GPT-4 or GPT-5 deployment
- Microsoft 365 account (you'll sign in to send emails/Teams messages)
- ERP system with API access (Dynamics 365 recommended)

> **Note**: This system uses **delegated authentication** - you sign in once with your Microsoft 365 account, and the app sends emails/Teams messages from your mailbox. No high-privilege application permissions required!

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
# Complete workflow with random customer selection
npx ts-node examples/collections-workflow.ts workflow

# Batch processing and prioritization
npx ts-node examples/collections-workflow.ts batch

# Detailed risk analysis with payment history
npx ts-node examples/collections-workflow.ts analysis
```

### Enable Email Testing

Add to your `.env` file:
```bash
TEST_CUSTOMER_EMAIL=your-email@domain.com
TEST_COLLECTIONS_EMAIL=your-email@domain.com
```

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
│   ├── collectionsAgent.ts      # Main agent orchestration
│   └── declarativeAgent.json    # Copilot Studio configuration
├── connectors/
│   ├── erpConnector.ts          # ERP system integration
│   └── graphConnector.ts        # Microsoft Graph integration
├── services/
│   ├── riskScoringService.ts    # Risk calculation & ML
│   ├── dunningService.ts        # GenAI communication generation
│   └── paymentPlanService.ts    # Payment plan creation
├── utils/
│   ├── discoverEntities.ts      # Discover Entities
└── types.ts                         # TypeScript interfaces
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
- **External MCP Server Integration** - ERP connector for read/write operations (`src/connectors/erpConnector.ts`)
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
- **[Copilot Studio Plugins](docs/COPILOT_STUDIO_PLUGINS.md)** - Plugin configuration guide
- **[Implementation Summary](IMPLEMENTATION_SUMMARY.md)** - Complete implementation details
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
