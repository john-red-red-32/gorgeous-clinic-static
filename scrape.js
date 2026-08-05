const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITEMAP_INDEX = 'https://thegorgeousclinic.co.uk/sitemap.xml';
const APP_URL = 'https://app.thegorgeousclinic.co.uk/';   // where Bubble's actual assets live
const ROOT_URL = 'https://thegorgeousclinic.co.uk/';       // the real, public, crawlable domain
const TEST_MODE = true;

// Pages that exist and are meant to be browsed without a specific data
// entry (e.g. the full gallery/video listing) never appear in Bubble's
// sitemap, since they're not tied to a database "Thing". Add them here
// by hand so they still get scraped alongside everything else.
const EXTRA_URLS = [
  `${ROOT_URL}gallery`,
  `${ROOT_URL}videos`,
  `${ROOT_URL}treatments`,
];

async function getUrlsFromSitemap(url) {
  const res = await fetch(url);
  const xml = await res.text();
  console.log(`  Status ${res.status} for ${url} — response starts with: ${xml.slice(0, 150).replace(/\n/g, ' ')}`);
  const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  return matches;
}

async function getAllPageUrls() {
  if (TEST_MODE) {
    return [APP_URL];
  }
  const topLevel = await getUrlsFromSitemap(SITEMAP_INDEX);
  let allUrls = [];
  for (const entry of topLevel) {
    if (entry.endsWith('.xml')) {
      console.log('Reading child sitemap:', entry);
      const childUrls = await getUrlsFromSitemap(entry);
      allUrls = allUrls.concat(childUrls);
    } else {
      allUrls.push(entry);
    }
  }
  allUrls = allUrls.concat(EXTRA_URLS);
  return [...new Set(allUrls)];
}

function cleanHtml(html) {
  // 1. Bots never run JS — every script is dead weight, strip it all.
  let cleaned = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  // 2. Rewrite every absolute reference to the app subdomain back to the
  //    real, public root domain — fixes canonical tags, og:url,
  //    twitter:*, JSON-LD schema URL, and internal nav/page links.
  cleaned = cleaned.split(APP_URL).join(ROOT_URL);

  // 3. Icons use a relative /static/ path that only resolves correctly
  //    against Bubble's actual app domain.
  cleaned = cleaned.replace(/href="\/static\//g, `href="${APP_URL}static/`);

  // 4. Remaining relative links resolve against the crawlable root domain.
  cleaned = cleaned.replace('<head>', `<head><base href="${ROOT_URL}">`);

  return cleaned;
}

async function run() {
  const urls = await getAllPageUrls();
  console.log(`Found ${urls.length} pages to scrape.`);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  let count = 0;
  for (const url of urls) {
    count++;
    console.log(`[${count}/${urls.length}] Fetching:`, url);
    try {
      // These pages are visited using their real, App-hosted equivalent
      // so Bubble's dynamic logic actually loads them, then saved under
      // the public root-domain path.
      const fetchUrl = url.startsWith(ROOT_URL) ? url.replace(ROOT_URL, APP_URL) : url;

      await page.goto(fetchUrl, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(5000);

      const rawHtml = await page.content();
      const html = cleanHtml(rawHtml);

      const publicUrl = url.startsWith(APP_URL) ? url.replace(APP_URL, ROOT_URL) : url;
      const urlPath = new URL(publicUrl).pathname;
      const outPath = urlPath === '/' ? 'output/index.html' : `output${urlPath}/index.html`;

      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html);
    } catch (err) {
      console.log(`  Failed: ${url} — ${err.message}`);
    }
  }

  await browser.close();
  console.log('Done.');
}

run();
