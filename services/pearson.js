/**
 * Pearson MyLab Brady Scraper
 * Extracts homework, quizzes, and progress data
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';

puppeteer.use(StealthPlugin());

const PEARSON_BASE = 'https://mylabmastering.pearson.com';

export async function scrapPearson(credentials) {
  let browser;
  try {
    console.log('[Pearson] Starting scrape...');

      const sessionRes = await axios.post(
                'https://api.browserbase.com/v1/sessions',
        { projectId: process.env.BROWSERBASE_PROJECT_ID },
        { headers: { 'X-BB-API-Key': process.env.BROWSERBASE_API_KEY, 'Content-Type': 'application/json' } }
              );
          browser = await puppeteer.connect({
                    browserWSEndpoint: sessionRes.data.connectUrl,
          });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Login
    console.log('[Pearson] Logging in...');
    await loginToPearson(page, credentials);

    // Navigate to course
    console.log('[Pearson] Navigating to course...');
    await page.goto(`${PEARSON_BASE}/courses/14413600/menu`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Scrape assignments
    console.log('[Pearson] Scraping assignments...');
    const assignments = await scrapeAssignments(page);

    await browser.close();
    console.log('[Pearson] Scrape complete.');

    return {
      assignments,
      lastSync: new Date().toISOString(),
    };

  } catch (error) {
    console.error('[Pearson] Error:', error.message);
    if (browser) await browser.close();
    throw error;
  }
}

async function loginToPearson(page, credentials) {
  await page.goto(`${PEARSON_BASE}/courses`, {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });

  // Check if already logged in
  const loggedIn = await page.$('[class*="user-menu"]');
  if (loggedIn) {
    console.log('[Pearson] Already logged in.');
    return;
  }

  // Fill login form
  try {
    await page.type('input[name="username"]', credentials.username);
    await page.type('input[name="password"]', credentials.password);
    await page.click('button[type="submit"]');

    // Wait for redirect
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    console.log('[Pearson] Login successful.');
  } catch (err) {
    console.error('[Pearson] Login error:', err.message);
    throw err;
  }
}

async function scrapeAssignments(page) {
  try {
    // Click on "Chapter Assignments" or "Assignments"
    await page.click('a:has-text("Chapter Assignments")').catch(() => null);
    await page.waitForTimeout(2000);

    const assignments = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const data = [];

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const dueDateCell = cells[0]?.innerText || '';
          const nameCell = cells[1]?.innerText || '';
          const attemptsCell = cells[3]?.innerText || '';

          if (nameCell) {
            data.push({
              name: nameCell.trim(),
              dueDate: dueDateCell.trim(),
              attempts: attemptsCell.trim(),
              link: row.querySelector('a')?.href || null,
            });
          }
        }
      });

      return data;
    });

    return assignments;
  } catch (error) {
    console.error('[Pearson] Assignment scrape error:', error.message);
    return [];
  }
}
