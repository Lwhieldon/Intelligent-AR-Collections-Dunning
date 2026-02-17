/**
 * Collections Workflow Examples
 *
 * This file demonstrates various collections workflows and use cases for the
 * Intelligent AR Collections & Dunning system. It uses actual customer data
 * from the ERP system (demo or production mode based on environment variables).
 *
 * Usage:
 *   ts-node examples/collections-workflow.ts [workflow|batch|analysis|teams]
 *
 * Examples:
 *   npx ts-node examples/collections-workflow.ts workflow  - Complete workflow example
 *   npx ts-node examples/collections-workflow.ts batch     - Batch processing & prioritization
 *   npx ts-node examples/collections-workflow.ts analysis  - Detailed risk analysis
 *   npx ts-node examples/collections-workflow.ts teams     - Test Teams messaging
 *
 * Requirements:
 *   - Run 'npm run create-invoices' first to create sample data in demo mode
 *   - Configure .env file with appropriate credentials for production mode
 *   - Set TEST_CUSTOMER_EMAIL and TEST_COLLECTIONS_EMAIL for email/Teams testing
 */

import * as dotenv from 'dotenv';
import { CollectionsAgent } from '../src/agents/collectionsAgent';

// Load environment variables
dotenv.config();

/**
 * Example: Complete collections workflow
 * This demonstrates a typical end-to-end collections process
 */
async function completeCollectionsWorkflow() {
  console.log('=== Complete Collections Workflow Example ===\n');

  const agent = new CollectionsAgent();

  // Get actual customers from the system
  console.log('Fetching customers with outstanding balances...');
  const customerIds = await agent.getCustomersWithOutstandingBalance();

  if (customerIds.length === 0) {
    console.log('⚠️  No customers found. Run: npm run create-invoices to create sample data\n');
    return;
  }

  // Pick a random customer for varied results
  const randomIndex = Math.floor(Math.random() * customerIds.length);
  const customerId = customerIds[randomIndex];
  console.log(`Found ${customerIds.length} customers. Randomly selected: ${customerId} (Customer ${randomIndex + 1} of ${customerIds.length})\n`);

  // Step 1: Analyze risk for a customer
  console.log('Step 1: Analyzing customer risk...');
  const riskScore = await agent.analyzeCustomerRisk(customerId);

  console.log(`\n📊 Risk Analysis Results:`);
  console.log(`   Customer: ${customerId}`);
  console.log(`   Overall Risk Score: ${(riskScore.score * 100).toFixed(1)}%`);
  console.log(`   Risk Level: ${riskScore.riskLevel.toUpperCase()}`);

  console.log(`\n   Risk Factor Breakdown:`);
  riskScore.factors.forEach((factor, index) => {
    console.log(`   ${index + 1}. ${factor.factor} (Impact: ${(factor.impact * 100).toFixed(1)}%)`);
    console.log(`      ${factor.description}`);
  });

  console.log(`\n   Recommendation: ${riskScore.recommendation}`);
  console.log();

  // Step 2: Based on risk level, take appropriate action
  if (riskScore.riskLevel === 'high') {
    console.log('Step 2: High-risk customer detected.');

    // Get email addresses from environment or use defaults
    const customerEmail = process.env.TEST_CUSTOMER_EMAIL || 'customer@example.com';
    const collectionsEmail = process.env.TEST_COLLECTIONS_EMAIL || process.env.GRAPH_USER_EMAIL || 'your-email@example.com';

    if (customerEmail !== 'customer@example.com') {
      console.log('  Action: Sending urgent dunning email...');
      try {
        await agent.sendDunningEmail(customerId, customerEmail);
        console.log(`  ✅ Dunning email sent to ${customerEmail}`);
      } catch (error: any) {
        console.log(`  ⚠️  Email failed: ${error.message}`);
      }
    } else {
      console.log('  Action: Would send urgent dunning email');
      console.log('  💡 Set TEST_CUSTOMER_EMAIL in .env to enable email sending');
    }
    console.log();

    // Step 3: Follow up with Teams message
    if (collectionsEmail !== 'your-email@example.com') {
      console.log('Step 3: Sending Teams follow-up to collections team...');
      try {
        await agent.sendTeamsFollowUp(customerId, collectionsEmail);
        console.log(`  ✅ Teams message sent to ${collectionsEmail}`);
      } catch (error: any) {
        console.log(`  ⚠️  Teams message failed: ${error.message}`);
      }
    } else {
      console.log('Step 3: Teams follow-up would be sent to collections team');
      console.log('  💡 Set TEST_COLLECTIONS_EMAIL in .env to enable Teams messaging');
    }
    console.log();

  } else if (riskScore.riskLevel === 'medium') {
    const customerEmail = process.env.TEST_CUSTOMER_EMAIL || 'customer@example.com';

    if (customerEmail !== 'customer@example.com') {
      console.log('Step 2: Medium-risk customer. Proposing payment plan...');
      try {
        await agent.proposePaymentPlan(customerId, customerEmail, 6);
        console.log(`  ✅ Payment plan sent to ${customerEmail}`);
      } catch (error: any) {
        console.log(`  ⚠️  Payment plan failed: ${error.message}`);
      }
    } else {
      console.log('Step 2: Medium-risk customer. Would propose payment plan.');
      console.log('  💡 Set TEST_CUSTOMER_EMAIL in .env to enable payment plan emails');
    }
    console.log();

  } else {
    const customerEmail = process.env.TEST_CUSTOMER_EMAIL || 'customer@example.com';

    if (customerEmail !== 'customer@example.com') {
      console.log('Step 2: Low-risk customer. Sending standard reminder...');
      try {
        await agent.sendDunningEmail(customerId, customerEmail);
        console.log(`  ✅ Reminder email sent to ${customerEmail}`);
      } catch (error: any) {
        console.log(`  ⚠️  Email failed: ${error.message}`);
      }
    } else {
      console.log('Step 2: Low-risk customer. Would send standard reminder.');
      console.log('  💡 Set TEST_CUSTOMER_EMAIL in .env to enable email sending');
    }
    console.log();
  }

  // Step 3: Record any customer promises
  console.log('Step 3: Recording customer promise to pay...');
  await agent.recordPromiseToPay(
    customerId,
    5000,
    '2026-03-15',
    'Customer called and committed to payment after discussing financial situation'
  );
  console.log('Promise recorded.\n');

  console.log('=== Workflow Complete ===\n');
}

