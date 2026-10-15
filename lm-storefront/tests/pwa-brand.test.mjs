import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {runInNewContext} from 'node:vm';
import sharp from 'sharp';
import {brandLogoUrl,writeBrandAssets} from '../scripts/brand-assets.mjs';
import {INSTALL_SUGGESTION_KEY,INSTALL_SUGGESTION_COOLDOWN,suggestionDismissed,dismissInstallSuggestion} from '../src/app/features/pwa/install-suggestion.ts';

test('install suggestion remembers a dismissal for 30 days and rejects corrupt, future and unsupported data',()=>{
  const now=1_800_000_000_000;const disk=new Map();
  dismissInstallSuggestion({setItem:(key,value)=>disk.set(key,value)},now);
  assert.equal(suggestionDismissed(disk.get(INSTALL_SUGGESTION_KEY),now),true);
  assert.equal(suggestionDismissed(disk.get(INSTALL_SUGGESTION_KEY),now+INSTALL_SUGGESTION_COOLDOWN-1),true);
  assert.equal(suggestionDismissed(disk.get(INSTALL_SUGGESTION_KEY),now+INSTALL_SUGGESTION_COOLDOWN),false);
  for(const raw of [null,'{','[]','null','x'.repeat(201),JSON.stringify({version:2,dismissedAt:now}),JSON.stringify({version:1,dismissedAt:now+1}),JSON.stringify({version:1,dismissedAt:0}),JSON.stringify({version:1,dismissedAt:String(now)})])assert.equal(suggestionDismissed(raw,now),false);
  assert.doesNotThrow(()=>dismissInstallSuggestion(null,now));
  assert.doesNotThrow(()=>dismissInstallSuggestion({setItem:()=>{throw new Error('blocked');}},now));
});

test('brand asset generation uses the actual backend logo with correct sizes, safe padding and no deformation',async()=>{
  const logo='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#bc2035"/></svg>';
  const requests=[];
  const server=createServer((request,response)=>{
    requests.push(request.url);
    if(request.url==='/catalog-media/logo/test')response.writeHead(200,{'Content-Type':'image/svg+xml'}).end(logo);
    else if(request.url==='/broken')response.end('not an image');
    else if(request.url==='/large')response.writeHead(200,{'Content-Length':6*1024*1024}).end();
    else if(request.url==='/redirect')response.writeHead(302,{Location:'/catalog-media/logo/test'}).end();
    else response.writeHead(401).end();
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const api=`http://127.0.0.1:${server.address().port}/graphql`;
  const output=await mkdtemp(join(tmpdir(),'lumio-brand-test-'));
  try {
    const catalog={branding:{logoUrl:'/catalog-media/logo/test'}};
    await writeBrandAssets(output,catalog,api);
    assert.deepEqual(requests,['/catalog-media/logo/test']);
    for(const [name,size] of [['icon-192',192],['icon-512',512],['apple-touch-icon',180]]) {
      const image=sharp(await readFile(join(output,'icons',name+'.png')));
      const {data,info}=await image.raw().toBuffer({resolveWithObject:true});
      assert.equal(info.width,size);assert.equal(info.height,size);
      const pixel=(x,y)=>[...data.subarray((y*size+x)*info.channels,(y*size+x)*info.channels+3)];
      assert.deepEqual(pixel(Math.floor(size/2),Math.floor(size/2)),[188,32,53]);
      assert.deepEqual(pixel(0,0),[255,255,255]);
      // The wide logo retains its aspect ratio, instead of being stretched to a square.
      assert.deepEqual(pixel(Math.floor(size/2),Math.floor(size*.35)),[255,255,255]);
    }
    const splash=await sharp(join(output,'icons/splash-logo.png')).metadata();
    assert.equal(splash.width/splash.height,4);assert.equal(splash.format,'png');
    for(const path of ['/unauthorized','/broken','/large','/redirect'])await assert.rejects(()=>writeBrandAssets(output,{branding:{logoUrl:path}},api));
    await writeBrandAssets(output,{branding:{logoUrl:''}},api);
    assert.equal((await sharp(join(output,'icons/icon-192.png')).metadata()).width,192);
    assert.equal(brandLogoUrl('/catalog-media/logo/test',api).origin,new URL(api).origin);
    for(const value of ['file:///secret','data:image/png;base64,a','https://user:secret@example.test/logo'])assert.throws(()=>brandLogoUrl(value,api));
  }finally {
    server.closeAllConnections();await new Promise(done=>server.close(done));
    assert.ok(resolve(output).startsWith(join(resolve(tmpdir()),'lumio-brand-test-')));await rm(output,{recursive:true,force:true});
  }
});

test('splash exits on hydration, image failure, interaction or timeout, without relying on Angular/browser storage',async()=>{
  const source=await readFile(new URL('../public/splash-init.js',import.meta.url),'utf8');
  for(const event of ['lumio:ready','keydown','pointerdown','error','timeout']) {
    const listeners=new Map(),timers=new Map();const classes=new Set();let clock=0;
    const image={addEventListener:(type,listener)=>listeners.set(type,listener)};
    const splash={hidden:true,classList:{add:name=>classes.add(name)},querySelector:()=>image};
    const document={getElementById:()=>splash,addEventListener:(type,listener)=>listeners.set(type,listener),removeEventListener:type=>listeners.delete(type)};
    const window={setTimeout:(callback,delay)=>{timers.set(++clock,{callback,delay});return clock;}};
    runInNewContext(source,{document,window,clearTimeout:id=>timers.delete(id)});
    assert.equal(splash.hidden,false);assert.equal(timers.get(1).delay,3000);
    if(event==='timeout')timers.get(1).callback();else listeners.get(event)();
    assert.equal(classes.has('is-leaving'),true);
    assert.equal(listeners.has('lumio:ready'),false);
    assert.equal(timers.has(1),false);
    timers.get(2).callback();assert.equal(splash.hidden,true);
  }
});
