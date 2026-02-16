import * as dotenv from 'dotenv';
import { CollectionsAgent } from './agents/collectionsAgent';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the Intelligent Collections & Dunning system
 */
async function main() {
  console.log('=== Intelligent AR Collections & Dunning System ===\n');

  const agent = new CollectionsAgent();

  // Example usage - in production, this would be triggered by:
  // - Scheduled jobs
  // - Copilot Studio actions
  // - Teams/Outlook plugins
  // - API calls from other systems

  try {
    // Example 1: Analyze risk for a specific customer
    console.log('Example 1: Analyzing customer risk...');
    const customerId = 'CUST-001';
    const riskScore = await agent.analyzeCustomerRisk(customerId);
    console.log(`Risk Score: ${(riskScore.score * 100).toFixed(1)}%`);
    console.log(`Risk Level: ${riskScore.riskLevel}`);
    console.log(`Recommendation: ${riskScore.recommendation}\n`);

    // Example 2: Process all high-risk customers
    console.log('Example 2: Processing high-risk customers...');
    await agent.processHighRiskCustomers();
    console.log();

    // Example 3: Send dunning email (commented out - requires actual email)
    // console.log('Example 3: Sending dunning email...');
    // await agent.sendDunningEmail('CUST-001', 'customer@example.com');
    // console.log();

    // Example 4: Create payment plan (commented out - requires actual email)
    // console.log('Example 4: Creating payment plan...');
    // await agent.proposePaymentPlan('CUST-001', 'customer@example.com', 6);
    // console.log();

    // Example 5: Record promise to pay
    console.log('Example 5: Recording promise to pay...');
    await agent.recordPromiseToPay('CUST-001', 5000, '2026-03-01', 'Customer called and committed to payment');
    console.log();

  } catch (error) {
    console.error('Error during execution:', error);
  }

  console.log('=== System execution complete ===');
}

// Run if this is the main module
if (require.main === module) {
  main().catch(console.error);
}

export { CollectionsAgent };
