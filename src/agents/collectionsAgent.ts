import { ERPConnector } from '../connectors/erpConnector';
import { GraphConnector } from '../connectors/graphConnector';
import { RiskScoringService } from '../services/riskScoringService';
import { DunningService } from '../services/dunningService';
import { PaymentPlanService } from '../services/paymentPlanService';
import { RiskScore, CRMNote, PrioritizedCustomer, PromiseSummary } from '../types';

export class CollectionsAgent {
  private erpConnector: ERPConnector;
  private graphConnector: GraphConnector;
  private riskScoringService: RiskScoringService;
  private dunningService: DunningService;
  private paymentPlanService: PaymentPlanService;

  constructor() {
    this.erpConnector = new ERPConnector();
    this.graphConnector = new GraphConnector();
    this.riskScoringService = new RiskScoringService();
    this.dunningService = new DunningService();
    this.paymentPlanService = new PaymentPlanService();
  }

  /**
   * Get list of customers with outstanding balances
   */
  async getCustomersWithOutstandingBalance(): Promise<string[]> {
    return await this.erpConnector.getCustomersWithOutstandingBalance();
  }

  /**
   * Analyze customer risk and get recommendations
   */
  async analyzeCustomerRisk(customerId: string): Promise<RiskScore> {
    console.log(`Analyzing risk for customer ${customerId}...`);

    // Fetch data from ERP
    const arData = await this.erpConnector.getARAgingData(customerId);
    const paymentHistory = await this.erpConnector.getPaymentHistory(customerId);

    // Calculate risk score
    const riskScore = await this.riskScoringService.calculateRiskScore(arData, paymentHistory);

    console.log(`Risk analysis complete: ${riskScore.riskLevel} risk (${(riskScore.score * 100).toFixed(1)}%)`);

    return riskScore;
  }

  /**
   * Send dunning email to customer
   */
  async sendDunningEmail(customerId: string, customerEmail: string, fromEmail?: string): Promise<void> {
    console.log(`Generating dunning email for customer ${customerId}...`);

    // Get customer data
    const arData = await this.erpConnector.getARAgingData(customerId);
    const riskScore = await this.analyzeCustomerRisk(customerId);

    // Generate personalized email
    const email = await this.dunningService.generateDunningEmail(
      arData.customerName,
      arData,
      riskScore
    );

    // Send email via Graph
    await this.graphConnector.sendEmail(customerEmail, email.subject, email.body, fromEmail);

    // Log to CRM
    await this.logCRMNote(customerId, `Dunning email sent: ${email.subject}`, 'contact-attempt');

    console.log(`Dunning email sent successfully to ${customerEmail}`);
  }

  /**
   * Send Teams message for collections follow-up
   */
  async sendTeamsFollowUp(customerId: string, userEmail: string): Promise<void> {
    console.log(`Sending Teams follow-up for customer ${customerId}...`);

    // Get customer data
    const arData = await this.erpConnector.getARAgingData(customerId);
    const riskScore = await this.analyzeCustomerRisk(customerId);

    // Generate message
    const message = await this.dunningService.generateTeamsMessage(
      arData.customerName,
      arData,
      riskScore
    );

    // Create or get chat
    const chatId = await this.graphConnector.createChat(userEmail);

    // Send message
    await this.graphConnector.sendTeamsMessage(chatId, message);

    // Log to CRM
    await this.logCRMNote(customerId, `Teams message sent to ${userEmail}`, 'contact-attempt');

    console.log(`Teams message sent successfully`);
  }

  /**
   * Create and send payment plan proposal
   */
  async proposePaymentPlan(
    customerId: string,
    customerEmail: string,
    numberOfMonths: number = 6
  ): Promise<void> {
    console.log(`Creating payment plan for customer ${customerId}...`);

    // Get customer data
    const arData = await this.erpConnector.getARAgingData(customerId);

    // Create payment plan
    const paymentPlan = this.paymentPlanService.proposePaymentPlan(
      customerId,
      arData.totalOutstanding,
      numberOfMonths
    );

    // Format for email
    const planHtml = this.paymentPlanService.formatPaymentPlanForEmail(paymentPlan);

    // Send email with payment plan
    const emailBody = `
      <html>
      <body style="font-family: Arial, sans-serif;">
        <p>Dear ${arData.customerName},</p>
        
        <p>Thank you for your willingness to resolve your outstanding balance of $${arData.totalOutstanding.toFixed(2)}.</p>
        
        <p>We would like to propose the following payment plan to help you manage this balance:</p>
        
        ${planHtml}
        
        <p>Please review this proposal and let us know if you would like to proceed or if you need any adjustments.</p>
        
        <p>Best regards,<br/>Accounts Receivable Team</p>
      </body>
      </html>
    `;

    await this.graphConnector.sendEmail(
      customerEmail,
      'Payment Plan Proposal - Account ' + customerId,
      emailBody
    );

    // Log to CRM
    await this.logCRMNote(
      customerId,
      `Payment plan proposed: ${numberOfMonths} monthly payments of $${(arData.totalOutstanding / numberOfMonths).toFixed(2)}`,
      'payment-plan'
    );

    console.log(`Payment plan sent to ${customerEmail}`);
  }

