import * as dotenv from 'dotenv';
import axios from 'axios';
import { ClientSecretCredential } from '@azure/identity';

// Load environment variables
dotenv.config();

/**
 * Utility script to create sample invoices in Dynamics 365
 */
async function createSampleInvoices() {
  console.log('=== Creating Sample Invoices in Dynamics 365 ===\n');

  const apiEndpoint = process.env.ERP_API_ENDPOINT || '';
  const resource = process.env.ERP_RESOURCE || '';
  const tenantId = process.env.ERP_TENANT_ID || '';
  const clientId = process.env.ERP_CLIENT_ID || '';
  const clientSecret = process.env.ERP_CLIENT_SECRET || '';

  try {
    // Get OAuth2 token
    console.log('Step 1: Authenticating with Azure AD...');
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const scope = resource.endsWith('/') ? `${resource}.default` : `${resource}/.default`;
    const tokenResponse = await credential.getToken(scope);
    console.log('✅ Authentication successful!\n');

    // Get sample accounts
    console.log('Step 2: Getting sample accounts...');
    const accountsResponse = await axios.get(
      `${apiEndpoint}/accounts?$top=3`,
      {
        headers: {
          'Authorization': `Bearer ${tokenResponse.token}`,
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
        },
      }
    );

    const accounts = accountsResponse.data.value;
    console.log(`✅ Found ${accounts.length} accounts\n`);

    // Create sample invoices for each account
    console.log('Step 3: Creating sample invoices...\n');

    const invoiceAmounts = [
      { current: 50000, days30: 30000, days60: 25000, days90: 15000 },
      { current: 60000, days30: 15000, days60: 10000, days90: 0 },
      { current: 80000, days30: 50000, days60: 40000, days90: 20000 },
    ];

    for (let i = 0; i < Math.min(accounts.length, 3); i++) {
      const account = accounts[i];
      const amounts = invoiceAmounts[i];

      console.log(`Creating invoices for: ${account.name}`);

      // Create current invoice (not overdue)
      if (amounts.current > 0) {
        await createInvoice(
          tokenResponse.token,
          apiEndpoint,
          account.accountid,
          account.name,
          'Current',
          amounts.current,
          0
        );
      }

      // Create 30-day overdue invoice
      if (amounts.days30 > 0) {
        await createInvoice(
          tokenResponse.token,
          apiEndpoint,
          account.accountid,
          account.name,
          '30 Days',
          amounts.days30,
          35
        );
      }

      // Create 60-day overdue invoice
      if (amounts.days60 > 0) {
        await createInvoice(
          tokenResponse.token,
          apiEndpoint,
          account.accountid,
          account.name,
          '60 Days',
          amounts.days60,
          65
        );
      }

      // Create 90-day overdue invoice
      if (amounts.days90 > 0) {
        await createInvoice(
          tokenResponse.token,
          apiEndpoint,
          account.accountid,
          account.name,
          '90 Days',
          amounts.days90,
          95
        );
      }

      console.log('');
    }

    console.log('\n=== Sample Invoice Creation Complete ===\n');
    console.log('You can now run: npm start');
    console.log('The system will query these invoices from Dynamics 365\n');

  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

async function createInvoice(
  token: string,
  apiEndpoint: string,
  accountId: string,
  accountName: string,
  ageBucket: string,
  amount: number,
  daysOld: number
) {
  const invoiceDate = new Date();
  invoiceDate.setDate(invoiceDate.getDate() - daysOld - 30); // Invoice date

  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + 30); // Due 30 days after invoice

  // Format dates as YYYY-MM-DD for Dynamics 365
  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  try {
    const invoiceData = {
      name: `INV-${ageBucket}-${Date.now()}`,
      'customerid_account@odata.bind': `/accounts(${accountId})`,
      billto_name: accountName,
      totalamount: amount,
      datedelivered: formatDate(invoiceDate),
      duedate: formatDate(dueDate),
      description: `Sample invoice for ${ageBucket} aging bucket`,
    };

    await axios.post(
      `${apiEndpoint}/invoices`,
      invoiceData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
        },
      }
    );

    console.log(`  ✅ Created ${ageBucket} invoice: $${amount.toLocaleString()} (${daysOld} days old)`);
  } catch (error: any) {
    console.log(`  ⚠️  Could not create ${ageBucket} invoice: ${error.response?.data?.error?.message || error.message}`);
  }
}

// Run the creation script
createSampleInvoices().catch(console.error);
