import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { RiskScore, ARAgingData, PaymentHistory, RiskFactor } from '../types';

export class RiskScoringService {
  private client: AzureOpenAI;
  private deploymentName: string;

  constructor() {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
    const apiKey = process.env.AZURE_OPENAI_API_KEY || '';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';
    
    // Use Microsoft Entra ID if API key is not provided, otherwise use API key
    if (!apiKey) {
      const credential = new DefaultAzureCredential();
      const scope = 'https://cognitiveservices.azure.com/.default';
      const azureADTokenProvider = getBearerTokenProvider(credential, scope);
      this.client = new AzureOpenAI({
        endpoint,
        azureADTokenProvider,
        deployment: this.deploymentName,
        apiVersion,
      });
    } else {
      this.client = new AzureOpenAI({
        endpoint,
        apiKey,
        deployment: this.deploymentName,
        apiVersion,
      });
    }
  }

  /**
   * Calculate risk score for a customer based on AR aging and payment history
   */
  async calculateRiskScore(
    arData: ARAgingData,
    paymentHistory: PaymentHistory
  ): Promise<RiskScore> {
    // Calculate base metrics
    const agingScore = this.calculateAgingScore(arData);
    const paymentScore = this.calculatePaymentHistoryScore(paymentHistory);
    const promiseKeepingScore = this.calculatePromiseKeepingScore(paymentHistory);

    // Weighted average
    const rawScore = (agingScore * 0.4) + (paymentScore * 0.35) + (promiseKeepingScore * 0.25);

    // Normalize to 0-1 range
    const normalizedScore = Math.min(Math.max(rawScore, 0), 1);

    // Determine risk level
    const riskLevel = this.getRiskLevel(normalizedScore);

    // Generate risk factors
    const factors = this.generateRiskFactors(arData, paymentHistory, agingScore, paymentScore, promiseKeepingScore);

    // Generate AI recommendation
    const recommendation = await this.generateRecommendation(arData, paymentHistory, normalizedScore, factors);

    return {
      customerId: arData.customerId,
      score: normalizedScore,
      riskLevel,
      factors,
      recommendation,
    };
  }

  private calculateAgingScore(arData: ARAgingData): number {
    const total = arData.totalOutstanding;
    if (total === 0) return 0;

    // Higher score for older receivables
    const score = (
      (arData.current / total) * 0 +
      (arData.days30 / total) * 0.25 +
      (arData.days60 / total) * 0.5 +
      (arData.days90 / total) * 0.75 +
      (arData.days120Plus / total) * 1.0
    );

    return score;
  }

  private calculatePaymentHistoryScore(paymentHistory: PaymentHistory): number {
    if (paymentHistory.totalTransactions === 0) return 0.5; // Neutral for new customers

    // Lower on-time rate and higher average days means higher risk
    const onTimeScore = 1 - paymentHistory.onTimePaymentRate;
    const daysScore = Math.min(paymentHistory.averagePaymentDays / 90, 1);

    return (onTimeScore * 0.6) + (daysScore * 0.4);
  }

  private calculatePromiseKeepingScore(paymentHistory: PaymentHistory): number {
    const promises = paymentHistory.promiseToPayHistory;
    if (promises.length === 0) return 0; // No broken promises

    const brokenPromises = promises.filter(p => !p.fulfilled).length;
    return brokenPromises / promises.length;
  }

  private getRiskLevel(score: number): 'low' | 'medium' | 'high' {
    const highThreshold = parseFloat(process.env.RISK_THRESHOLD_HIGH || '0.7');
    const mediumThreshold = parseFloat(process.env.RISK_THRESHOLD_MEDIUM || '0.4');

    if (score >= highThreshold) return 'high';
    if (score >= mediumThreshold) return 'medium';
    return 'low';
  }

  private generateRiskFactors(
    arData: ARAgingData,
    paymentHistory: PaymentHistory,
    agingScore: number,
    paymentScore: number,
    promiseScore: number
  ): RiskFactor[] {
    const factors: RiskFactor[] = [];

    if (agingScore > 0.5) {
      factors.push({
        factor: 'Aged Receivables',
        impact: agingScore,
        description: `${((arData.days90 + arData.days120Plus) / arData.totalOutstanding * 100).toFixed(1)}% of outstanding balance is over 90 days`,
      });
    }

    if (paymentScore > 0.5) {
      factors.push({
        factor: 'Payment History',
        impact: paymentScore,
        description: `Average payment delay: ${paymentHistory.averagePaymentDays.toFixed(0)} days, On-time rate: ${(paymentHistory.onTimePaymentRate * 100).toFixed(1)}%`,
      });
    }

    if (promiseScore > 0.3) {
      factors.push({
        factor: 'Promise Keeping',
        impact: promiseScore,
        description: `${(promiseScore * 100).toFixed(0)}% of payment promises were broken`,
      });
    }

    return factors;
  }

  private async generateRecommendation(
    arData: ARAgingData,
    paymentHistory: PaymentHistory,
    riskScore: number,
    factors: RiskFactor[]
  ): Promise<string> {
    const prompt = `As a collections specialist, analyze this customer situation and provide a specific recommendation:

Customer: ${arData.customerName} (ID: ${arData.customerId})
Total Outstanding: $${arData.totalOutstanding.toFixed(2)}
Risk Score: ${(riskScore * 100).toFixed(1)}%

Aging Breakdown:
- Current: $${arData.current.toFixed(2)}
- 30 days: $${arData.days30.toFixed(2)}
- 60 days: $${arData.days60.toFixed(2)}
- 90 days: $${arData.days90.toFixed(2)}
- 120+ days: $${arData.days120Plus.toFixed(2)}

Payment History:
- Average Payment Days: ${paymentHistory.averagePaymentDays.toFixed(0)}
- On-Time Rate: ${(paymentHistory.onTimePaymentRate * 100).toFixed(1)}%
- Last Payment: ${paymentHistory.lastPaymentDate}

Key Risk Factors:
${factors.map(f => `- ${f.factor}: ${f.description}`).join('\n')}

Provide a concise recommendation (2-3 sentences) on the best collection approach.`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.deploymentName,
        messages: [
          {
            role: 'system',
            content: 'You are an expert collections specialist. Provide clear, actionable recommendations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 200,
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content || 'Contact customer to discuss payment options.';
    } catch (error) {
      console.error('Error generating AI recommendation:', error);
      return this.getFallbackRecommendation(riskScore);
    }
  }

  private getFallbackRecommendation(riskScore: number): string {
    if (riskScore >= 0.7) {
      return 'High risk account. Escalate to senior collections team. Consider payment plan or legal action if no response.';
    } else if (riskScore >= 0.4) {
      return 'Medium risk account. Send personalized dunning email and follow up with phone call within 48 hours.';
    } else {
      return 'Low risk account. Send automated reminder email. Monitor for payment within standard terms.';
    }
  }
}