  /**
   * Process all high-risk customers
   */
  async processHighRiskCustomers(): Promise<void> {
    console.log('Processing high-risk customers...');

    const customerIds = await this.erpConnector.getCustomersWithOutstandingBalance();

    for (const customerId of customerIds) {
      try {
        const riskScore = await this.analyzeCustomerRisk(customerId);

        if (riskScore.riskLevel === 'high') {
          console.log(`High-risk customer found: ${customerId}`);
          console.log(`  Score: ${(riskScore.score * 100).toFixed(1)}%`);
          console.log(`  Recommendation: ${riskScore.recommendation}`);
        }
      } catch (error) {
        console.error(`Error processing customer ${customerId}:`, error);
      }
    }

    console.log('High-risk customer processing complete');
  }

  /**
   * Prioritize collection efforts by analyzing all customers and returning a sorted list
   * by risk score and outstanding balance
   */
  async prioritizeCollectionEfforts(): Promise<PrioritizedCustomer[]> {
    console.log('Prioritizing collection efforts...');

    const customerIds = await this.erpConnector.getCustomersWithOutstandingBalance();
    const prioritizedCustomers: PrioritizedCustomer[] = [];

    for (const customerId of customerIds) {
      try {
        const arData = await this.erpConnector.getARAgingData(customerId);
        const riskScore = await this.analyzeCustomerRisk(customerId);

        // Calculate priority score: risk score (0-1) * 70% + normalized outstanding amount * 30%
        // This ensures high-risk accounts with large balances get highest priority
        const normalizedAmount = Math.min(arData.totalOutstanding / 100000, 1); // Normalize to max $100k
        const priority = (riskScore.score * 0.7) + (normalizedAmount * 0.3);

        prioritizedCustomers.push({
          customerId,
          customerName: arData.customerName,
          riskScore,
          totalOutstanding: arData.totalOutstanding,
          priority,
        });
      } catch (error) {
        console.error(`Error analyzing customer ${customerId}:`, error);
      }
    }

    // Sort by priority (highest first)
    prioritizedCustomers.sort((a, b) => b.priority - a.priority);

    console.log(`Collection efforts prioritized: ${prioritizedCustomers.length} customers analyzed`);
    
    return prioritizedCustomers;
  }

  /**
   * Summarize customer promises to pay - provides analytics on promise fulfillment
   */
  async summarizeCustomerPromises(customerId: string): Promise<PromiseSummary> {
    console.log(`Summarizing promises for customer ${customerId}...`);

    const paymentHistory = await this.erpConnector.getPaymentHistory(customerId);
    const arData = await this.erpConnector.getARAgingData(customerId);
    const promises = paymentHistory.promiseToPayHistory;

    const fulfilled = promises.filter(p => p.fulfilled).length;
    const broken = promises.filter(p => !p.fulfilled && new Date(p.promisedDate) < new Date()).length;
    const pending = promises.filter(p => !p.fulfilled && new Date(p.promisedDate) >= new Date()).length;
    
    const totalPromisedAmount = promises.reduce((sum, p) => sum + p.promisedAmount, 0);
    const fulfillmentRate = promises.length > 0 ? fulfilled / promises.length : 0;

    // Get recent promises (last 5)
    const recentPromises = promises
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    const summary: PromiseSummary = {
      customerId,
      customerName: arData.customerName,
      totalPromises: promises.length,
      fulfilledPromises: fulfilled,
      brokenPromises: broken,
      pendingPromises: pending,
      totalPromisedAmount,
      fulfillmentRate,
      recentPromises,
    };

    console.log(`Promise summary complete: ${fulfilled}/${promises.length} fulfilled (${(fulfillmentRate * 100).toFixed(1)}%)`);

    return summary;
  }

  /**
   * Record customer promise to pay
   */
  async recordPromiseToPay(
    customerId: string,
    promisedAmount: number,
    promisedDate: string,
    notes?: string
  ): Promise<void> {
    console.log(`Recording promise to pay for customer ${customerId}...`);

    const noteContent = `Customer promised to pay $${promisedAmount.toFixed(2)} by ${promisedDate}. ${notes || ''}`;
    await this.logCRMNote(customerId, noteContent, 'promise-to-pay');
    await this.erpConnector.updateCustomerNotes(customerId, noteContent);

    console.log('Promise to pay recorded');
  }

  /**
   * Log note to CRM system
   */
  private async logCRMNote(
    customerId: string,
    content: string,
    category: 'promise-to-pay' | 'contact-attempt' | 'payment-plan' | 'general'
  ): Promise<void> {
    const note: CRMNote = {
      customerId,
      noteDate: new Date().toISOString(),
      author: 'Collections Agent',
      content,
      category,
    };

    // In a real implementation, you would specify the actual SharePoint site and list IDs
    // For now, we'll just log it
    console.log(`CRM Note: ${JSON.stringify(note)}`);

    // Optionally save to SharePoint via Graph API
    // await this.graphConnector.addCRMNote(note, siteId, listId);
  }
}
