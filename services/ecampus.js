/**
 * eCampus Scraper
 * Logs in, pulls grades, submissions, and deadlines from all three courses
 * Courses: EMT (333167), Speech (334751), Clinical (335403)
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
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
    
          browser = await puppeteer.connect({
                  browserWSEndpoint: `wss://production-sfo.browserless.io?token=${process.env.BROWSERLESS_API_KEY}`,
          });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Login
    console.log('[eCampus] Logging in...');
    await loginToECampus(page, credentials);

    // Scrape each course
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

  // Check if already logged in
  const isLoggedIn = await page.$('.d2l-navigation') !== null;
  if (isLoggedIn) {
    console.log('[eCampus] Already logged in.');
    return;
  }

  // Fill login form
  await page.type('input[name="userName"]', credentials.username);
  await page.type('input[name="password"]', credentials.appPassword);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('[eCampus] Login successful.');
}

async function scrapeCourse(page, ouId, courseName) {
  const courseData = {
    name: courseName,
    ouId,
    grades: {},
    submissions: {},
    discussions: {},
    deadlines: [],
  };

  // Grades
  console.log(`[eCampus/${courseName}] Fetching grades...`);
  try {
    const gradesUrl = `${BASE_URL}/d2l/lms/grades/my_grades/main.d2l?ou=${ouId}`;
    await page.goto(gradesUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Extract grades table
    const grades = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const data = {};
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const itemName = cells[0].innerText.trim();
          const points = cells[1].innerText.trim();
          const grade = cells[2]?.innerText.trim() || '-';
          data[itemName] = { points, grade };
        }
      });
      return data;
    });
    courseData.grades = grades;
  } catch (err) {
    console.error(`[eCampus/${courseName}] Grade scrape failed:`, err.message);
  }

  // Submissions (Dropbox)
  console.log(`[eCampus/${courseName}] Fetching submissions...`);
  try {
    const dropboxUrl = `${BASE_URL}/d2l/lms/dropbox/user/folders_list.d2l?ou=${ouId}`;
    await page.goto(dropboxUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    const submissions = await page.evaluate(() => {
      const folders = document.querySelectorAll('table tbody tr');
      const data = {};
      folders.forEach(row => {
        const nameCell = row.querySelector('td:first-child');
        const statusCell = row.querySelector('td:nth-child(2)');
        if (nameCell && statusCell) {
          const name = nameCell.innerText.trim();
          const status = statusCell.innerText.trim();
          data[name] = status;
        }
      });
      return data;
    });
    courseData.submissions = submissions;
  } catch (err) {
    console.error(`[eCampus/${courseName}] Submission scrape failed:`, err.message);
  }

  // Discussions
  console.log(`[eCampus/${courseName}] Fetching discussions...`);
  try {
    const discussionUrl = `${BASE_URL}/d2l/le/content/${ouId}/Home`;
    await page.goto(discussionUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    const discussions = await page.evaluate(() => {
      const items = document.querySelectorAll('[class*="discussion"]');
      const data = {};
      items.forEach(item => {
        const title = item.innerText.split('\n')[0];
        const status = item.innerText.includes('Unread') ? 'Unread' : 'Read';
        if (title) data[title] = status;
      });
      return data;
    });
    courseData.discussions = discussions;
  } catch (err) {
    console.error(`[eCampus/${courseName}] Discussion scrape failed:`, err.message);
  }

  return courseData;
}
