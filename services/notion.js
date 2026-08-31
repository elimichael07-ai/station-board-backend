/**
 * Notion Service
 * Pulls lecture notes, fixes spelling/grammar, organizes by assignment
 */

import { Client } from '@notionhq/client';

export async function pullNotionNotes(credentials) {
  try {
    console.log('[Notion] Connecting to Notion workspace...');
    
    const notion = new Client({ auth: credentials.apiKey });

    // Find all database pages (lecture notes, assignments, etc.)
    const notionData = {
      lectures: {},
      assignmentNotes: {},
      studyGuides: {},
      lastSync: new Date().toISOString(),
    };

    // Query all database pages
    const databases = await notion.search({
      filter: {
        value: 'database',
        property: 'object',
      },
    });

    console.log(`[Notion] Found ${databases.results.length} databases. Querying pages...`);

    for (const db of databases.results) {
      const pages = await notion.databases.query({
        database_id: db.id,
      });

      for (const page of pages.results) {
        const title = page.properties.Name?.title?.[0]?.plain_text || 'Untitled';
        const content = await extractPageContent(notion, page.id);

        // Categorize by title
        if (title.toLowerCase().includes('lecture')) {
          notionData.lectures[title] = {
            content,
            raw: JSON.stringify(page.properties),
            id: page.id,
            lastEdited: page.last_edited_time,
          };
        } else if (title.toLowerCase().includes('assignment') || title.toLowerCase().includes('homework')) {
          notionData.assignmentNotes[title] = {
            content,
            raw: JSON.stringify(page.properties),
            id: page.id,
          };
        } else {
          notionData.studyGuides[title] = {
            content,
            id: page.id,
          };
        }
      }
    }

    console.log('[Notion] Extraction complete.');
    return notionData;

  } catch (error) {
    console.error('[Notion] Error:', error.message);
    throw error;
  }
}

async function extractPageContent(notion, pageId) {
  try {
    const blocks = await notion.blocks.children.list({ block_id: pageId });
    
    let content = '';
    for (const block of blocks.results) {
      if (block.type === 'paragraph') {
        content += block.paragraph.rich_text.map(t => t.plain_text).join('') + '\n';
      } else if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
        content += '\n' + block[block.type].rich_text.map(t => t.plain_text).join('') + '\n';
      } else if (block.type === 'bulleted_list_item') {
        content += '• ' + block.bulleted_list_item.rich_text.map(t => t.plain_text).join('') + '\n';
      }
    }
    
    return content.trim();
  } catch (error) {
    console.error('[Notion] Error extracting page content:', error.message);
    return '';
  }
}

/**
 * Fix spelling and grammar in notes
 * This would integrate with a grammar API or Claude API
 */
export async function fixNotesGrammar(notes) {
  // TODO: Call Claude API to fix spelling/grammar
  // For now, return as-is
  return notes;
}
