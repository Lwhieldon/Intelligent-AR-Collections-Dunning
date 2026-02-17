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
      { current: 50000, days30: 30000, days60: 25000, days90: 15000, days120: 45000 },
      { current: 60000, days30: 15000, days60: 10000, days90: 8000, days120: 32000 },
      { current: 80000, days30: 50000, days60: 40000, days90: 20000, days120: 75000 },
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

      // Create 120+ day overdue invoice (HIGH RISK)
      if (amounts.days120 > 0) {
        await createInvoice(
          tokenResponse.token,
          apiEndpoint,
          account.accountid,
          account.name,
          '120+ Days',
          amounts.days120,
          135
        );
      }

      // Create sample payment history
      console.log('Creating payment history...');
      await createPaymentHistory(tokenResponse.token, apiEndpoint, account.accountid, i);

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
    // Step 1: Create the invoice header
    const invoiceData = {
      name: `INV-${ageBucket}-${Date.now()}`,
      'customerid_account@odata.bind': `/accounts(${accountId})`,
      billto_name: accountName,
      datedelivered: formatDate(invoiceDate),
      duedate: formatDate(dueDate),
      description: `Sample invoice for ${ageBucket} aging bucket (Outstanding - Unpaid)`,
    };

    const invoiceResponse = await axios.post(
      `${apiEndpoint}/invoices`,
      invoiceData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          'Prefer': 'return=representation',
        },
      }
    );

    const createdInvoice = invoiceResponse.data;
    const invoiceId = createdInvoice.invoiceid;

    // Step 2: Create invoice line item (product)
    try {
      const lineItemData = {
        'invoiceid@odata.bind': `/invoices(${invoiceId})`,
        productdescription: `${ageBucket} aging sample charge`,
        quantity: 1,
        priceperunit: amount,
        baseamount: amount,
        extendedamount: amount,
        manualdiscountamount: 0,
        tax: 0,
        ispriceoverridden: true, // Allow manual pricing without product catalog
      };

      await axios.post(
        `${apiEndpoint}/invoicedetails`,
        lineItemData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );

      console.log(`  ✅ Created ${ageBucket} invoice with line item: $${amount.toLocaleString()} (${daysOld} days old)`);
    } catch (lineItemError: any) {
      console.log(`  ⚠️  Invoice created but line item failed: ${lineItemError.response?.data?.error?.message || lineItemError.message}`);
      console.log(`     Full error:`, JSON.stringify(lineItemError.response?.data, null, 2));
    }
  } catch (error: any) {
    console.log(`  ⚠️  Could not create ${ageBucket} invoice: ${error.response?.data?.error?.message || error.message}`);
    console.log(`     Full error:`, JSON.stringify(error.response?.data, null, 2));
  }
}

/**
 * Create sample payment history for realistic risk scoring
 */
async function createPaymentHistory(
  token: string,
  apiEndpoint: string,
  accountId: string,
  customerIndex: number
) {
  // Define payment patterns for each customer (varied for testing)
  const paymentPatterns = [
    { onTimeRate: 0.7, avgDaysLate: 15, promisesFulfilled: 0.6 }, // Customer 0: Decent payer
    { onTimeRate: 0.5, avgDaysLate: 30, promisesFulfilled: 0.4 }, // Customer 1: Moderate risk
    { onTimeRate: 0.3, avgDaysLate: 45, promisesFulfilled: 0.2 }, // Customer 2: High risk payer
  ];

  const pattern = paymentPatterns[customerIndex] || paymentPatterns[0];

  try {
    // Create 10 historical payment records
    for (let i = 0; i < 10; i++) {
      const isOnTime = Math.random() < pattern.onTimeRate;
      const daysLate = isOnTime ? 0 : Math.floor(Math.random() * pattern.avgDaysLate);
      const paymentDate = new Date();
      paymentDate.setDate(paymentDate.getDate() - (90 - i * 9) - daysLate);

      const paymentAmount = 5000 + Math.floor(Math.random() * 10000);

      const paymentData = {
        'regardingobjectid_account@odata.bind': `/accounts(${accountId})`,
        subject: `Payment ${i + 1} - ${isOnTime ? 'On Time' : daysLate + ' days late'}`,
        actualend: paymentDate.toISOString(),
        description: `Historical payment record. Amount: $${paymentAmount}. Days late: ${daysLate}`,
        statecode: 1, // Completed
        statuscode: 2, // Completed
      };

      await axios.post(
        `${apiEndpoint}/tasks`,
        paymentData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );
    }

    // Create 3-5 promise to pay records
    const promiseCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < promiseCount; i++) {
      const fulfilled = Math.random() < pattern.promisesFulfilled;
      const promiseDate = new Date();
      promiseDate.setDate(promiseDate.getDate() - (60 - i * 15));

      const promiseAmount = 3000 + Math.floor(Math.random() * 7000);

      const promiseData = {
        'regardingobjectid_account@odata.bind': `/accounts(${accountId})`,
        subject: `Promise to Pay - ${fulfilled ? 'Fulfilled' : 'Broken'}`,
        scheduledend: promiseDate.toISOString(),
        description: `Promised $${promiseAmount} by ${promiseDate.toISOString().split('T')[0]}. Status: ${fulfilled ? 'Paid' : 'Not paid'}`,
        statecode: 1, // Completed
        statuscode: fulfilled ? 5 : 6, // 5=Completed, 6=Canceled
      };

      await axios.post(
        `${apiEndpoint}/appointments`,
        promiseData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );
    }

    console.log(`  ✅ Created payment history (${pattern.onTimeRate * 100}% on-time rate)`);
  } catch (error: any) {
    console.log(`  ⚠️  Could not create payment history: ${error.response?.data?.error?.message || error.message}`);
  }
}

// Run the creation script
createSampleInvoices().catch(console.error);
