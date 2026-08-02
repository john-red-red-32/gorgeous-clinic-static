const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITEMAP_INDEX = 'https://thegorgeousclinic.co.uk/sitemap.xml';
const BASE_URL = 'https://thegorgeousclinic.co.uk/';

async function getUrlsFromSitemap(url) {
  const res = await fetch(url);
  const xml = await res.text();
  const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  return matches;
}

async function getAllPageUrls() {
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
  // Remove every script tag — none of them can run correctly once this
  // page is served from a different domain than Bubble's own.
  let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // Insert a <base> tag so every relative link/image/stylesheet path
  // (e.g. "/package/run_css/...") resolves back to the real Bubble site
  // instead of Cloudflare's domain. This restores fonts, CSS, and images
  // without needing any JavaScript to run.
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
