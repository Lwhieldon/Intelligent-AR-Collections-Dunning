import { CollectionsAgent } from '../src/agents/collectionsAgent';
import { ARAgingData, PaymentHistory } from '../src/types';

/**
 * Example: Complete collections workflow
 * This demonstrates a typical end-to-end collections process
 */
async function completeCollectionsWorkflow() {
  const agent = new CollectionsAgent();

  // Step 1: Analyze risk for a customer
  console.log('Step 1: Analyzing customer risk...');
  const customerId = 'CUST-12345';
  const riskScore = await agent.analyzeCustomerRisk(customerId);
  
  console.log(`Customer: ${customerId}`);
  console.log(`Risk Score: ${(riskScore.score * 100).toFixed(1)}%`);
  console.log(`Risk Level: ${riskScore.riskLevel}`);
  console.log(`Recommendation: ${riskScore.recommendation}`);
  console.log();

  // Step 2: Based on risk level, take appropriate action
  if (riskScore.riskLevel === 'high') {
    console.log('Step 2: High-risk customer detected. Sending urgent dunning email...');
    await agent.sendDunningEmail(customerId, 'customer@example.com');
    console.log('Dunning email sent.');
    console.log();

    // Step 3: Follow up with Teams message
    console.log('Step 3: Sending Teams follow-up...');
    await agent.sendTeamsFollowUp(customerId, 'collections@example.com');
    console.log('Teams message sent.');
    console.log();

  } else if (riskScore.riskLevel === 'medium') {
    console.log('Step 2: Medium-risk customer. Proposing payment plan...');
    await agent.proposePaymentPlan(customerId, 'customer@example.com', 6);
    console.log('Payment plan sent.');
    console.log();

  } else {
    console.log('Step 2: Low-risk customer. Sending standard reminder...');
    await agent.sendDunningEmail(customerId, 'customer@example.com');
    console.log('Reminder sent.');
    console.log();
  }

  // Step 4: Record any customer promises
  console.log('Step 4: Recording customer promise to pay...');
  await agent.recordPromiseToPay(
    customerId,
    5000,
    '2026-03-15',
    'Customer called and committed to payment after discussing financial situation'
  );
  console.log('Promise recorded.');
}

/**
 * Example: Batch processing high-risk customers
 */
async function batchProcessHighRisk() {
  const agent = new CollectionsAgent();

  console.log('Processing all high-risk customers...');
  await agent.processHighRiskCustomers();
  console.log('Batch processing complete.');
}

/**
 * Example: Custom risk analysis with detailed output
 */
async function detailedRiskAnalysis() {
  const agent = new CollectionsAgent();

  const customerId = 'CUST-67890';
  const riskScore = await agent.analyzeCustomerRisk(customerId);

  console.log('=== Detailed Risk Analysis ===');
  console.log(`Customer ID: ${customerId}`);
  console.log(`Risk Score: ${(riskScore.score * 100).toFixed(2)}%`);
  console.log(`Risk Level: ${riskScore.riskLevel.toUpperCase()}`);
  console.log();

  console.log('Risk Factors:');
  riskScore.factors.forEach((factor, index) => {
    console.log(`  ${index + 1}. ${factor.factor} (Impact: ${(factor.impact * 100).toFixed(1)}%)`);
    console.log(`     ${factor.description}`);
  });
  console.log();

  console.log('Recommendation:');
  console.log(`  ${riskScore.recommendation}`);
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
    default:
      console.log('Usage: ts-node examples/collections-workflow.ts [workflow|batch|analysis]');
  }
}

export { completeCollectionsWorkflow, batchProcessHighRisk, detailedRiskAnalysis };
