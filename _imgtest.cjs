const { chromium } = require('playwright-core');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx=b.contexts()[0];
  let page=ctx.pages().find(p=>p.url().includes('4319/familiar/chat'))||await ctx.newPage();
  await page.goto('http://localhost:4319/familiar/chat',{waitUntil:'networkidle'}); await sleep(2000);
  const nc=await page.$('button[aria-label="New chat"]'); if(nc){await nc.click(); await sleep(1200);}
  const ta=await page.$('textarea'); await ta.click();
  await ta.fill('Use your browser tool to open https://example.com and take a screenshot.'); await sleep(150);
  await (await page.$('button:has-text("Send")')).click();
  let imgFound=false;
  for(let i=0;i<70;i++){await sleep(1500);
    imgFound=await page.evaluate(()=>{const imgs=[...document.querySelectorAll('.grid img, .ec-scroll img, section img')];return imgs.some(im=>im.src.includes('/api/familiar/bridge/file')&&im.naturalWidth>10);});
    if(imgFound)break;
  }
  await sleep(1000);
  await page.evaluate(()=>{const s=document.querySelector('.ec-scroll');if(s)s.scrollTo(0,s.scrollHeight);}); await sleep(400);
  await page.screenshot({path:'/private/tmp/claude-501/-Users-ecodia--code-ecodiaos-backend/2b398e3c-c694-4a5b-a46d-20875626a765/scratchpad/imgtest.png'});
  console.log(JSON.stringify({imageRenderedInline:imgFound}));
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
