const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITEMAP_INDEX = 'https://thegorgeousclinic.co.uk/sitemap.xml';
const BASE_URL = 'https://thegorgeousclinic.co.uk/';
const TEST_MODE = true;

async function getUrlsFromSitemap(url) {
  const res = await fetch(url);
  const xml = await res.text();
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
  // Walk through each <script>...</script> block ONE AT A TIME, and only
  // remove that specific block if it's a Bubble boot/data script.
  // Everything else (fonts, CSS, images, AOS, other scripts) is untouched.
  const cleaned = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
    const isPackageScript = /src="[^"]*\/package\/[^"]*"/i.test(block);
    const isBubbleBootScript = /(window\.bubble_|window\.appquery|window\.Lib\b|api\/1\.1\/init\/data)/.test(block);
    return (isPackageScript || isBubbleBootScript) ? '' : block;
  });

  return cleaned.replace('<head>', `<head><base href="${BASE_URL}">`);
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
