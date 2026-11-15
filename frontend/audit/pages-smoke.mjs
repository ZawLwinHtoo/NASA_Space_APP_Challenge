import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const base='/NASA_Space_APP_Challenge/';
const root=resolve('dist');
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(!path.startsWith(base)){res.writeHead(404).end();return;}
  const file=resolve(root,path.slice(base.length)||'index.html');
  if(!file.startsWith(root)){res.writeHead(403).end();return;}
  try{
    const data=await readFile(file);
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(5189,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const page=await browser.newPage({viewport});
    const errors=[],localApi=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(/127\.0\.0\.1:8000|\/api\/v1|\/mednav-voice\//.test(request.url()))localApi.push(request.url());});
    await page.goto('http://127.0.0.1:5189'+base);
    await page.getByText('Public synthetic demo.',{exact:false}).waitFor();
    await page.getByTestId('backend-status').filter({hasText:'LOCAL FIXTURE MODE'}).waitFor();
    async function nav(name){
      if(viewport.width<600)await page.getByRole('button',{name:'Toggle navigation'}).click();
      await page.getByRole('button',{name,exact:true}).first().click();
    }
    await nav('Health Check-In');
    await page.getByText('Review',{exact:false}).first().waitFor();
    await page.getByRole('button',{name:'Review Check-In',exact:false}).click();
    await page.getByRole('button',{name:'Save Check-In',exact:true}).click();
    await page.getByText('Updated synthetic demo',{exact:false}).waitFor();
    await nav('Incident Report');
    await page.getByText('Saved reports and PDF generation require',{exact:false}).waitFor();
    await nav('Investigation');
    await page.getByText('Backend Required for Investigation').waitFor();
    assert.deepEqual(errors,[]);assert.deepEqual(localApi,[]);
    console.log(`PASS ${viewport.width}px: dashboard, check-in, reports, investigation; no runtime errors or local API requests`);
    await page.close();
  }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