/**
 * Example: Batch processing and prioritization
 */
async function batchProcessHighRisk() {
  console.log('=== Batch Processing & Prioritization Example ===\n');

  const agent = new CollectionsAgent();

  // Check if we have customers
  const customerIds = await agent.getCustomersWithOutstandingBalance();

  if (customerIds.length === 0) {
    console.log('⚠️  No customers found. Run: npm run create-invoices to create sample data\n');
    return;
  }

  console.log(`Found ${customerIds.length} customers to process\n`);

  // Step 1: Process all high-risk customers
  console.log('Step 1: Identifying high-risk customers...');
  await agent.processHighRiskCustomers();
  console.log();

  // Step 2: Prioritize collection efforts
  console.log('Step 2: Prioritizing collection efforts...');
  const prioritizedCustomers = await agent.prioritizeCollectionEfforts();

  console.log(`\nTop 5 Priority Customers:`);
  prioritizedCustomers.slice(0, 5).forEach((customer, index) => {
    console.log(`  ${index + 1}. ${customer.customerName}`);
    console.log(`     Customer ID: ${customer.customerId.substring(0, 12)}...`);
    console.log(`     Risk Level: ${customer.riskScore.riskLevel} (${(customer.riskScore.score * 100).toFixed(1)}%)`);
    console.log(`     Outstanding Balance: $${customer.totalOutstanding.toFixed(2)}`);
    console.log(`     Priority Score: ${(customer.priority * 100).toFixed(1)}`);
    console.log();
  });

  console.log('=== Batch Processing Complete ===\n');
}

/**
 * Example: Test Teams messaging functionality
 */
