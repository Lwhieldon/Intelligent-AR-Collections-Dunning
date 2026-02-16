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

**Purpose**: Retrieve accounts receivable aging data from ERP system

**Configuration**:
```json
{
  "name": "ar_aging_connector",
  "description": "Retrieves AR aging data for customers",
  "api_endpoint": "${ERP_API_ENDPOINT}/ar-aging",
  "authentication": {
    "type": "api_key",
    "header": "Authorization",
    "value": "Bearer ${ERP_API_KEY}"
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

**Purpose**: Retrieve payment history for customers

**Configuration**:
```json
{
  "name": "payment_history_connector",
  "description": "Retrieves payment history for customers",
  "api_endpoint": "${ERP_API_ENDPOINT}/payment-history",
  "authentication": {
    "type": "api_key",
    "header": "Authorization",
    "value": "Bearer ${ERP_API_KEY}"
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

## Security Considerations

- All API keys should be stored in Azure Key Vault
- Use managed identities where possible
- Implement rate limiting on API endpoints
- Audit all collection actions
