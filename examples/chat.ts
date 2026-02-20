/**
 * AR Collections Assistant — Interactive Chat
 *
 * A natural-language terminal chat powered by Azure OpenAI function calling.
 * Ask questions in plain English; the assistant queries Dynamics 365 via the
 * MCP server, runs risk analysis, drafts emails, and takes action.
 *
 * Usage:
 *   npx ts-node examples/chat.ts
 *
 * Example prompts:
 *   "Show me the top 5 customers with outstanding AR balances and their risk scores"
 *   "Draft dunning emails for the top 3 high-risk accounts and send them to my inbox"
 *   "Create a 6-month payment plan for the highest-risk customer and email it to me"
 *   "Which customers have broken the most payment promises?"
 *   "Record that customer X promised to pay $10,000 by March 15"
 *
 * Requirements:
 *   - AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT_NAME in .env
 *   - GRAPH_USER_EMAIL set to your email address (used as default recipient for drafts)
 *   - DEMO_MODE=true for mock D365 data, or configure ERP_* vars for live D365
 */

import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { CollectionsChat } from '../src/chat/collectionsChat';

dotenv.config();

// ---------------------------------------------------------------------------
// ANSI colour helpers (no external dependencies)
// ---------------------------------------------------------------------------

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  red:     '\x1b[31m',
};

function ln(text = ''): void { process.stdout.write(text + '\n'); }

function hr(): void { ln(C.dim + '─'.repeat(64) + C.reset); }

// ---------------------------------------------------------------------------
// Tool-call progress labels
// ---------------------------------------------------------------------------

function toolLabel(name: string, args: Record<string, unknown>): string {
  const id = args.customer_id ? `  (${String(args.customer_id).substring(0, 8)}...)` : '';
  switch (name) {
    case 'get_prioritized_customers':
      return `Fetching top ${args.top_n ?? 5} priority customers...`;
    case 'analyze_customer_risk':
      return `Analyzing risk${id}`;
    case 'send_dunning_email':
      return `Drafting & sending dunning email to ${args.recipient_email}${id}`;
    case 'propose_payment_plan':
      return `Building ${args.months ?? 6}-month payment plan → ${args.recipient_email}${id}`;
    case 'send_teams_notification':
      return `Sending Teams alert to ${args.recipient_email}${id}`;
    case 'record_promise_to_pay':
      return `Recording promise to pay $${args.amount} by ${args.date}${id}`;
    default:
      return `Running ${name}...`;
  }
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

function banner(): void {
  ln();
  ln(`${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════════╗`);
  ln(`║       AR Collections Assistant — Interactive Chat            ║`);
  ln(`╚══════════════════════════════════════════════════════════════╝${C.reset}`);
  ln();
  ln(`${C.dim}  Powered by Azure OpenAI GPT-5 · Dynamics 365 via MCP · Microsoft Graph${C.reset}`);
  ln();
  ln(`${C.dim}  Example prompts:${C.reset}`);
  ln(`${C.dim}    • "Show me top 5 customers by AR balance with risk scores and next steps"`);
  ln(`    • "Draft dunning emails for high-risk accounts and send to my inbox for review"`);
  ln(`    • "Create a 6-month payment plan for the top customer and email it to me"`);
  ln(`    • "Which customer has the most overdue balance past 90 days?"${C.reset}`);
  ln();
  ln(`${C.dim}  Type ${C.reset}${C.yellow}exit${C.reset}${C.dim} or ${C.reset}${C.yellow}quit${C.reset}${C.dim} to close.${C.reset}`);
  ln();
  hr();
}

// ---------------------------------------------------------------------------
// Main chat loop
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  banner();

  const chat = new CollectionsChat((name, args) => {
    ln(`${C.green}  ⚙  ${toolLabel(name, args)}${C.reset}`);
  });

  // Use rl.on('line') + pause/resume to avoid Windows readline double-echo.
  // Writing the prompt with process.stdout.write bypasses readline's echo handling.
  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    terminal: false,  // prevent readline from managing echo / prompts itself
  });

  let processing = false;

  function prompt(): void {
    process.stdout.write(`\n${C.yellow}${C.bold}You:${C.reset} `);
  }

  rl.on('line', async (raw) => {
    // Ignore input that arrives while we are still processing the previous message
    if (processing) return;

    const input = raw.trim();

    if (!input) {
      prompt();
      return;
    }

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      ln(`\n${C.dim}Closing chat and shutting down MCP server...${C.reset}\n`);
      rl.close();
      await chat.close();
      return;
    }

    processing = true;
    rl.pause();
    ln();

    try {
      const reply = await chat.sendMessage(input);
      ln(`${C.cyan}${C.bold}Assistant:${C.reset}`);
      ln();
      reply.split('\n').forEach(line => ln(`  ${line}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      ln(`${C.red}  ❌ Error: ${msg}${C.reset}`);

      if (msg.includes('401') || msg.includes('403') || msg.includes('authentication')) {
        ln(`${C.dim}  💡 Check AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT_NAME in .env${C.reset}`);
      }
    }

    ln();
    hr();
    processing = false;
    rl.resume();
    prompt();
  });

  prompt();
}

if (require.main === module) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Fatal error: ${msg}\n`);
    process.exit(1);
  });
}
