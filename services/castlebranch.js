/**
 * CastleBranch Scraper
 * Extracts vaccine completion status and missing requirements
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';

puppeteer.use(StealthPlugin());

const CASTLEBRANCH_BASE = 'https://castlebranch.com';

export async function scrapCastleBranch(credentials) {
  let browser;
  try {
    console.log('[CastleBranch] Starting scrape...');
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
    console.log('[CastleBranch] Logging in...');
    await loginToCastleBranch(page, credentials);

    // Scrape vaccine status
    console.log('[CastleBranch] Scraping vaccine status...');
    const vaccines = await scrapeVaccineStatus(page);

    await browser.close();
    console.log('[CastleBranch] Scrape complete.');

    return {
      vaccines,
      lastSync: new Date().toISOString(),
    };

  } catch (error) {
    console.error('[CastleBranch] Error:', error.message);
    if (browser) await browser.close();
    throw error;
  }
}

async function loginToCastleBranch(page, credentials) {
    await page.goto('https://login.castlebranch.com/login', {
      waitUntil: 'networkidle2',
    timeout: 30000,
  });

  // Fill login form
  try {
      await page.type('input[name="username"]', credentials.username);
          await page.type('input[name="password"]', credentials.password);
    await page.click('button:has-text("Login"), input[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    console.log('[CastleBranch] Login successful.');
  } catch (err) {
    console.error('[CastleBranch] Login error:', err.message);
    throw err;
  }
}

async function scrapeVaccineStatus(page) {
  try {
    // Navigate to background check/vaccine status page
    await page.goto(`${CASTLEBRANCH_BASE}/online/applicant-home.aspx`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    const vaccines = await page.evaluate(() => {
      const data = {
        completed: [],
        pending: [],
        missing: [],
      };

      // Look for vaccine/requirement tables
      const tables = document.querySelectorAll('table');
      
      tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const name = cells[0]?.innerText?.trim() || '';
            const status = cells[1]?.innerText?.trim() || '';

            if (name.toLowerCase().includes('vaccine') || 
                name.toLowerCase().includes('hep') ||
                name.toLowerCase().includes('tb') ||
                name.toLowerCase().includes('meningitis') ||
                name.toLowerCase().includes('flu')) {
              
              if (status.toLowerCase().includes('complete') || status.toLowerCase().includes('passed')) {
                data.completed.push({ name, status, date: cells[2]?.innerText?.trim() });
              } else if (status.toLowerCase().includes('pending') || status.toLowerCase().includes('in progress')) {
                data.pending.push({ name, status });
              } else {
                data.missing.push({ name, status });
              }
            }
          }
        });
      });

      return data;
    });

    return vaccines;
  } catch (error) {
    console.error('[CastleBranch] Vaccine scrape error:', error.message);
    return { completed: [], pending: [], missing: [] };
  }
}

/**
 * Generate links to schedule missing vaccines
 */
export function generateVaccineLinks(missingVaccines) {
  const links = {
    'Hepatitis B Titer': 'https://www.google.com/search?q=hepatitis+b+titer+blood+test+near+me',
    'TB Test': 'https://www.google.com/search?q=tb+test+near+me',
    'Meningitis Booster': 'https://www.google.com/search?q=meningitis+vaccine+near+me',
    'Flu Shot': 'https://www.walgreens.com/topic/pharmacy/vaccines-immunizations.jsp',
  };

  return missingVaccines.map(vaccine => ({
    name: vaccine.name,
    status: vaccine.status,
    scheduleLink: links[vaccine.name] || 'https://www.cvs.com/pharmacy/immunizations',
    provider: 'Local Healthcare Provider',
  }));
}
