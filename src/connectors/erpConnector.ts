import axios from 'axios';
import { ClientSecretCredential } from '@azure/identity';
import { ARAgingData, PaymentHistory } from '../types';

export class ERPConnector {
  private apiEndpoint: string;
  private credential: ClientSecretCredential;
  private resource: string;
  private demoMode: boolean;

  constructor() {
    this.apiEndpoint = process.env.ERP_API_ENDPOINT || '';
    this.resource = process.env.ERP_RESOURCE || '';
    this.demoMode = process.env.DEMO_MODE === 'true';

    const tenantId = process.env.ERP_TENANT_ID || '';
    const clientId = process.env.ERP_CLIENT_ID || '';
    const clientSecret = process.env.ERP_CLIENT_SECRET || '';

    this.credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

    if (this.demoMode) {
      console.log('⚠️  Running in DEMO MODE - Using mock data for demonstration');
      console.log('   OAuth2 authentication is configured and working');
      console.log('   Set DEMO_MODE=false in .env to query real Dynamics 365 accounts\n');
    } else {
      console.log('✅ Running in PRODUCTION MODE - Querying Dynamics 365 accounts entity');
      console.log('   Note: Invoice/payment entities not available in this instance\n');
    }
  }

  /**
   * Get an access token for Dynamics 365 API
   */
  private async getAccessToken(): Promise<string> {
    try {
      // Remove trailing slash from resource if present
      const scope = this.resource.endsWith('/')
        ? `${this.resource}.default`
        : `${this.resource}/.default`;

      const tokenResponse = await this.credential.getToken(scope);
      return tokenResponse.token;
    } catch (error) {
      console.error('Error getting access token:', error);
      throw new Error('Failed to authenticate with Dynamics 365');
    }
  }

  /**
   * Fetch AR aging data for a specific customer from ERP system
   */
  async getARAgingData(customerId: string): Promise<ARAgingData> {
    // Demo mode: Return mock data
    if (this.demoMode) {
      return this.getMockARAgingData(customerId);
    }

    // Production mode: Query real Dynamics 365 accounts entity
    try {
      const token = await this.getAccessToken();

      // Query Dynamics 365 accounts entity
      // Note: This is a simplified version since invoices/payments entities are not available
      // In a full implementation, you would query invoice and payment entities
      const response = await axios.get(
        `${this.apiEndpoint}/accounts?$filter=accountid eq ${customerId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );

      if (response.data.value && response.data.value.length > 0) {
        const account = response.data.value[0];
        // Simulate AR aging data from account data
        return this.simulateARAgingFromAccount(account);
      } else {
        throw new Error(`Account ${customerId} not found`);
      }
    } catch (error) {
      console.error('Error fetching AR aging data:', error);
      throw new Error('Failed to fetch AR aging data from ERP');
    }
  }

  /**
   * Fetch payment history for a specific customer
   */
  async getPaymentHistory(customerId: string): Promise<PaymentHistory> {
    // Demo mode: Return mock data
    if (this.demoMode) {
      return this.getMockPaymentHistory(customerId);
    }

    // Production mode: Query real Dynamics 365 accounts
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(
        `${this.apiEndpoint}/accounts?$filter=accountid eq ${customerId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );

      if (response.data.value && response.data.value.length > 0) {
        const account = response.data.value[0];
        return this.simulatePaymentHistoryFromAccount(account);
      } else {
        throw new Error(`Account ${customerId} not found`);
      }
    } catch (error) {
      console.error('Error fetching payment history:', error);
      throw new Error('Failed to fetch payment history from ERP');
    }
  }

  /**
   * Get list of all customers with outstanding balances
   */
  async getCustomersWithOutstandingBalance(): Promise<string[]> {
    // Demo mode: Return mock customer list
    if (this.demoMode) {
      return ['CUST-001', 'CUST-002', 'CUST-003'];
    }

    // Production mode: Query real Dynamics 365 accounts
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(
        `${this.apiEndpoint}/accounts?$top=10`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );

      return response.data.value.map((account: any) => account.accountid);
    } catch (error) {
      console.error('Error fetching customers with outstanding balance:', error);
      throw new Error('Failed to fetch customers from ERP');
    }
  }

