const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITEMAP_INDEX = 'https://thegorgeousclinic.co.uk/sitemap.xml';
const BASE_URL = 'https://app.thegorgeousclinic.co.uk/';
const TEST_MODE = false;

async function getUrlsFromSitemap(url) {
  const res = await fetch(url);
  const xml = await res.text();
  console.log(`  Status ${res.status} for ${url} — response starts with: ${xml.slice(0, 150).replace(/\n/g, ' ')}`);
  const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  return matches;
}

async function getAllPageUrls() {
  if (TEST_MODE) {
    return [BASE_URL];
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
  return [...new Set(allUrls)];
}

function cleanHtml(html) {
  // This output is served ONLY to bots/crawlers now — real visitors go
  // through the Worker to the live Bubble app instead. Bots never run
  // JavaScript, so every script is dead weight. Strip all of them.
  let cleaned = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  // Fix relative paths for icons/images/CSS so they still resolve
  // correctly even though this file is hosted on a different domain.
  cleaned = cleaned.replace(/href="\/static\//g, `href="${BASE_URL}static/`);
  cleaned = cleaned.replace('<head>', `<head><base href="${BASE_URL}">`);

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
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(5000);

      const rawHtml = await page.content();
      const html = cleanHtml(rawHtml);

      const urlPath = new URL(url).pathname;
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
