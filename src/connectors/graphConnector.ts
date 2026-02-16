import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { CRMNote } from '../types';

export class GraphConnector {
  private client: Client;

  constructor() {
    const credential = new ClientSecretCredential(
      process.env.GRAPH_TENANT_ID || '',
      process.env.GRAPH_CLIENT_ID || '',
      process.env.GRAPH_CLIENT_SECRET || ''
    );

    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });

    this.client = Client.initWithMiddleware({ authProvider });
  }

  /**
   * Send email via Microsoft Graph
   */
  async sendEmail(to: string, subject: string, body: string, from?: string): Promise<void> {
    try {
      const message = {
        subject,
        body: {
          contentType: 'HTML',
          content: body,
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
      };

      const endpoint = from ? `/users/${from}/sendMail` : '/me/sendMail';

      await this.client.api(endpoint).post({
        message,
        saveToSentItems: true,
      });

      console.log(`Email sent to ${to}`);
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send email via Graph API');
    }
  }

  /**
   * Send Teams chat message
   */
  async sendTeamsMessage(chatId: string, message: string): Promise<void> {
    try {
      await this.client.api(`/chats/${chatId}/messages`).post({
        body: {
          content: message,
        },
      });

      console.log(`Teams message sent to chat ${chatId}`);
    } catch (error) {
      console.error('Error sending Teams message:', error);
      throw new Error('Failed to send Teams message via Graph API');
    }
  }

  /**
   * Create a Teams chat with a user
   */
  async createChat(userEmail: string): Promise<string> {
    try {
      const user = await this.client.api(`/users/${userEmail}`).get();

      const chat = await this.client.api('/chats').post({
        chatType: 'oneOnOne',
        members: [
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${user.id}')`,
          },
        ],
      });

      return chat.id;
    } catch (error) {
      console.error('Error creating Teams chat:', error);
      throw new Error('Failed to create Teams chat via Graph API');
    }
  }

  /**
   * Add note to SharePoint list (simulating CRM notes)
   */
  async addCRMNote(note: CRMNote, siteId: string, listId: string): Promise<void> {
    try {
      await this.client.api(`/sites/${siteId}/lists/${listId}/items`).post({
        fields: {
          Title: `Customer ${note.customerId} - ${note.category}`,
          CustomerId: note.customerId,
          NoteDate: note.noteDate,
          Author: note.author,
          Content: note.content,
          Category: note.category,
        },
      });

      console.log(`CRM note added for customer ${note.customerId}`);
    } catch (error) {
      console.error('Error adding CRM note:', error);
      throw new Error('Failed to add CRM note via Graph API');
    }
  }

  /**
   * Get user information
   */
  async getUserInfo(userEmail: string): Promise<any> {
    try {
      return await this.client.api(`/users/${userEmail}`).get();
    } catch (error) {
      console.error('Error fetching user info:', error);
      throw new Error('Failed to fetch user info via Graph API');
    }
  }
}
