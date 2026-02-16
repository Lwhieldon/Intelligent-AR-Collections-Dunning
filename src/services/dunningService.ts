import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import { ARAgingData, RiskScore } from '../types';

export class DunningService {
  private client: OpenAIClient;
  private deploymentName: string;

  constructor() {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
    const apiKey = process.env.AZURE_OPENAI_API_KEY || '';
    this.client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';
  }

  /**
   * Generate personalized dunning email content using GenAI
   */
  async generateDunningEmail(
    customerName: string,
    arData: ARAgingData,
    riskScore: RiskScore
  ): Promise<{ subject: string; body: string }> {
    const prompt = `Generate a professional but firm dunning email for the following customer:

Customer Name: ${customerName}
Total Outstanding: $${arData.totalOutstanding.toFixed(2)}
Risk Level: ${riskScore.riskLevel}

Aging Breakdown:
- Current: $${arData.current.toFixed(2)}
- 30 days overdue: $${arData.days30.toFixed(2)}
- 60 days overdue: $${arData.days60.toFixed(2)}
- 90 days overdue: $${arData.days90.toFixed(2)}
- 120+ days overdue: $${arData.days120Plus.toFixed(2)}

Number of overdue invoices: ${arData.invoices.filter(inv => inv.daysOverdue > 0).length}

The email should:
1. Be professional and respectful
2. Clearly state the outstanding balance and overdue amounts
3. Request immediate payment or contact to discuss payment arrangements
4. Include a sense of urgency appropriate to the risk level
5. Offer assistance if they have questions

Format the response as JSON with "subject" and "body" fields. The body should be in HTML format.`;

    try {
      const response = await this.client.getChatCompletions(
        this.deploymentName,
        [
          {
            role: 'system',
            content: 'You are a professional collections specialist who writes effective but respectful dunning communications. Always format your response as valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          maxTokens: 800,
          temperature: 0.7,
        }
      );

      const content = response.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          subject: parsed.subject,
          body: parsed.body,
        };
      }

      return this.getFallbackEmail(customerName, arData, riskScore.riskLevel);
    } catch (error) {
      console.error('Error generating dunning email:', error);
      return this.getFallbackEmail(customerName, arData, riskScore.riskLevel);
    }
  }

  /**
   * Generate Teams message for collections follow-up
   */
  async generateTeamsMessage(
    customerName: string,
    arData: ARAgingData,
    riskScore: RiskScore
  ): Promise<string> {
    const prompt = `Generate a professional Teams chat message to follow up on overdue payments:

Customer: ${customerName}
Total Outstanding: $${arData.totalOutstanding.toFixed(2)}
Risk Level: ${riskScore.riskLevel}
Most overdue invoice: ${arData.invoices.sort((a, b) => b.daysOverdue - a.daysOverdue)[0]?.daysOverdue || 0} days

The message should be:
1. Brief and conversational (suitable for Teams chat)
2. Professional but friendly
3. Request payment or discussion
4. No more than 3-4 sentences`;

    try {
      const response = await this.client.getChatCompletions(
        this.deploymentName,
        [
          {
            role: 'system',
            content: 'You are a professional collections specialist writing a Teams message. Keep it brief and conversational.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          maxTokens: 200,
          temperature: 0.7,
        }
      );

      return response.choices[0]?.message?.content || this.getFallbackTeamsMessage(customerName, arData);
    } catch (error) {
      console.error('Error generating Teams message:', error);
      return this.getFallbackTeamsMessage(customerName, arData);
    }
  }

  private getFallbackEmail(
    customerName: string,
    arData: ARAgingData,
    riskLevel: string
  ): { subject: string; body: string } {
    const urgency = riskLevel === 'high' ? 'URGENT: ' : '';
    
    return {
      subject: `${urgency}Outstanding Balance - Action Required`,
      body: `
        <html>
        <body style="font-family: Arial, sans-serif;">
          <p>Dear ${customerName},</p>
          
          <p>We are writing to inform you of an outstanding balance on your account:</p>
          
          <table style="border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 5px;"><strong>Total Outstanding:</strong></td><td style="padding: 5px;">$${arData.totalOutstanding.toFixed(2)}</td></tr>
            <tr><td style="padding: 5px;"><strong>Amount Overdue:</strong></td><td style="padding: 5px;">$${(arData.days30 + arData.days60 + arData.days90 + arData.days120Plus).toFixed(2)}</td></tr>
          </table>
          
          <p>Please remit payment immediately or contact us to discuss payment arrangements.</p>
          
          <p>If you have already made this payment, please disregard this notice.</p>
          
          <p>Thank you for your prompt attention to this matter.</p>
          
          <p>Best regards,<br/>Accounts Receivable Team</p>
        </body>
        </html>
      `,
    };
  }

  private getFallbackTeamsMessage(customerName: string, arData: ARAgingData): string {
    return `Hi, I wanted to follow up regarding the outstanding balance of $${arData.totalOutstanding.toFixed(2)} on ${customerName}'s account. Could we schedule a quick call to discuss payment or arrange a payment plan? Thanks!`;
  }
}
