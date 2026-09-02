/**
 * Pearson MyLab Brady Scraper
 * Accessed via LTI launch from the eCampus EMT course (not a standalone Pearson login).
 * Extracts homework, quizzes, and progress data.
 */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';

puppeteer.use(StealthPlugin());

const ECAMPUS_BASE = 'https://ecampusd2l.blinn.edu';
const EMT_COURSE_ID = '333167';

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

        console.log('[Pearson] Logging into eCampus...');
                await loginToECampus(page, credentials);
                    if (page.url().includes('ethos.blinn.edu') || page.url().includes('login.do')) {
                                throw new Error(`Login did not complete. Still on: ${page.url()}`);
                    }
                console.log('[Pearson] Login confirmed, URL:', page.url());
                  
        console.log('[Pearson] Navigating to EMT course home...');
                await page.goto(`${ECAMPUS_BASE}/d2l/home/${EMT_COURSE_ID}`, {
                            waitUntil: 'networkidle2',
                            timeout: 30000,
                });

                if (page.url().includes('ethos.blinn.edu') || page.url().includes('login.do')) {
                            console.log('[Pearson] Bounced back to login on course navigation, retrying login...');
                            await loginToECampus(page, credentials);
                            await page.goto(`${ECAMPUS_BASE}/d2l/home/${EMT_COURSE_ID}`, {
                                          waitUntil: 'networkidle2',
                                          timeout: 30000,
                            });
                            if (page.url().includes('ethos.blinn.edu') || page.url().includes('login.do')) {
                                          throw new Error(`Still on login after retry. URL: ${page.url()}`);
                            }
                }
            
                try {
                            await page.waitForSelector('d2l-lti-launch', { timeout: 30000 });
                } catch (e) {
                            const currentUrl = page.url();
                            const currentTitle = await page.title().catch(() => 'unknown');
                            throw new Error(`LTI widget not found. Current URL: ${currentUrl} | Title: ${currentTitle}`);
                }
            await new Promise(r => setTimeout(r, 2000));

        const ltiFrame = page.frames().find(f => f.url().includes('/d2l/le/lti/'));
              if (!ltiFrame) {
                        throw new Error('Could not find Pearson LTI launch frame on course home page');
              }

        const newTargetPromise = new Promise(resolve => {
                  browser.once('targetcreated', target => resolve(target));
        });
              await ltiFrame.click('a, button');
              const newTarget = await newTargetPromise;
              const pearsonPage = await newTarget.page();
              await pearsonPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

        console.log('[Pearson] Landed on Pearson dashboard, scraping assignments...');
              const assignments = await scrapeAssignments(pearsonPage);

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

async function loginToECampus(page, credentials) {
      await page.goto(`${ECAMPUS_BASE}/d2l/home`, { waitUntil: 'networkidle2', timeout: 30000 });

  const isLoggedIn = await page.$('.d2l-navigation') !== null;
      if (isLoggedIn) {
              console.log('[Pearson] Already logged into eCampus.');
              return;
      }

  try {
            await page.type('input[name="usernameUserInput"]', credentials.username);
            await page.type('input[name="password"]', credentials.password);
        
            await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
                        page.click('button[type="submit"]'),
                      ]);
        console.log('[Pearson] eCampus login successful.');
  } catch (err) {
          console.error('[Pearson] eCampus login error:', err.message);
          throw err;
  }
}

async function scrapeAssignments(page) {
      try {
              const assignments = await page.evaluate(() => {
                        const data = [];
                        const tables = document.querySelectorAll('table');

                                                            tables.forEach(table => {
                                                                        const rows = table.querySelectorAll('tbody tr');
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
                                                            });

                                                            return data;
              });

        return assignments;
      } catch (error) {
              console.error('[Pearson] Assignment scrape error:', error.message);
              return [];
      }
}
