import axios from 'axios';
import { ClientSecretCredential } from '@azure/identity';
import { ARAgingData, PaymentHistory } from '../types';

export class ERPConnector {
  private apiEndpoint: string;
  private credential: ClientSecretCredential;
  private resource: string;

  constructor() {
    this.apiEndpoint = process.env.ERP_API_ENDPOINT || '';
    this.resource = process.env.ERP_RESOURCE || '';

    const tenantId = process.env.ERP_TENANT_ID || '';
    const clientId = process.env.ERP_CLIENT_ID || '';
    const clientSecret = process.env.ERP_CLIENT_SECRET || '';

    this.credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
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
    try {
      const token = await this.getAccessToken();
      const response = await axios.get(`${this.apiEndpoint}/ar-aging/${customerId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching AR aging data:', error);
      throw new Error('Failed to fetch AR aging data from ERP');
    }
  }

  /**
   * Fetch payment history for a specific customer
   */
  async getPaymentHistory(customerId: string): Promise<PaymentHistory> {
    try {
      const token = await this.getAccessToken();
      const response = await axios.get(`${this.apiEndpoint}/payment-history/${customerId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching payment history:', error);
      throw new Error('Failed to fetch payment history from ERP');
    }
  }

  /**
   * Get list of all customers with outstanding balances
   */
  async getCustomersWithOutstandingBalance(): Promise<string[]> {
    try {
      const token = await this.getAccessToken();
      const response = await axios.get(`${this.apiEndpoint}/customers/outstanding`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data.customerIds || [];
    } catch (error) {
      console.error('Error fetching customers with outstanding balance:', error);
      throw new Error('Failed to fetch customers from ERP');
    }
  }

  /**
   * Update customer notes in ERP system
   */
  async updateCustomerNotes(customerId: string, note: string): Promise<void> {
    try {
      const token = await this.getAccessToken();
      await axios.post(
        `${this.apiEndpoint}/customers/${customerId}/notes`,
        { note, timestamp: new Date().toISOString() },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error) {
      console.error('Error updating customer notes:', error);
      throw new Error('Failed to update customer notes in ERP');
    }
  }
}
