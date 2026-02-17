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
- Azure OpenAI account with GPT-4 or GPT-5 deployment
- Microsoft 365 tenant with appropriate permissions
- ERP system with API access

> **Note**: If using GPT-5 (reasoning model), ensure `max_completion_tokens` is set to 2000+ in your API calls to allow for reasoning tokens plus output. See [testAzureOpenAI.ts](../src/utils/testAzureOpenAI.ts) for an example.

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
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-5
AZURE_OPENAI_API_VERSION=2025-08-07

# Microsoft Graph Configuration
GRAPH_CLIENT_ID=your-client-id
GRAPH_CLIENT_SECRET=your-client-secret
GRAPH_TENANT_ID=your-tenant-id

# ERP Configuration (Dynamics 365)
ERP_API_ENDPOINT=https://your-org.api.crm.dynamics.com/api/data/v9.2
ERP_CLIENT_ID=your-client-id
ERP_CLIENT_SECRET=your-client-secret
ERP_TENANT_ID=your-tenant-id
ERP_RESOURCE=https://your-org.api.crm.dynamics.com/

# Application Settings
PORT=3000
RISK_THRESHOLD_HIGH=0.5
RISK_THRESHOLD_MEDIUM=0.3

# Testing Email & Teams Functionality (Optional)
TEST_CUSTOMER_EMAIL=your-email@domain.com
TEST_COLLECTIONS_EMAIL=your-email@domain.com
```

### Detailed Configuration Steps

#### 1. Azure OpenAI Setup

1. Go to the [Azure Portal](https://portal.azure.com)
2. Create an Azure OpenAI resource or use an existing one
3. Navigate to **Keys and Endpoint**
4. Copy the endpoint URL and one of the keys
5. Create a GPT-4 or GPT-5 deployment and note the deployment name
   - **GPT-4**: Standard model, lower token requirements (50-500 tokens typically sufficient)
   - **GPT-5**: Reasoning model, requires higher token limits (2000+ tokens recommended)
6. Update `.env` with these values

**Testing Your Connection:**
```bash
npm run test-openai
```

This will verify your Azure OpenAI configuration and show the model information, including token usage for reasoning models.

#### 2. Microsoft Graph Configuration

1. Go to the [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations** → **New registration**
3. Register an app for Microsoft Graph access
4. Copy the **Application (client) ID** and **Directory (tenant) ID**
5. Go to **Certificates & secrets** → Create a new client secret
6. Copy the secret value
7. Go to **API permissions** → Add the following Microsoft Graph permissions:
   - `Mail.Send` (for sending emails)
   - `Chat.Create` (for Teams messaging)
   - `User.Read.All` (for user lookups)
8. Grant admin consent for your organization
9. Update `.env` with these credentials

#### 3. Dynamics 365 ERP Configuration (OAuth2)

The system uses **OAuth2 authentication** to connect to Dynamics 365 via the Azure AD client credentials flow.

##### Step 1: Register an Azure AD Application

1. Go to the [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations** → **New registration**
3. Provide a name (e.g., "AR Collections App")
4. Select **Accounts in this organizational directory only**
5. Click **Register**

##### Step 2: Get Application Credentials

1. From the app overview page, copy the **Application (client) ID**
2. Copy the **Directory (tenant) ID**
3. Go to **Certificates & secrets** → **Client secrets** → **New client secret**
4. Add a description (e.g., "AR Collections Secret") and set expiration
5. Click **Add** and immediately copy the **Value** (not the Secret ID)
   - ⚠️ **Important**: The secret value is only shown once! Store it securely.

##### Step 3: Grant Dynamics 365 API Permissions

1. Go to **API permissions** → **Add a permission**
2. Select **Dynamics CRM** (or **APIs my organization uses** → search "Dynamics CRM")
3. Select **Application permissions** (for service-to-service access)
4. Check **user_impersonation** permission
5. Click **Add permissions**
6. Click **Grant admin consent for [Your Organization]**

##### Step 4: Configure Dynamics 365 Application User

1. Log in to your Dynamics 365 environment as an administrator
2. Go to **Settings** → **Security** → **Users**
3. Change the view to **Application Users**
4. Click **New** → Select **Application User** form
5. Fill in the following:
   - **Application ID**: The Client ID from Azure AD
   - **Full Name**: A descriptive name (e.g., "AR Collections Service")
   - **Primary Email**: An email address for notifications
6. Click **Save**
7. Assign the appropriate security roles:
   - **System Administrator** (for full access) or
   - Custom security role with read/write permissions for relevant entities

##### Step 5: Update .env File

Update your `.env` file with the credentials:

```env
# ERP Configuration (Dynamics 365)
ERP_API_ENDPOINT=https://your-org.api.crm.dynamics.com/api/data/v9.2
ERP_CLIENT_ID=<your-application-client-id>
ERP_CLIENT_SECRET=<your-client-secret-value>
ERP_TENANT_ID=<your-tenant-id>
ERP_RESOURCE=https://your-org.api.crm.dynamics.com/
```

**Finding your Dynamics 365 API Endpoint:**
- Log in to Dynamics 365
- Go to **Settings** → **Customizations** → **Developer Resources**
- Copy the **Web API** URL (e.g., `https://org12345678.api.crm.dynamics.com/api/data/v9.2`)

##### Step 6: Test Authentication

After configuration, rebuild and test the connection:

```bash
npm run build
npm start
```

The system will automatically obtain OAuth2 access tokens and use them for all Dynamics 365 API calls.

### Build

```bash
npm run build
```

### Run

```bash
npm start
```

## Usage

### Interactive Examples

Run the example workflows to see the system in action:

```bash
# Complete workflow with random customer selection
npx ts-node examples/collections-workflow.ts workflow

# Batch processing and prioritization
npx ts-node examples/collections-workflow.ts batch

# Detailed risk analysis with payment history
npx ts-node examples/collections-workflow.ts analysis
```

**Features:**
- 🎲 **Random customer selection** - Each run picks a different customer for varied results
- 📊 **Detailed risk breakdown** - Shows all three risk factors (Aging 50%, Payment 30%, Promises 20%)
- 📧 **Email testing** - Set `TEST_CUSTOMER_EMAIL` and `TEST_COLLECTIONS_EMAIL` in `.env` to send actual emails

### Testing Email & Teams Functionality

To test dunning emails and Teams messages:

1. Add your email to `.env`:
   ```bash
   TEST_CUSTOMER_EMAIL=your-email@domain.com
   TEST_COLLECTIONS_EMAIL=your-email@domain.com
   ```

2. Run the workflow:
   ```bash
   npx ts-node examples/collections-workflow.ts workflow
   ```

3. The system will automatically send:
   - **High-risk customers**: Urgent dunning email + Teams message
   - **Medium-risk customers**: Payment plan proposal email
   - **Low-risk customers**: Standard reminder email

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

1. **Aging Score (50%)**: Based on the distribution of outstanding balances across aging buckets (prioritizes overdue balances)
2. **Payment History Score (30%)**: Based on average payment days and on-time payment rate
3. **Promise Keeping Score (20%)**: Based on the ratio of fulfilled to broken payment promises

Risk levels are determined by thresholds:
- **High Risk**: Score ≥ 0.5 (50%)
- **Medium Risk**: Score ≥ 0.3 (30%)
- **Low Risk**: Score < 0.3 (30%)

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
├──  utils/
│   └── discoverEntities.ts      # Discover Entities
├── types.ts                         # TypeScript interfaces
└── index.ts                         # Main entry point
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
