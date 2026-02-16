# Intelligent AR Collections & Dunning System

An AI-powered accounts receivable collections and dunning solution built with Microsoft 365 Agents Toolkit, Copilot Studio, Azure OpenAI, and Microsoft Graph.

## Features

- **ML-Based Risk Scoring**: Analyze AR aging and payment history to identify high-risk accounts
- **Automated Prioritization**: Intelligently prioritize collection efforts based on risk levels
- **GenAI-Powered Communications**: Generate personalized dunning emails and Teams messages
- **Payment Plan Proposals**: Automatically create tailored payment plans
- **Promise Tracking**: Track and monitor customer payment promises
- **ERP/CRM Integration**: Seamlessly update notes and data in your existing systems
- **Multi-Channel Communication**: Reach customers via email (Outlook) and Teams

## Architecture

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

## Setup

### Prerequisites

- Node.js 18 or higher
- Azure OpenAI account with GPT-4 deployment
- Microsoft 365 tenant with appropriate permissions
- ERP system with API access

### Installation

```bash
npm install
```

### Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Configure your environment variables:

```env
# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4

# Microsoft Graph Configuration
GRAPH_CLIENT_ID=your-client-id
GRAPH_CLIENT_SECRET=your-client-secret
GRAPH_TENANT_ID=your-tenant-id

# ERP Configuration
ERP_API_ENDPOINT=https://your-erp-system.com/api
ERP_API_KEY=your-erp-api-key

# Application Settings
PORT=3000
RISK_THRESHOLD_HIGH=0.7
RISK_THRESHOLD_MEDIUM=0.4
```

### Build

```bash
npm run build
```

### Run

```bash
npm start
```

## Usage

### Programmatic API

```typescript
import { CollectionsAgent } from './agents/collectionsAgent';

const agent = new CollectionsAgent();

// Analyze customer risk
const riskScore = await agent.analyzeCustomerRisk('CUST-001');
console.log(`Risk Level: ${riskScore.riskLevel}`);

// Send dunning email
await agent.sendDunningEmail('CUST-001', 'customer@example.com');

// Create payment plan
await agent.proposePaymentPlan('CUST-001', 'customer@example.com', 6);

// Process all high-risk customers
await agent.processHighRiskCustomers();

// Record promise to pay
await agent.recordPromiseToPay('CUST-001', 5000, '2026-03-01', 'Customer committed to payment');
```

### Copilot Studio Integration

The system includes a declarative agent configuration that can be imported into Copilot Studio:

1. Open Copilot Studio
2. Create a new agent or edit an existing one
3. Import the declarative agent configuration from `src/agents/declarativeAgent.json`
4. Configure the Graph connectors for AR aging and payment history data
5. Deploy the agent

### Teams/Outlook Plugins

The system integrates with Teams and Outlook through Microsoft Graph API:

- **Email**: Send dunning emails directly through Outlook
- **Teams**: Send follow-up messages and create chats with customers
- **Notifications**: Receive alerts about high-risk accounts

## Risk Scoring Algorithm

The risk scoring algorithm considers three main factors:

1. **Aging Score (40%)**: Based on the distribution of outstanding balances across aging buckets
2. **Payment History Score (35%)**: Based on average payment days and on-time payment rate
3. **Promise Keeping Score (25%)**: Based on the ratio of fulfilled to broken payment promises

Risk levels are determined by thresholds:
- **High Risk**: Score ≥ 0.7
- **Medium Risk**: Score ≥ 0.4
- **Low Risk**: Score < 0.4

## API Endpoints

### ERP Connector Expected Endpoints

The ERP connector expects the following endpoints:

- `GET /ar-aging/{customerId}`: Get AR aging data
- `GET /payment-history/{customerId}`: Get payment history
- `GET /customers/outstanding`: Get list of customers with outstanding balances
- `POST /customers/{customerId}/notes`: Add customer notes

### Response Formats

See `src/types.ts` for detailed interface definitions.

## Development

### Project Structure

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
├── types.ts                      # TypeScript interfaces
└── index.ts                      # Main entry point
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Compliance & Best Practices

- All communications are professional and compliant with collections regulations
- Customer data is handled securely
- All actions are logged for audit trails
- Respects customer communication preferences
- Follows FDCPA (Fair Debt Collection Practices Act) guidelines

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or contributions, please open an issue on GitHub.
