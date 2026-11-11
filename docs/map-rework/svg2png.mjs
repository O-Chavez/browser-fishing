// node svg2png.mjs in.svg out.png  (headless Chrome via the project's puppeteer-core)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire('/Users/oscarchavez/Documents/Code/Personal/agent-test-game/package.json');
const puppeteer = require('puppeteer-core');
const [,, inFile, outFile] = process.argv;
const svg = fs.readFileSync(inFile, 'utf8');
const w = +svg.match(/width="(\d+)"/)[1], h = +svg.match(/height="(\d+)"/)[1];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, deviceScaleFactor: 1.5 });
await page.goto('file://' + path.resolve(inFile));
await page.screenshot({ path: outFile });
await browser.close();
console.log('wrote', outFile, w, h);
