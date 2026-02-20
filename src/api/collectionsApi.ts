/**
 * AR Collections REST API Server
 *
 * Express HTTP server that exposes the CollectionsAgent capabilities as REST
 * endpoints consumed by the M365 Copilot Chat declarative agent (via API Plugin).
 *
 * Endpoints:
 *   GET  /api/customers                              → Prioritized customer list
 *   GET  /api/customers/:customerId/risk             → Risk analysis
 *   POST /api/customers/:customerId/dunning-email    → Send dunning email
 *   POST /api/customers/:customerId/payment-plan     → Propose payment plan
 *   POST /api/customers/:customerId/teams-notification → Teams alert
 *   POST /api/customers/:customerId/promise-to-pay   → Record promise
 *
 * Usage:
 *   npm run api-server          (ts-node, development)
 *   node dist/api/collectionsApi.js  (compiled, production)
 */

import * as dotenv from 'dotenv';
import * as http from 'http';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { CollectionsAgent } from '../agents/collectionsAgent';

dotenv.config();

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// CORS — allow Copilot Studio and M365 plugin host to call the API
// ---------------------------------------------------------------------------

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

app.options('*', (_req: Request, res: Response) => res.sendStatus(204));

// ---------------------------------------------------------------------------
// Agent singleton — one instance shared across all requests
// ---------------------------------------------------------------------------

const agent = new CollectionsAgent();

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'AR Collections API', version: '1.0.0' });
});

// ---------------------------------------------------------------------------
// GET /api/customers
// Returns customers ranked by risk × balance.
// ---------------------------------------------------------------------------

app.get('/api/customers', async (req: Request, res: Response) => {
  try {
    const topN = Math.max(1, parseInt((req.query.top_n as string) || '5', 10));
    const all = await agent.prioritizeCollectionEfforts();
    res.json({ customers: all.slice(0, topN) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/customers/:customerId/risk
// Detailed risk analysis for a single customer.
// ---------------------------------------------------------------------------

app.get('/api/customers/:customerId/risk', async (req: Request, res: Response) => {
  try {
    const riskScore = await agent.analyzeCustomerRisk(req.params.customerId);
    res.json(riskScore);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/customers/:customerId/dunning-email
// Generate and send a personalized dunning email.
// ---------------------------------------------------------------------------

app.post('/api/customers/:customerId/dunning-email', async (req: Request, res: Response) => {
  const { recipientEmail } = req.body as { recipientEmail?: string };
  if (!recipientEmail) {
    res.status(400).json({ error: 'recipientEmail is required' });
    return;
  }
  try {
    await agent.sendDunningEmail(req.params.customerId, recipientEmail);
    res.json({ success: true, sentTo: recipientEmail });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/customers/:customerId/payment-plan
// Create a tailored payment plan and email it.
// ---------------------------------------------------------------------------

app.post('/api/customers/:customerId/payment-plan', async (req: Request, res: Response) => {
  const { recipientEmail, months } = req.body as { recipientEmail?: string; months?: number };
  if (!recipientEmail) {
    res.status(400).json({ error: 'recipientEmail is required' });
    return;
  }
  const numberOfMonths = months ?? 6;
  try {
    await agent.proposePaymentPlan(req.params.customerId, recipientEmail, numberOfMonths);
    res.json({ success: true, sentTo: recipientEmail, months: numberOfMonths });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/customers/:customerId/teams-notification
// Send a Teams alert to a collections team member.
// ---------------------------------------------------------------------------

app.post('/api/customers/:customerId/teams-notification', async (req: Request, res: Response) => {
  const { recipientEmail } = req.body as { recipientEmail?: string };
  if (!recipientEmail) {
    res.status(400).json({ error: 'recipientEmail is required' });
    return;
  }
  try {
    await agent.sendTeamsFollowUp(req.params.customerId, recipientEmail);
    res.json({ success: true, sentTo: recipientEmail });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/customers/:customerId/promise-to-pay
// Record a customer payment promise in the ERP system.
// ---------------------------------------------------------------------------

app.post('/api/customers/:customerId/promise-to-pay', async (req: Request, res: Response) => {
  const { amount, date, notes } = req.body as { amount?: number; date?: string; notes?: string };
  if (amount === undefined || !date) {
    res.status(400).json({ error: 'amount and date are required' });
    return;
  }
  try {
    await agent.recordPromiseToPay(req.params.customerId, amount, date, notes ?? '');
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? '3978', 10);
const server: http.Server = app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║   AR Collections API — listening on port ${PORT}       ║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
  console.log(`  Customers: http://localhost:${PORT}/api/customers`);
  console.log(`\n  ← Ready for M365 Copilot Chat API Plugin calls\n`);
});

// Graceful shutdown — close the MCP server child process cleanly
async function shutdown(): Promise<void> {
  console.log('\nShutting down AR Collections API...');
  await agent.close();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => { shutdown().catch(console.error); });
process.on('SIGINT',  () => { shutdown().catch(console.error); });

export { app };
