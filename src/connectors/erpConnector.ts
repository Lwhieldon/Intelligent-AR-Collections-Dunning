import axios from 'axios';
import { ARAgingData, PaymentHistory } from '../types';

export class ERPConnector {
  private apiEndpoint: string;
  private apiKey: string;

  constructor() {
    this.apiEndpoint = process.env.ERP_API_ENDPOINT || '';
    this.apiKey = process.env.ERP_API_KEY || '';
  }

  /**
   * Fetch AR aging data for a specific customer from ERP system
   */
  async getARAgingData(customerId: string): Promise<ARAgingData> {
    try {
      const response = await axios.get(`${this.apiEndpoint}/ar-aging/${customerId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
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
      const response = await axios.get(`${this.apiEndpoint}/payment-history/${customerId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
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
      const response = await axios.get(`${this.apiEndpoint}/customers/outstanding`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
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
      await axios.post(
        `${this.apiEndpoint}/customers/${customerId}/notes`,
        { note, timestamp: new Date().toISOString() },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
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
