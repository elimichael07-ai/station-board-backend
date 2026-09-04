/**
     * eCampus Debug
 * Dumps the current state of the active (or pending) session's pages
          * for troubleshooting. Temporary diagnostic endpoint.
          *
          * Usage: GET /api/ecampus-debug?token=YOUR_SETUP_TOKEN
          *        GET /api/ecampus-debug?token=YOUR_SETUP_TOKEN&mode=pearson
          */

         import puppeteer from 'puppeteer-extra';
         import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Redis } from '@upstash/redis';

puppeteer.use(StealthPlugin());

const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
      res.setHeader('Content-Type', 'application/json');

  const token = req.query.token;
      if (token !== process.env.SETUP_TOKEN) {
              return res.status(401).json({ error: 'Unauthorized' });
      }

  try {
          const active = await redis.get('ecampus:active_session');
          const pending = await redis.get('ecampus:pending_session');

        const target = active || pending;
          if (!target) {
                    return res.status(200).json({ active, pending, pages: [] });
          }

        const browser = await puppeteer.connect({ browserWSEndpoint: target.connectUrl });

        if (req.query.mode === 'pearson') {
                  const pages = await browser.pages();
                  let page = pages.find(p => p.url().includes('ecampusd2l.blinn.edu'));
                  if (!page) page = await browser.newPage();

            await page.goto('about:blank');
                  await page.goto('https://ecampusd2l.blinn.edu/d2l/home/333167', { waitUntil: 'networkidle2', timeout: 30000 });

            const hasWidget = await page.evaluate(() => !!document.querySelector('d2l-lti-launch'));
                  const shadowInfo = await page.evaluate(() => {
                              const el = document.querySelector('d2l-lti-launch');
                              if (!el || !el.shadowRoot) return { hasShadow: false };
                              const iframe = el.shadowRoot.querySelector('iframe');
                              return {
                                            hasShadow: true,
                                            hasIframe: !!iframe,
                                            iframeSrcDomain: iframe ? (iframe.src ? iframe.src.split('/').slice(0,3).join('/') : null) : null,
                                            iframeSrcPathStart: iframe ? (iframe.src ? iframe.src.split('/').slice(3,6).join('/') : null) : null,
                              };
                  });

            await new Promise(r => setTimeout(r, 3000));

            const allFrameUrls = page.frames().map(f => {
                        const u = f.url();
                        return u.length > 80 ? u.slice(0, 80) + '...' : u;
            });

            return res.status(200).json({
                        hasWidget,
                        shadowInfo,
                        allFrameUrls,
                        pageTitle: await page.title(),
                        pageUrl: page.url(),
            });
        }

        const pages = await browser.pages();
          const pageInfo = [];
          for (const p of pages) {
                    let title = 'ERROR';
                    try { title = await p.title(); } catch (e) { title = 'title error: ' + e.message; }
                    pageInfo.push({ url: p.url(), title });
          }

        return res.status(200).json({
                  whichSession: active ? 'active' : 'pending',
                  pages: pageInfo,
        });
  } catch (error) {
          return res.status(500).json({ error: error.message });
  }
}
