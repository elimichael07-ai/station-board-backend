/**
 * Pearson MyLab Brady Scraper
 * Accessed via LTI launch from the eCampus EMT course. Reuses the
 * long-lived, already-authenticated eCampus session (same one
 * ecampus.js reuses) instead of logging in itself - if no active
 * session exists, throws a clear NEEDS_LOGIN error rather than
 * trying (and failing) to log in past Duo alone.
 */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getActiveEcampusConnectUrl } from '../utils/sessionManager.js';

puppeteer.use(StealthPlugin());

const ECAMPUS_BASE = 'https://ecampusd2l.blinn.edu';
const EMT_COURSE_ID = '333167';

export async function scrapPearson(credentials) {
          try {
                      console.log('[Pearson] Starting scrape...');

            const connectUrl = await getActiveEcampusConnectUrl();
                      const browser = await puppeteer.connect({ browserWSEndpoint: connectUrl });

            const pages = await browser.pages();
                      let page = pages.find(p => p.url().includes('ecampusd2l.blinn.edu'));
                      if (!page) page = await browser.newPage();
                      await page.setViewport({ width: 1280, height: 720 });

            console.log('[Pearson] Navigating to EMT course home...');
                      // Force a fresh navigation (not a no-op if already on this URL) so
            // the LTI widget's iframe reliably re-renders even on a revisit
            // after ecampus.js already scraped this same course.
            await page.goto('about:blank');
                      await page.goto(`${ECAMPUS_BASE}/d2l/home/${EMT_COURSE_ID}`, {
                                    waitUntil: 'networkidle2',
                                    timeout: 30000,
                      });

            const title = await page.title();
                      const isLoggedIn = title.toLowerCase().includes('emergency medical') || await page.$('.d2l-navigation') !== null;
                      if (!isLoggedIn) {
                                    const err = new Error('Stored session is no longer logged in. Call /api/ecampus-login-init to start a new one.');
                                    err.code = 'NEEDS_LOGIN';
                                    throw err;
                      }

            try {
                          await page.waitForSelector('d2l-lti-launch', { timeout: 30000 });
            } catch (e) {
                          const currentUrl = page.url();
                          const currentTitle = await page.title().catch(() => 'unknown');
                          throw new Error(`LTI widget not found. Current URL: ${currentUrl} | Title: ${currentTitle}`);
            }

            // Poll for up to ~15s for the LTI iframe to actually attach -
            // a single fixed wait was too short on a revisit of this page.
            let ltiFrame = null;
                      for (let i = 0; i < 15; i++) {
                                    ltiFrame = page.frames().find(f => f.url().includes('/d2l/le/lti/'));
                                    if (ltiFrame) break;
                                    await new Promise(r => setTimeout(r, 1000));
                      }
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

            await pearsonPage.close().catch(() => {});
                      console.log('[Pearson] Scrape complete.');

            return {
                          assignments,
                          lastSync: new Date().toISOString(),
            };
          } catch (error) {
                      console.error('[Pearson] Error:', error.message);
                      throw error;
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
