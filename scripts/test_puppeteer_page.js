const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  console.log("Navigating with domcontentloaded...");
  await page.goto("https://www.chess.com/analysis/game/live/184653017586/review", { waitUntil: "domcontentloaded", timeout: 35000 });
  console.log("Waiting 6 seconds...");
  await new Promise(r => setTimeout(r, 6000));
  await page.screenshot({ path: "scripts/chesscom_page.png" });
  const info = await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      hasBoard: !!document.querySelector("wc-chess-board"),
      buttons: Array.from(document.querySelectorAll("button")).map(b => b.innerText.trim()).filter(Boolean),
      overviewRows: document.querySelectorAll('.game-overview-row').length,
      ratingWhite: document.querySelector('.review-rating-white span')?.innerText,
      reviewRatings: Array.from(document.querySelectorAll('[class*="rating"]')).map(el => ({ cls: el.className, text: el.innerText })),
      reviewTab: Array.from(document.querySelectorAll('[class*="review"]')).slice(0, 10).map(el => ({ cls: el.className, text: el.innerText.slice(0, 50) })),
      bodyTextSnippet: document.body.innerText.slice(0, 600)
    };
  });
  console.log("Page info:", JSON.stringify(info, null, 2));
  await browser.close();
})().catch(console.error);
