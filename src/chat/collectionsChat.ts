/**
 * Collections Chat Engine
 *
 * Provides a natural-language chat interface over the CollectionsAgent using
 * Azure OpenAI function calling (tool use). The AI interprets free-form requests,
 * selects the appropriate agent tools, executes them, and returns a formatted response.
 *
 * Tools exposed to the AI:
 *   - get_prioritized_customers     : Rank all customers by risk × balance
 *   - analyze_customer_risk         : Detailed risk breakdown for one customer
 *   - send_dunning_email            : Draft + send dunning email to any address
 *   - propose_payment_plan          : Create + email a payment plan
 *   - send_teams_notification       : Send Teams alert to a collections team member
 *   - record_promise_to_pay         : Record a customer payment promise in ERP
 */

import * as dotenv from 'dotenv';
import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
} from 'openai/resources';
import { CollectionsAgent } from '../agents/collectionsAgent';

dotenv.config();

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(userEmail: string): string {
  return `You are an intelligent AR Collections & Dunning Assistant for a finance team.
You help collections specialists prioritize accounts, understand risk, and take action.

The current user's email address is: ${userEmail}
When the user says "send to my email" or "draft for me to review", use this email address as the recipient.

You have access to tools that connect to Dynamics 365 (via MCP server) and Microsoft 365.
Always use tools to fetch live data — do not make up customer names, balances, or risk scores.

When presenting results:
- Use clear formatting with customer name, ID (shortened), risk level, and balance
- For risk levels: HIGH = urgent action needed, MEDIUM = payment plan, LOW = reminder
- Include next-step recommendations from the risk analysis
- Confirm when emails / Teams messages have been sent and to whom
- Be concise: summary first, details on request

When the user asks to "draft" or "send for review", always send to the user's own email
(${userEmail}) so they can review before forwarding to customers.

IMPORTANT — avoid redundant tool calls:
- get_prioritized_customers already returns COMPLETE risk data for each customer: risk score,
  risk level, all three factor breakdowns (aging, payment history, promise keeping), and the
  AI-generated recommendation. Do NOT call analyze_customer_risk separately after calling
  get_prioritized_customers — all the data you need is already in the response.
- If fewer customers are returned than requested (e.g. 3 instead of 5), it means fewer
  customers currently have outstanding balances in the ERP system. Report what was found
  and explain this clearly to the user.`;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_prioritized_customers',
      description:
        'Get all customers ranked by combined risk score and outstanding balance. ' +
        'Returns the top N customers with COMPLETE data: customer names, outstanding balances, ' +
        'risk levels, risk scores, all three factor breakdowns (aging 50%, payment history 30%, ' +
        'promise keeping 20%), and AI-generated next-step recommendations. ' +
        'This tool already includes everything analyze_customer_risk returns — do NOT call ' +
        'analyze_customer_risk again for customers already returned by this tool. ' +
        'If fewer customers are returned than requested, the ERP system has fewer customers ' +
        'with outstanding balances. Use this to answer questions like ' +
        '"show me my top customers", "who should I contact first", or ' +
        '"show top N customers with risk scores and next steps".',
      parameters: {
        type: 'object',
        properties: {
          top_n: {
            type: 'number',
            description: 'How many top-priority customers to return. Default: 5.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_customer_risk',
      description:
        'Perform a detailed risk analysis for a single customer. Returns risk score, ' +
        'risk level, the three weighted factor breakdowns (aging, payment history, ' +
        'promise keeping), and an AI-generated recommendation for next steps.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'The customer ID (GUID from Dynamics 365)',
          },
        },
        required: ['customer_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_dunning_email',
      description:
        'Draft a personalized AI-generated dunning email for a customer and send it to ' +
        'the specified email address. When the user wants to review before sending to the ' +
        'customer, use the user\'s own email as recipient_email.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'The customer ID',
          },
          recipient_email: {
            type: 'string',
            description: 'Email address to send the dunning email to',
          },
        },
        required: ['customer_id', 'recipient_email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_payment_plan',
      description:
        'Create a tailored payment plan with amortization schedule for a customer ' +
        'and send it as an HTML email to the specified address.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'The customer ID',
          },
          recipient_email: {
            type: 'string',
            description: 'Email address to send the payment plan to',
          },
          months: {
            type: 'number',
            description: 'Number of installment months. Default: 6.',
          },
        },
        required: ['customer_id', 'recipient_email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_teams_notification',
      description:
        'Send a Teams message to a collections team member alerting them about a ' +
        'high-priority customer account that needs immediate attention.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'The customer ID',
          },
          recipient_email: {
            type: 'string',
            description: 'Email of the collections team member to notify',
          },
        },
        required: ['customer_id', 'recipient_email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_promise_to_pay',
      description:
        'Record a customer payment promise in the ERP system. Use when a customer ' +
        'has verbally committed to pay by a specific date.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'The customer ID',
          },
          amount: {
            type: 'number',
            description: 'Promised payment amount in dollars',
          },
          date: {
            type: 'string',
            description: 'Promised payment date in YYYY-MM-DD format',
          },
          notes: {
            type: 'string',
            description: 'Additional context about the promise',
          },
        },
        required: ['customer_id', 'amount', 'date'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Chat engine
// ---------------------------------------------------------------------------

export type ToolCallCallback = (toolName: string, args: Record<string, unknown>) => void;

export class CollectionsChat {
  private agent: CollectionsAgent;
  private client: AzureOpenAI;
  private deploymentName: string;
  private history: ChatCompletionMessageParam[];
  private onToolCall?: ToolCallCallback;

  constructor(onToolCall?: ToolCallCallback) {
    this.agent = new CollectionsAgent();
    this.onToolCall = onToolCall;

    const endpoint    = process.env.AZURE_OPENAI_ENDPOINT    ?? '';
    const apiKey      = process.env.AZURE_OPENAI_API_KEY     ?? '';
    const apiVersion  = process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview';
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? 'gpt-5';

    if (!apiKey) {
      const credential        = new DefaultAzureCredential();
      const azureADTokenProvider = getBearerTokenProvider(
        credential,
        'https://cognitiveservices.azure.com/.default',
      );
      this.client = new AzureOpenAI({ endpoint, azureADTokenProvider, deployment: this.deploymentName, apiVersion });
    } else {
      this.client = new AzureOpenAI({ endpoint, apiKey, deployment: this.deploymentName, apiVersion });
    }

    const userEmail = process.env.GRAPH_USER_EMAIL ?? 'your-email@example.com';
    this.history = [{ role: 'system', content: buildSystemPrompt(userEmail) }];
  }

  /**
   * Send a user message and get an assistant response.
   * The method runs an agentic tool-call loop until the model produces a final text response.
   */
  async sendMessage(userMessage: string): Promise<string> {
    this.history.push({ role: 'user', content: userMessage });

    const MAX_ITERATIONS = 15;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await this.client.chat.completions.create({
        model:        this.deploymentName,
        messages:     this.history,
        tools:        TOOLS,
        tool_choice:  'auto',
      });

      const message = response.choices[0].message;
      this.history.push(message as ChatCompletionMessageParam);

      // No tool calls → final text response
      if (!message.tool_calls || message.tool_calls.length === 0) {
        return message.content ?? '';
      }

      // Execute all requested tool calls and feed results back
      for (const toolCall of message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        this.onToolCall?.(toolCall.function.name, args);

        let result: unknown;
        try {
          result = await this.executeTool(toolCall.function.name, args);
        } catch (err: unknown) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }

        this.history.push({
          role:         'tool',
          tool_call_id: toolCall.id,
          content:      JSON.stringify(result),
        } as ChatCompletionMessageParam);
      }
    }

    return 'I reached the maximum number of steps. Please try a more specific request.';
  }

  // ---------------------------------------------------------------------------
  // Tool execution
  // ---------------------------------------------------------------------------

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case 'get_prioritized_customers': {
        const topN = (args.top_n as number) || 5;
        const all  = await this.agent.prioritizeCollectionEfforts();
        return all.slice(0, topN);
      }

      case 'analyze_customer_risk':
        return this.agent.analyzeCustomerRisk(args.customer_id as string);

      case 'send_dunning_email':
        await this.agent.sendDunningEmail(
          args.customer_id  as string,
          args.recipient_email as string,
        );
        return { success: true, sentTo: args.recipient_email };

      case 'propose_payment_plan':
        await this.agent.proposePaymentPlan(
          args.customer_id    as string,
          args.recipient_email as string,
          (args.months as number) || 6,
        );
        return { success: true, sentTo: args.recipient_email, months: (args.months as number) || 6 };

      case 'send_teams_notification':
        await this.agent.sendTeamsFollowUp(
          args.customer_id    as string,
          args.recipient_email as string,
        );
        return { success: true, sentTo: args.recipient_email };

      case 'record_promise_to_pay':
        await this.agent.recordPromiseToPay(
          args.customer_id as string,
          args.amount      as number,
          args.date        as string,
          (args.notes as string) || '',
        );
        return { success: true };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /** Shut down the underlying agent (terminates MCP child process). */
  async close(): Promise<void> {
    await this.agent.close();
  }
}
