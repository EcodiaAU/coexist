#!/usr/bin/env node
'use strict';
const fs=require('fs');
const puppeteer=require('/Users/ecodia/.code/ecodiaos/backend/node_modules/puppeteer-core');
// Cold-start-safe: shots land in a stable dir next to this script (not a
// session-specific scratchpad that a fresh chat won't own). Override with SHOTS_DIR.
const OUT=process.env.SHOTS_DIR||require('path').join(__dirname,'shots');
fs.mkdirSync(OUT,{recursive:true});
const MIR='/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror';
const APP=process.env.DEV_URL||'http://localhost:5173';
const SB_REF='tjutlbzekfouwsiaplbr';
const path=process.argv[2]||'/admin';
const name=process.argv[3]||'dev-admin';
const w=parseInt(process.argv[4]||'1440',10), h=parseInt(process.argv[5]||'900',10);
function rj(p){const o=JSON.parse(fs.readFileSync(p,'utf8'));return (o&&o.value&&typeof o.value==='object')?o.value:o;}
const admin=rj(`${MIR}/coexist.json`), sb=rj(`${MIR}/coexist_supabase.json`);
const ANON=sb.anon_key||sb.publishable_key, SBURL=sb.url||`https://${SB_REF}.supabase.co`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const r=await fetch(`${SBURL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:ANON,'Content-Type':'application/json'},body:JSON.stringify({email:admin.email,password:admin.password})});
  const t=await r.json(); if(!t.access_token){console.log('no token',r.status);process.exit(1);}
  const authVal=JSON.stringify({access_token:t.access_token,token_type:'bearer',expires_in:t.expires_in,expires_at:t.expires_at,refresh_token:t.refresh_token,user:t.user});
  const b=await puppeteer.connect({browserURL:'http://127.0.0.1:9222',defaultViewport:null});
  const page=await b.newPage();
  try{
    await page.setViewport({width:w,height:h,deviceScaleFactor:1.5});
    await page.goto(APP+'/',{waitUntil:'domcontentloaded',timeout:30000});
    await page.evaluate((k,v)=>localStorage.setItem(k,v),`sb-${SB_REF}-auth-token`,authVal);
    await page.goto(APP+path,{waitUntil:'networkidle2',timeout:35000}).catch(()=>{});
    const SETTLE=parseInt(process.env.SETTLE||'3500',10);
    await sleep(SETTLE); await page.evaluate(()=>window.scrollTo(0,0)); await sleep(300);
    await page.screenshot({path:`${OUT}/${name}.png`,fullPage:true});
    const info=await page.evaluate(()=>{const x=(document.body.innerText||'').trim();return{url:location.href,len:x.length,s:x.slice(0,120)};});
    console.log(`OK ${name} len=${info.len} url=${info.url} :: ${info.s.replace(/\n/g,' ')}`);
  }catch(e){console.log('ERR',e.message);}finally{await page.close().catch(()=>{});await b.disconnect();}
})();
