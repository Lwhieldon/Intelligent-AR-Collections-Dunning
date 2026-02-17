import { Client } from '@microsoft/microsoft-graph-client';
import { InteractiveBrowserCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { CRMNote } from '../types';

export class GraphConnector {
  private client: Client;

  constructor() {
    // Use interactive browser authentication (passes device compliance)
    // Note: Redirect URI must be configured in Azure AD as "Mobile and desktop applications"
    const credential = new InteractiveBrowserCredential({
      tenantId: process.env.GRAPH_TENANT_ID || '',
      clientId: process.env.GRAPH_CLIENT_ID || '',
      redirectUri: 'http://localhost:3000',
    });

    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: [
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/Chat.Create',
        'https://graph.microsoft.com/ChatMessage.Send',
        'https://graph.microsoft.com/User.Read',
        'https://graph.microsoft.com/User.ReadBasic.All',
      ],
    });

    this.client = Client.initWithMiddleware({ authProvider });
  }

  /**
   * Send email via Microsoft Graph (Delegated authentication)
   * Email will be sent from the signed-in user's mailbox
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

      // For delegated flow, use /me/sendMail - sends from signed-in user
      await this.client.api('/me/sendMail').post({
        message,
        saveToSentItems: true,
      });

      console.log(`✓ Email sent to ${to} from signed-in user's mailbox`);
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
   * For one-on-one chats, both the signed-in user and recipient must be included
   */
  async createChat(userEmail: string): Promise<string> {
    try {
      // Get the signed-in user (sender)
      const me = await this.client.api('/me').get();

      // Get the recipient user
      const user = await this.client.api(`/users/${userEmail}`).get();

      // Check if trying to create chat with yourself
      if (me.id === user.id) {
        throw new Error(
          `Cannot create Teams chat with yourself (${userEmail}). ` +
          'Please set TEST_COLLECTIONS_EMAIL to a different user\'s email address in .env'
        );
      }

      // OneOnOne chat requires exactly 2 different members
      const chat = await this.client.api('/chats').post({
        chatType: 'oneOnOne',
        members: [
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${me.id}')`,
          },
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

      // Preserve the helpful error message about chatting with yourself
      if (error instanceof Error && error.message.includes('Cannot create Teams chat with yourself')) {
        throw error;
      }

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
  async getUserInfo(userEmail: string): Promise<Record<string, unknown>> {
    try {
      return await this.client.api(`/users/${userEmail}`).get();
    } catch (error) {
      console.error('Error fetching user info:', error);
      throw new Error('Failed to fetch user info via Graph API');
    }
  }
}
