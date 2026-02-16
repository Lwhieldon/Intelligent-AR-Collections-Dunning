# Copilot Studio Plugin Configuration

This document describes how to configure plugins for the Intelligent Collections & Dunning system in Copilot Studio.

## Overview

The system uses Copilot Studio with custom plugins to enable conversational AI for collections management. The plugins connect to:

1. ERP systems for AR aging data
2. CRM systems for customer information
3. Azure OpenAI for risk scoring and communication generation
4. Microsoft Graph for email and Teams integration

## Plugin Architecture

### Graph Connectors

#### AR Aging Connector

**Purpose**: Retrieve accounts receivable aging data from Dynamics 365 ERP system

**Configuration**:
```json
{
  "name": "ar_aging_connector",
  "description": "Retrieves AR aging data for customers from Dynamics 365",
  "api_endpoint": "${ERP_API_ENDPOINT}/ar-aging",
  "authentication": {
    "type": "oauth2",
    "grant_type": "client_credentials",
    "token_url": "https://login.microsoftonline.com/${ERP_TENANT_ID}/oauth2/v2.0/token",
    "client_id": "${ERP_CLIENT_ID}",
    "client_secret": "${ERP_CLIENT_SECRET}",
    "scope": "${ERP_RESOURCE}/.default"
  },
  "operations": [
    {
      "id": "get_ar_aging",
      "method": "GET",
      "path": "/{customerId}",
      "parameters": [
        {
          "name": "customerId",
          "type": "string",
          "required": true,
          "description": "Customer ID"
        }
      ]
    }
  ]
}
```

#### Payment History Connector

**Purpose**: Retrieve payment history for customers from Dynamics 365

**Configuration**:
```json
{
  "name": "payment_history_connector",
  "description": "Retrieves payment history for customers from Dynamics 365",
  "api_endpoint": "${ERP_API_ENDPOINT}/payment-history",
  "authentication": {
    "type": "oauth2",
    "grant_type": "client_credentials",
    "token_url": "https://login.microsoftonline.com/${ERP_TENANT_ID}/oauth2/v2.0/token",
    "client_id": "${ERP_CLIENT_ID}",
    "client_secret": "${ERP_CLIENT_SECRET}",
    "scope": "${ERP_RESOURCE}/.default"
  },
  "operations": [
    {
      "id": "get_payment_history",
      "method": "GET",
      "path": "/{customerId}",
      "parameters": [
        {
          "name": "customerId",
          "type": "string",
          "required": true,
          "description": "Customer ID"
        }
      ]
    }
  ]
}
```

## Setup Instructions

### Step 1: Configure Graph Connectors in Copilot Studio

1. Open Copilot Studio
2. Navigate to **Settings** > **Connections**
3. Add new connection for **AR Aging Connector**
4. Add new connection for **Payment History Connector**

### Step 2: Import Declarative Agent

1. In Copilot Studio, navigate to **Agents**
2. Click **Import Agent**
3. Select `src/agents/declarativeAgent.json`
4. Configure action endpoints to point to your deployed service

## Authentication Details

### OAuth2 Authentication with Dynamics 365

The connectors use OAuth2 client credentials flow to authenticate with Dynamics 365:

1. **Token Acquisition**: The system automatically requests an access token from Azure AD using the configured client credentials
2. **Token Caching**: Access tokens are cached and automatically refreshed when expired
3. **Secure Storage**: Client secrets should be stored in Azure Key Vault and referenced via environment variables

### Required Azure AD Setup

Before using these connectors, ensure:
1. An Azure AD application is registered with appropriate permissions
2. The application has been granted access to your Dynamics 365 instance
3. An application user exists in Dynamics 365 with the necessary security roles
4. The `ERP_CLIENT_ID`, `ERP_CLIENT_SECRET`, `ERP_TENANT_ID`, and `ERP_RESOURCE` environment variables are configured

See [SETUP.md](docs/SETUP.md) for detailed configuration instructions.

## Security Considerations

- All client secrets should be stored in Azure Key Vault
- Use managed identities where possible
- Implement rate limiting on API endpoints
- Audit all collection actions
- Regularly rotate client secrets (recommended: every 90 days)
- Use Azure AD conditional access policies to restrict access
- Monitor authentication failures and anomalous access patterns