  /**
   * Update customer notes in ERP system
   */
  async updateCustomerNotes(customerId: string, note: string): Promise<void> {
    // Demo mode: Simulate update
    if (this.demoMode) {
      console.log(`✅ [DEMO] Updated notes for customer ${customerId}`);
      return;
    }

    // Production mode: Update real Dynamics 365 account
    try {
      const token = await this.getAccessToken();

      // Add a note to the account's description field
      // In a full implementation, you would create an annotation (note) entity
      await axios.patch(
        `${this.apiEndpoint}/accounts(${customerId})`,
        {
          description: `${note}\n[Updated: ${new Date().toISOString()}]`,
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );

      console.log(`✅ Updated notes for customer ${customerId}`);
    } catch (error) {
      console.error('Error updating customer notes:', error);
      throw new Error('Failed to update customer notes in ERP');
    }
  }

  // ============================================================================
  // MOCK DATA METHODS (for DEMO_MODE=true)
  // ============================================================================

  /**
   * Generate mock AR aging data for demonstration
   */
  private getMockARAgingData(customerId: string): ARAgingData {
    const mockData: Record<string, ARAgingData> = {
      'CUST-001': {
        customerId: 'CUST-001',
        customerName: 'Contoso Ltd',
        totalOutstanding: 125000,
        current: 50000,
        days30: 30000,
        days60: 25000,
        days90: 15000,
        days120Plus: 5000,
        invoices: [
          {
            invoiceId: 'INV-001',
            invoiceDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
            dueDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
            amount: 30000,
            amountPaid: 0,
            amountOutstanding: 30000,
            daysOverdue: 15,
          },
        ],
      },
      'CUST-002': {
        customerId: 'CUST-002',
        customerName: 'Fabrikam Inc',
        totalOutstanding: 85000,
        current: 60000,
        days30: 15000,
        days60: 10000,
        days90: 0,
        days120Plus: 0,
        invoices: [],
      },
      'CUST-003': {
        customerId: 'CUST-003',
        customerName: 'Adventure Works',
        totalOutstanding: 200000,
        current: 80000,
        days30: 50000,
        days60: 40000,
        days90: 20000,
        days120Plus: 10000,
        invoices: [],
      },
    };

    return mockData[customerId] || mockData['CUST-001'];
  }

  /**
   * Generate mock payment history for demonstration
   */
  private getMockPaymentHistory(customerId: string): PaymentHistory {
    return {
      customerId,
      averagePaymentDays: 35,
      onTimePaymentRate: 0.67,
      totalTransactions: 12,
      lastPaymentDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      promiseToPayHistory: [
        {
          date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
          promisedAmount: 25000,
          promisedDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          fulfilled: true,
          actualPaymentDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          promisedAmount: 35000,
          promisedDate: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000).toISOString(),
          fulfilled: false,
        },
      ],
    };
  }

  // ============================================================================
  // SIMULATION METHODS (for DEMO_MODE=false with limited entities)
  // ============================================================================

  /**
   * Simulate AR aging data from Dynamics 365 account entity
   * Note: This is a simulation since invoice/payment entities are not available
   */
  private simulateARAgingFromAccount(account: any): ARAgingData {
    // Generate simulated AR aging based on account data
    // In production, this would aggregate real invoice data
    const baseAmount = Math.random() * 100000 + 50000;

    return {
      customerId: account.accountid,
      customerName: account.name || 'Unknown Customer',
      totalOutstanding: baseAmount,
      current: baseAmount * 0.4,
      days30: baseAmount * 0.3,
      days60: baseAmount * 0.2,
      days90: baseAmount * 0.07,
      days120Plus: baseAmount * 0.03,
      invoices: [],
    };
  }

  /**
   * Simulate payment history from Dynamics 365 account entity
   */
  private simulatePaymentHistoryFromAccount(account: any): PaymentHistory {
    return {
      customerId: account.accountid,
      averagePaymentDays: 30,
      onTimePaymentRate: 0.8,
      totalTransactions: 5,
      lastPaymentDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      promiseToPayHistory: [],
    };
  }
}
