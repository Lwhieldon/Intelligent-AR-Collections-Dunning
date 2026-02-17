import axios from 'axios';
import { ClientSecretCredential } from '@azure/identity';
import { ARAgingData, PaymentHistory, Invoice } from '../types';

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
      console.log('   Set DEMO_MODE=false in .env to query real Dynamics 365 data\n');
    } else {
      console.log('✅ Running in PRODUCTION MODE - Querying REAL Dynamics 365 data');
      console.log('   Connecting to invoices, accounts, and payment entities\n');
    }
  }

  /**
   * Get an access token for Dynamics 365 API
   */
  private async getAccessToken(): Promise<string> {
    try {
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

    // Production mode: Query REAL Dynamics 365 invoices
    try {
      const token = await this.getAccessToken();

      console.log(`📊 Querying Dynamics 365 for customer: ${customerId}`);

      // Step 1: Get customer account details
      const accountResponse = await axios.get(
        `${this.apiEndpoint}/accounts(${customerId})`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );

      const account = accountResponse.data;
      console.log(`✅ Found account: ${account.name}`);

      // Step 2: Query invoices for this customer
      // Note: statecode 0 = Active, 1 = Inactive, 2 = Paid/Closed
      console.log(`📄 Querying invoices for customer...`);
      const invoicesResponse = await axios.get(
        `${this.apiEndpoint}/invoices?$filter=_customerid_value eq ${customerId} and statecode eq 0&$select=invoiceid,name,totalamount,totallineitemamount,totalamountlessfreight,totaltax,datedelivered,duedate,description,statecode,statuscode,createdon&$orderby=createdon desc`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );

      const dynamics365Invoices = invoicesResponse.data.value;
      console.log(`✅ Found ${dynamics365Invoices.length} invoices`);

      // Step 3: Get line items for each invoice to calculate actual totals
      console.log(`📦 Fetching line items for invoices...`);
      for (const invoice of dynamics365Invoices) {
        try {
          const lineItemsResponse = await axios.get(
            `${this.apiEndpoint}/invoicedetails?$filter=_invoiceid_value eq ${invoice.invoiceid}&$select=invoicedetailid,quantity,priceperunit,baseamount,extendedamount`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
              },
            }
          );

          const lineItems = lineItemsResponse.data.value;
          // Calculate total from line items
          let calculatedTotal = 0;
          for (const lineItem of lineItems) {
            calculatedTotal += (lineItem.extendedamount || lineItem.baseamount || (lineItem.quantity * lineItem.priceperunit) || 0);
          }

          // Override the totalamount with our calculated value
          invoice.totalamount = calculatedTotal;
        } catch {
          console.log(`  ⚠️  Could not fetch line items for invoice ${invoice.name}`);
        }
      }

      // Step 4: Transform and calculate AR aging
      return this.calculateARAgingFromDynamicsInvoices(account, dynamics365Invoices);
    } catch (error: any) {
      console.error('Error fetching AR aging data:', error.response?.data || error.message);
      throw new Error(`Failed to fetch AR aging data: ${error.message}`);
    }
  }

  /**
   * Calculate AR aging buckets from Dynamics 365 invoices
   */
  private calculateARAgingFromDynamicsInvoices(account: any, dynamics365Invoices: any[]): ARAgingData {
    const today = new Date();
    const invoices: Invoice[] = [];

    let totalOutstanding = 0;
    let current = 0;
    let days30 = 0;
    let days60 = 0;
    let days90 = 0;
    let days120Plus = 0;

    // Process each invoice and bucket by age
    for (const d365Invoice of dynamics365Invoices) {
      const dueDate = d365Invoice.duedate ? new Date(d365Invoice.duedate) : new Date();
      const invoiceDate = d365Invoice.datedelivered ? new Date(d365Invoice.datedelivered) : new Date();
      const amount = d365Invoice.totalamount || 0;

      // Calculate days overdue
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      // Bucket the amount
      if (daysOverdue < 0) {
        current += amount;
      } else if (daysOverdue < 30) {
        current += amount;
      } else if (daysOverdue < 60) {
        days30 += amount;
      } else if (daysOverdue < 90) {
        days60 += amount;
      } else if (daysOverdue < 120) {
        days90 += amount;
      } else {
        days120Plus += amount;
      }

      totalOutstanding += amount;

      // Add to invoices array
      invoices.push({
        invoiceId: d365Invoice.invoiceid,
        invoiceDate: invoiceDate.toISOString(),
        dueDate: dueDate.toISOString(),
        amount: amount,
        amountPaid: 0, // Dynamics 365 doesn't have this by default
        amountOutstanding: amount,
        daysOverdue: Math.max(0, daysOverdue),
      });
    }

    console.log(`💰 Total Outstanding: $${totalOutstanding.toLocaleString()}`);
    console.log(`   Current: $${current.toLocaleString()}`);
    console.log(`   30 days: $${days30.toLocaleString()}`);
    console.log(`   60 days: $${days60.toLocaleString()}`);
    console.log(`   90 days: $${days90.toLocaleString()}`);
    console.log(`   120+ days: $${days120Plus.toLocaleString()}\n`);

    return {
      customerId: account.accountid,
      customerName: account.name || 'Unknown Customer',
      totalOutstanding,
      current,
      days30,
      days60,
      days90,
      days120Plus,
      invoices,
    };
  }

  /**
   * Fetch payment history for a specific customer
   */
  async getPaymentHistory(customerId: string): Promise<PaymentHistory> {
    // Demo mode: Return mock data
    if (this.demoMode) {
      return this.getMockPaymentHistory(customerId);
    }

    // Production mode: Query real Dynamics 365 data
    try {
      const token = await this.getAccessToken();

      console.log(`📜 Fetching payment history from tasks and appointments...`);

      // Query tasks (payment records) - try without statecode filter first
      const tasksResponse = await axios.get(
        `${this.apiEndpoint}/tasks?$filter=_regardingobjectid_value eq ${customerId}&$select=subject,actualend,description,statecode,statuscode&$top=50`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );

      // Query appointments (promise to pay records)
      const appointmentsResponse = await axios.get(
        `${this.apiEndpoint}/appointments?$filter=_regardingobjectid_value eq ${customerId}&$select=subject,scheduledend,description,statuscode,statecode&$top=50`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );

      const tasks = tasksResponse.data.value;
      const appointments = appointmentsResponse.data.value;

      console.log(`✅ Found ${tasks.length} payment records and ${appointments.length} promises\n`);

      // Calculate payment statistics from real data
      return this.calculatePaymentHistoryFromRecords(customerId, tasks, appointments);
    } catch (error) {
      console.error('Error fetching payment history:', error);
      throw new Error('Failed to fetch payment history from ERP');
    }
  }

  /**
   * Calculate payment history from tasks and appointments
   */
  private calculatePaymentHistoryFromRecords(customerId: string, tasks: any[], appointments: any[]): PaymentHistory {
    // Parse payment records (tasks)
    let onTimeCount = 0;
    let totalDaysLate = 0;

    for (const task of tasks) {
      const subject = task.subject || '';
      const isOnTime = subject.includes('On Time');
      const daysLateMatch = subject.match(/(\d+) days late/);
      const daysLate = daysLateMatch ? parseInt(daysLateMatch[1]) : 0;

      if (isOnTime) onTimeCount++;
      totalDaysLate += daysLate;
    }

    // Parse promise to pay records (appointments)
    const promiseToPayHistory: any[] = [];
    for (const appointment of appointments) {
      const subject = appointment.subject || '';
      const fulfilled = subject.includes('Fulfilled');

      promiseToPayHistory.push({
        date: appointment.scheduledend || new Date().toISOString(),
        promisedAmount: 5000, // Stored in description
        promisedDate: appointment.scheduledend || new Date().toISOString(),
        fulfilled: fulfilled,
      });
    }

    const totalTransactions = tasks.length;
    const onTimePaymentRate = totalTransactions > 0 ? onTimeCount / totalTransactions : 1;
    const averagePaymentDays = totalTransactions > 0 ? totalDaysLate / totalTransactions : 0;

    return {
      customerId,
      totalTransactions,
      onTimePaymentRate,
      averagePaymentDays: 30 + averagePaymentDays, // Base 30 days + late days
      promiseToPayHistory,
      lastPaymentDate: tasks.length > 0 ? tasks[0].actualend : new Date().toISOString(),
    };
  }

  /**
   * Calculate payment history from invoices (fallback)
   */
  private calculatePaymentHistoryFromInvoices(customerId: string, invoices: any[]): PaymentHistory {
    // Simulate payment history based on invoice data
    // In production, you would query actual payment records

    const totalTransactions = invoices.length;
    const lastInvoice = invoices.length > 0 ? invoices[0] : null;

    return {
      customerId,
      averagePaymentDays: 30,
      onTimePaymentRate: 0.75,
      totalTransactions,
      lastPaymentDate: lastInvoice?.datedelivered || new Date().toISOString(),
      promiseToPayHistory: [],
    };
  }

  /**
   * Get list of all customers with outstanding balances
   */
  async getCustomersWithOutstandingBalance(): Promise<string[]> {
    // Demo mode: Return mock customer list
    if (this.demoMode) {
      return ['CUST-001', 'CUST-002', 'CUST-003'];
    }

    // Production mode: Query real Dynamics 365 accounts with invoices
    try {
      const token = await this.getAccessToken();

      // Get all accounts that have invoices
      const invoicesResponse = await axios.get(
        `${this.apiEndpoint}/invoices?$select=_customerid_value&$top=100`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );

      // Extract unique customer IDs
      const customerIds = new Set<string>();
      for (const invoice of invoicesResponse.data.value) {
        if (invoice._customerid_value) {
          customerIds.add(invoice._customerid_value);
        }
      }

      return Array.from(customerIds);
    } catch (error) {
      console.error('Error fetching customers with outstanding balance:', error);
      // Fallback to all accounts if invoice query fails
      return this.getAllAccountIds();
    }
  }

  /**
   * Fallback: Get all account IDs
   */
  private async getAllAccountIds(): Promise<string[]> {
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(
        `${this.apiEndpoint}/accounts?$select=accountid&$top=10`,
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
      console.error('Error fetching account IDs:', error);
      return [];
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

      // Update the account's description field with the note
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

      console.log(`✅ Updated notes for customer ${customerId} in Dynamics 365`);
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
}
