const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Start with a small, priority set of pages to prove this works.
// We'll expand this list once we've confirmed it's working correctly.
const urls = [
  'https://thegorgeousclinic.co.uk/',
  'https://thegorgeousclinic.co.uk/treatments/anti-wrinkle-injections',
];

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const url of urls) {
    console.log('Fetching:', url);
    await page.goto(url, { waitUntil: 'networkidle' });

    const html = await page.content();

    // Turn the URL into a safe filename/folder structure
    const urlPath = new URL(url).pathname;
    const outPath = urlPath === '/' ? 'output/index.html' : `output${urlPath}/index.html`;

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
    console.log('Saved:', outPath);
  }

  await browser.close();
}

run();