async function testTeamsMessaging() {
  console.log('=== Teams Messaging Test ===\n');

  const agent = new CollectionsAgent();

  // Get actual customer from the system
  const customerIds = await agent.getCustomersWithOutstandingBalance();

  if (customerIds.length === 0) {
    console.log('⚠️  No customers found. Run: npm run create-invoices to create sample data\n');
    return;
  }

  const customerId = customerIds[0];
  console.log(`Testing Teams messaging for customer: ${customerId}\n`);

  // Get collections email for Teams testing
  const collectionsEmail = process.env.TEST_COLLECTIONS_EMAIL || process.env.GRAPH_USER_EMAIL || 'your-email@example.com';

  if (collectionsEmail === 'your-email@example.com') {
    console.log('⚠️  Teams testing requires TEST_COLLECTIONS_EMAIL in .env');
    console.log('   Set TEST_COLLECTIONS_EMAIL to your work email address\n');
    return;
  }

  console.log('Step 1: Analyzing customer risk...');
  const riskScore = await agent.analyzeCustomerRisk(customerId);
  console.log(`   Risk Level: ${riskScore.riskLevel.toUpperCase()} (${(riskScore.score * 100).toFixed(1)}%)\n`);

  console.log('Step 2: Creating Teams chat and sending message...');
  console.log(`   Target: ${collectionsEmail}`);

  try {
    await agent.sendTeamsFollowUp(customerId, collectionsEmail);
    console.log('   ✅ Teams chat created successfully');
    console.log('   ✅ Teams message sent successfully');
    console.log(`   📱 Check your Teams app for the message!\n`);
  } catch (error: any) {
    console.log(`   ❌ Teams message failed: ${error.message}\n`);

    if (error.message.includes('authentication') || error.message.includes('401') || error.message.includes('403')) {
      console.log('   💡 Authentication Issue Troubleshooting:');
      console.log('      1. Ensure you completed interactive browser sign-in');
      console.log('      2. Check Azure AD app has delegated permissions: Chat.Create, User.ReadBasic.All');
      console.log('      3. Verify TEST_COLLECTIONS_EMAIL matches your signed-in account');
      console.log('      4. Try clearing browser cache and re-authenticating\n');
    }
  }

  console.log('=== Teams Test Complete ===\n');
}

/**
 * Example: Detailed risk analysis with promise tracking
 */
async function detailedRiskAnalysis() {
  console.log('=== Detailed Risk Analysis & Promise Tracking ===\n');

  const agent = new CollectionsAgent();

  // Get actual customer from the system
  const customerIds = await agent.getCustomersWithOutstandingBalance();

  if (customerIds.length === 0) {
    console.log('⚠️  No customers found. Run: npm run create-invoices to create sample data\n');
    return;
  }

  const customerId = customerIds[0];
  console.log(`Analyzing customer: ${customerId}\n`);

  // Analyze risk
  console.log('Risk Analysis:');
  const riskScore = await agent.analyzeCustomerRisk(customerId);

  console.log(`  Risk Score: ${(riskScore.score * 100).toFixed(2)}%`);
  console.log(`  Risk Level: ${riskScore.riskLevel.toUpperCase()}`);
  console.log();

  console.log('  Risk Factors:');
  riskScore.factors.forEach((factor, index) => {
    console.log(`    ${index + 1}. ${factor.factor} (Impact: ${(factor.impact * 100).toFixed(1)}%)`);
    console.log(`       ${factor.description}`);
  });
  console.log();

  console.log('  Recommendation:');
  console.log(`    ${riskScore.recommendation}`);
  console.log();

  // Analyze customer promise history
  console.log('Promise to Pay History:');
  const promiseSummary = await agent.summarizeCustomerPromises(customerId);

  console.log(`  Total Promises: ${promiseSummary.totalPromises}`);
  console.log(`  Fulfilled: ${promiseSummary.fulfilledPromises}`);
  console.log(`  Broken: ${promiseSummary.brokenPromises}`);
  console.log(`  Pending: ${promiseSummary.pendingPromises}`);
  console.log(`  Fulfillment Rate: ${(promiseSummary.fulfillmentRate * 100).toFixed(1)}%`);
  console.log(`  Total Promised Amount: $${promiseSummary.totalPromisedAmount.toFixed(2)}`);
  console.log();

  if (promiseSummary.recentPromises.length > 0) {
    console.log('  Recent Promises:');
    promiseSummary.recentPromises.forEach((promise, index) => {
      const status = promise.fulfilled ? '✅ Fulfilled' :
                     new Date(promise.promisedDate) < new Date() ? '❌ Broken' : '⏳ Pending';
      console.log(`    ${index + 1}. ${promise.date} - $${promise.promisedAmount.toFixed(2)} by ${promise.promisedDate}`);
      console.log(`       Status: ${status}`);
    });
  } else {
    console.log('  No promises recorded yet.');
  }
  console.log();

  console.log('=== Analysis Complete ===\n');
}

// Run examples
if (require.main === module) {
  const exampleToRun = process.argv[2] || 'workflow';

  switch (exampleToRun) {
    case 'workflow':
      completeCollectionsWorkflow().catch(console.error);
      break;
    case 'batch':
      batchProcessHighRisk().catch(console.error);
      break;
    case 'analysis':
      detailedRiskAnalysis().catch(console.error);
      break;
    case 'teams':
      testTeamsMessaging().catch(console.error);
      break;
    default:
      console.log('Usage: ts-node examples/collections-workflow.ts [workflow|batch|analysis|teams]');
  }
}

export { completeCollectionsWorkflow, batchProcessHighRisk, detailedRiskAnalysis, testTeamsMessaging };
