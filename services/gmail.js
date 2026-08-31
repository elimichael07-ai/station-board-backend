/**
 * Gmail Service
 * Pulls all emails, extracts assignment deadlines and todos
 */

import { google } from 'googleapis';

export async function pullGmailTodos(credentials) {
  try {
    console.log('[Gmail] Authenticating with Gmail API...');

    const auth = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      process.env.GMAIL_REDIRECT_URL || 'http://localhost:3000/api/auth/gmail/callback'
    );

    auth.setCredentials({ refresh_token: credentials.refreshToken });

    const gmail = google.gmail({ version: 'v1', auth });

    // Fetch all emails
    console.log('[Gmail] Fetching emails...');
    const messages = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:blinn.edu OR from:pearson.com OR from:castlebranch.com',
      maxResults: 50,
    });

    const todos = [];
    const assignments = [];

    if (messages.data.messages) {
      for (const message of messages.data.messages) {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full',
        });

        const email = parseEmail(msg.data);
        
        // Extract assignment-related content
        if (email.subject.toLowerCase().includes('assignment') || 
            email.subject.toLowerCase().includes('homework') ||
            email.subject.toLowerCase().includes('due') ||
            email.subject.toLowerCase().includes('quiz')) {
          
          assignments.push({
            from: email.from,
            subject: email.subject,
            date: email.date,
            body: email.body.substring(0, 500), // First 500 chars
            messageId: message.id,
          });

          // Parse deadline if present
          const deadline = extractDeadline(email.body + ' ' + email.subject);
          if (deadline) {
            todos.push({
              type: 'assignment',
              title: email.subject,
              dueDate: deadline,
              source: 'Gmail',
              messageId: message.id,
            });
          }
        }
      }
    }

    console.log(`[Gmail] Found ${assignments.length} assignment emails and ${todos.length} todos.`);

    return {
      emails: assignments,
      todos,
      lastSync: new Date().toISOString(),
    };

  } catch (error) {
    console.error('[Gmail] Error:', error.message);
    throw error;
  }
}

function parseEmail(message) {
  const headers = message.payload.headers;
  const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

  let body = '';
  if (message.payload.parts) {
    for (const part of message.payload.parts) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        body = Buffer.from(part.body.data, 'base64').toString();
        break;
      }
    }
  } else if (message.payload.body?.data) {
    body = Buffer.from(message.payload.body.data, 'base64').toString();
  }

  return {
    from: getHeader('From'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    body,
  };
}

function extractDeadline(text) {
  // Simple regex patterns for common date formats
  const patterns = [
    /Due:\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
    /Due date:\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
    /Deadline:\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
    /by\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return new Date(match[1]).toISOString();
    }
  }

  return null;
}
