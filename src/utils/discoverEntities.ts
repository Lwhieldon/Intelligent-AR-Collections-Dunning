import * as dotenv from 'dotenv';
import axios from 'axios';
import { ClientSecretCredential } from '@azure/identity';

// Load environment variables
dotenv.config();

/**
 * Utility script to discover available entities in your Dynamics 365 instance
 */
async function discoverEntities() {
  console.log('=== Dynamics 365 Entity Discovery ===\n');

  const apiEndpoint = process.env.ERP_API_ENDPOINT || '';
  const resource = process.env.ERP_RESOURCE || '';
  const tenantId = process.env.ERP_TENANT_ID || '';
  const clientId = process.env.ERP_CLIENT_ID || '';
  const clientSecret = process.env.ERP_CLIENT_SECRET || '';

  console.log(`Connecting to: ${apiEndpoint}\n`);

  try {
    // Get OAuth2 token
    console.log('Step 1: Authenticating with Azure AD...');
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const scope = resource.endsWith('/') ? `${resource}.default` : `${resource}/.default`;
    const tokenResponse = await credential.getToken(scope);
    console.log('✅ Authentication successful!\n');

    // Query WhoAmI to verify connection
    console.log('Step 2: Verifying connection with WhoAmI...');
    const whoAmIResponse = await axios.get(`${apiEndpoint}/WhoAmI`, {
      headers: {
        'Authorization': `Bearer ${tokenResponse.token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
    });
    console.log('✅ Connected successfully!');
    console.log(`   User ID: ${whoAmIResponse.data.UserId}`);
    console.log(`   Business Unit: ${whoAmIResponse.data.BusinessUnitId}\n`);

    // Test standard entities directly instead of querying metadata
    console.log('Step 3: Testing standard Dynamics 365 entities...\n');
    console.log('=== STANDARD ENTITIES CHECK ===\n');

    const standardEntities = [
      { name: 'accounts', description: 'Customer accounts' },
      { name: 'contacts', description: 'Customer contacts' },
      { name: 'invoices', description: 'Sales invoices' },
      { name: 'salesorders', description: 'Sales orders' },
      { name: 'opportunities', description: 'Sales opportunities' },
      { name: 'quotes', description: 'Sales quotes' },
      { name: 'systemusers', description: 'System users' },
    ];

    const availableEntities: string[] = [];

    for (const entity of standardEntities) {
      try {
        await axios.get(
          `${apiEndpoint}/${entity.name}?$top=1`,
          {
            headers: {
              'Authorization': `Bearer ${tokenResponse.token}`,
              'OData-MaxVersion': '4.0',
              'OData-Version': '4.0',
            },
          }
        );
        console.log(`  ✅ ${entity.name.padEnd(20)} - Available (${entity.description})`);
        availableEntities.push(entity.name);
      } catch (error: any) {
        console.log(`  ❌ ${entity.name.padEnd(20)} - Not available`);
      }
    }

    // Try to query sample data from available entities
    console.log('\n=== SAMPLE DATA CHECK ===\n');

    if (availableEntities.includes('accounts')) {
      try {
        console.log('Querying accounts for sample data...');
        const accountsResponse = await axios.get(
          `${apiEndpoint}/accounts?$top=5`,
          {
            headers: {
              'Authorization': `Bearer ${tokenResponse.token}`,
              'OData-MaxVersion': '4.0',
              'OData-Version': '4.0',
            },
          }
        );

        const accounts = accountsResponse.data.value;
        console.log(`✅ Found ${accounts.length} sample accounts:`);
        if (accounts.length > 0) {
          accounts.forEach((account: any) => {
            console.log(`   - ${account.name || 'Unnamed'} (ID: ${account.accountid})`);
          });

          // Show available fields on first account
          console.log('\n   Available fields on accounts:');
          const sampleAccount = accounts[0];
          const fields = Object.keys(sampleAccount).slice(0, 10);
          fields.forEach(field => {
            console.log(`     • ${field}: ${typeof sampleAccount[field]}`);
          });
        } else {
          console.log('   No accounts found in the system');
        }
      } catch (error: any) {
        console.log('⚠️  Could not query accounts:', error.response?.data?.error?.message || error.message);
      }
    }

    if (availableEntities.includes('invoices')) {
      try {
        console.log('\nQuerying invoices for sample data...');
        const invoicesResponse = await axios.get(
          `${apiEndpoint}/invoices?$top=5`,
          {
            headers: {
              'Authorization': `Bearer ${tokenResponse.token}`,
              'OData-MaxVersion': '4.0',
              'OData-Version': '4.0',
            },
          }
        );

        const invoices = invoicesResponse.data.value;
        console.log(`✅ Found ${invoices.length} sample invoices`);
        if (invoices.length > 0) {
          invoices.forEach((invoice: any) => {
            console.log(`   - ${invoice.name || 'Unnamed'} - $${invoice.totalamount || 0}`);
          });
        } else {
          console.log('   No invoices found in the system');
        }
      } catch (error: any) {
        console.log('⚠️  Could not query invoices:', error.response?.data?.error?.message || error.message);
      }
    }

    console.log('\n=== DISCOVERY COMPLETE ===\n');
    console.log('Next Steps:');
    console.log('1. Review the entities listed above');
    console.log('2. Identify which entities contain your AR/collections data');
    console.log('3. Share the relevant entity names with Claude to update the connector\n');

  } catch (error: any) {
    console.error('❌ Error during discovery:', error.response?.data || error.message);
  }
}

// Run the discovery
discoverEntities().catch(console.error);
