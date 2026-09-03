/**
 * eCampus Scraper
 * Logs in, pulls grades and dropbox items from all three courses
 * Courses: EMT (333167), Speech (334751), Clinical (335403)
 *
 * NOTE: Grades table column layout varies per course (some include a
 * "Weight Achieved" column, some don't), so column mapping is built
 * dynamically from each course's actual header row rather than assumed.
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
puppeteer.use(StealthPlugin());

const COURSES = {
    emt: '333167',
    spch: '334751',
    clin: '335403',
};

const BASE_URL = 'https://ecampusd2l.blinn.edu';

export async function scrapECampus(credentials) {
    let browser;
    try {
          console.log('[eCampus] Starting scrape...');

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

      console.log('[eCampus] Logging in...');
          await loginToECampus(page, credentials);

      const ecampusData = {
              courses: {},
              lastSync: new Date().toISOString(),
      };

      for (const [name, ouId] of Object.entries(COURSES)) {
              console.log(`[eCampus] Scraping ${name} (OU ${ouId})...`);
              ecampusData.courses[name] = await scrapeCourse(page, ouId, name);
      }

      await browser.close();
          console.log('[eCampus] Scrape complete.');
          return ecampusData;

    } catch (error) {
          console.error('[eCampus] Error:', error.message);
          if (browser) await browser.close();
          throw error;
    }
}

async function loginToECampus(page, credentials) {
    await page.goto(`${BASE_URL}/d2l/home`, { waitUntil: 'networkidle2', timeout: 30000 });

  const isLoggedIn = await page.$('.d2l-navigation') !== null;
    if (isLoggedIn) {
          console.log('[eCampus] Already logged in.');
          return;
    }

  await page.type('input[name="usernameUserInput"]', credentials.username);
    await page.type('input[name="password"]', credentials.appPassword);
    await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          page.click('button[type="submit"]'),
        ]);
    console.log('[eCampus] Login successful (URL:', page.url(), ')');
}

async function scrapeCourse(page, ouId, courseName) {
    const courseData = {
          name: courseName,
          ouId,
          grades: [],
          dropboxItems: [],
    };

  console.log(`[eCampus/${courseName}] Fetching grades...`);
    try {
          const gradesUrl = `${BASE_URL}/d2l/lms/grades/my_grades/main.d2l?ou=${ouId}`;
          await page.goto(gradesUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      const result = await page.evaluate(() => {
              const tables = Array.from(document.querySelectorAll('table'));
              const gradeTable = tables.find(t => t.className.includes('d_gl'));
              if (!gradeTable) return { items: [] };

                                               const trs = Array.from(gradeTable.querySelectorAll('tbody tr'));
              if (trs.length === 0) return { items: [] };

                                               const headerCells = Array.from(trs[0].querySelectorAll('td, th')).map(c => c.innerText.trim());
              const colIndex = {};
              headerCells.forEach((label, i) => {
                        const key = label.toLowerCase();
                        if (key.includes('grade item')) colIndex.name = i;
                        else if (key.includes('points')) colIndex.points = i;
                        else if (key.includes('weight')) colIndex.weight = i;
                        else if (key === 'grade') colIndex.grade = i;
              });

                                               const items = [];
              for (let i = 1; i < trs.length; i++) {
                        const cells = Array.from(trs[i].querySelectorAll('td, th')).map(c => c.innerText.trim().replace(/\s+/g, ' '));
                        if (cells.length === 0) continue;

                const isSubItem = cells[0] === '' && cells.length > headerCells.length;
                        const nameIdx = isSubItem ? 1 : 0;
                        const offset = isSubItem ? 1 : 0;

                const name = cells[nameIdx];
                        if (!name) continue;

                const points = colIndex.points !== undefined ? cells[colIndex.points + offset] : null;
                        const weight = colIndex.weight !== undefined ? cells[colIndex.weight + offset] : null;
                        const grade = colIndex.grade !== undefined ? cells[colIndex.grade + offset] : null;

                items.push({
                            name,
                            isCategory: !isSubItem,
                            points: points || null,
                            weight: weight || null,
                            grade: grade || null,
                });
              }

                                               return { items };
      });

      courseData.grades = result.items;
    } catch (err) {
          console.error(`[eCampus/${courseName}] Grade scrape failed:`, err.message);
    }

  console.log(`[eCampus/${courseName}] Fetching dropbox items...`);
    try {
          const dropboxUrl = `${BASE_URL}/d2l/lms/dropbox/user/folders_list.d2l?ou=${ouId}`;
          await page.goto(dropboxUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      const items = await page.evaluate(() => {
              const miniTables = Array.from(document.querySelectorAll('table.dcs'));
              const names = [];
              miniTables.forEach(t => {
                        const rows = Array.from(t.querySelectorAll('tbody tr, tr'));
                        rows.forEach(row => {
                                    const cell = row.querySelector('td, th');
                                    if (cell) {
                                                  const text = cell.innerText.trim();
                                                  if (text && !names.includes(text)) names.push(text);
                                    }
                        });
              });
              return names;
      });

      courseData.dropboxItems = items;
    } catch (err) {
          console.error(`[eCampus/${courseName}] Dropbox scrape failed:`, err.message);
    }

  return courseData;
}
