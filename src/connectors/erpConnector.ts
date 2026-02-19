/**
 * ERP Connector
 *
 * MCP client that connects to the external ERP MCP Server
 * (src/mcp/erpMcpServer.ts) via the Model Context Protocol over stdio.
 *
 * All Dynamics 365 API logic lives in the MCP server; this class is a
 * thin, typed wrapper that spawns the server process and calls its tools.
 */

import path from 'path';
import { ARAgingData, PaymentHistory } from '../types';

// ---------------------------------------------------------------------------
// Minimal MCP SDK type definitions (runtime resolved via require)
// ---------------------------------------------------------------------------

interface McpClientInfo    { name: string; version: string; }
interface McpClientOptions { capabilities: Record<string, unknown>; }
interface McpTransport     {}
interface McpContentBlock  { type: string; text?: string; }
interface McpCallResult    { content: McpContentBlock[]; isError?: boolean; }

interface McpClientInstance {
  connect(transport: McpTransport): Promise<void>;
  callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<McpCallResult>;
  close(): Promise<void>;
}

interface StdioTransportOptions {
  command: string;
  args:    string[];
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require('@modelcontextprotocol/sdk/client') as
  { Client: new (info: McpClientInfo, opts: McpClientOptions) => McpClientInstance };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js') as
  { StdioClientTransport: new (opts: StdioTransportOptions) => McpTransport };

// ---------------------------------------------------------------------------
// ERPConnector — MCP client
// ---------------------------------------------------------------------------

export class ERPConnector {
  private mcpClient: McpClientInstance | null = null;

  /**
   * Return the connected MCP client, creating and connecting it on first call.
   */
  private async getClient(): Promise<McpClientInstance> {
    if (this.mcpClient) return this.mcpClient;

    // Resolve the MCP server entry point.
    // __filename ends in .js when running compiled output, .ts when via ts-node.
    const isCompiled  = __filename.endsWith('.js');
    const serverEntry = isCompiled
      ? path.resolve(__dirname, '../mcp/erpMcpServer.js')
      : path.resolve(__dirname, '../mcp/erpMcpServer.ts');

    const transport = new StdioClientTransport({
      command: isCompiled ? 'node' : 'npx',
      args:    isCompiled ? [serverEntry] : ['ts-node', serverEntry],
    });

    this.mcpClient = new Client(
      { name: 'ar-collections-connector', version: '1.0.0' },
      { capabilities: {} },
    );

    await this.mcpClient.connect(transport);
    return this.mcpClient;
  }

  /**
   * Call a named tool on the ERP MCP server and return the parsed result.
   */
  private async callTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
    const client = await this.getClient();
    const result = await client.callTool({ name: toolName, arguments: args });

    const block = result.content[0];
    if (!block || block.type !== 'text' || block.text === undefined) {
      throw new Error(`ERP MCP Server returned unexpected response for tool "${toolName}"`);
    }

    const parsed: unknown = JSON.parse(block.text);
    if (parsed !== null && typeof parsed === 'object' && 'error' in parsed) {
      throw new Error((parsed as { error: string }).error);
    }
    return parsed as T;
  }

  // -------------------------------------------------------------------------
  // Public API — same surface as before, now backed by MCP tools
  // -------------------------------------------------------------------------

  /** Fetch AR aging data for a specific customer. */
  async getARAgingData(customerId: string): Promise<ARAgingData> {
    return this.callTool<ARAgingData>('get_ar_aging_data', { customerId });
  }

  /** Fetch payment history for a specific customer. */
  async getPaymentHistory(customerId: string): Promise<PaymentHistory> {
    return this.callTool<PaymentHistory>('get_payment_history', { customerId });
  }

  /** Get all customers with outstanding balances. */
  async getCustomersWithOutstandingBalance(): Promise<string[]> {
    return this.callTool<string[]>('get_customers_with_outstanding_balance', {});
  }

  /** Append a collections note to the customer record in the ERP. */
  async updateCustomerNotes(customerId: string, note: string): Promise<void> {
    await this.callTool<{ success: boolean }>('update_customer_notes', { customerId, note });
  }

  /** Gracefully shut down the MCP client and the spawned server process. */
  async close(): Promise<void> {
    if (this.mcpClient) {
      await this.mcpClient.close();
      this.mcpClient = null;
    }
  }
}
