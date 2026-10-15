import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {catalogManifest,verifyPwaBuild} from '../scripts/pwa-build.mjs';
const base=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));

test('PWA uses actual business identity and a stable installation scope without adding private configuration',()=>{
  const manifest=catalogManifest(base,{name:'Tienda café 🪴',description:'Descripción real',whatsappNumber:'private',apiKey:'private'});
  assert.equal(manifest.name,'Tienda café 🪴');assert.equal(manifest.description,'Descripción real');
  assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.id,'/');
  assert.equal(manifest.display,'standalone');assert.equal(manifest.apiKey,undefined);assert.equal(manifest.whatsappNumber,undefined);
  assert.throws(()=>catalogManifest(base,{name:'',description:''}));
});
test('PWA artifact verification rejects stale manifest hashes, missing icons and offline price/HTML caches',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'lumio-pwa-test-'));
  try {
    await mkdir(join(directory,'icons'));
    for(const size of [192,512])await copyFile(new URL(`../public/icons/icon-${size}.png`,import.meta.url),join(directory,`icons/icon-${size}.png`));
    const assets=['/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png','/icons/splash-logo.png','/splash.css','/splash-init.js'];
    for(const path of assets)await copyFile(new URL('../public'+path,import.meta.url),join(directory,path.slice(1)));
    const catalog={name:'Tienda de prueba',description:''};const manifest=JSON.stringify(catalogManifest(base,catalog));
    await writeFile(join(directory,'manifest.webmanifest'),manifest);
    const config={index:'/index.csr.html',navigationRequestStrategy:'freshness',dataGroups:[],hashTable:{'/index.csr.html':'fixture','/manifest.webmanifest':createHash('sha1').update(manifest).digest('hex')}};
    for(const path of assets)config.hashTable[path]=createHash('sha1').update(await readFile(join(directory,path.slice(1)))).digest('hex');
    const save=async value=>writeFile(join(directory,'ngsw.json'),JSON.stringify(value));
    await save(config);await verifyPwaBuild(directory,catalog);
    for(const invalid of [{...config,navigationRequestStrategy:'performance'},{...config,dataGroups:[{urls:['/graphql']}]},{...config,hashTable:{...config.hashTable,'/catalogo/producto/index.html':'fixture'}},{...config,hashTable:{...config.hashTable,'/graphql':'fixture'}},{...config,hashTable:{...config.hashTable,'/manifest.webmanifest':'stale'}}]){
      await save(invalid);await assert.rejects(()=>verifyPwaBuild(directory,catalog));
    }
    await save(config);await writeFile(join(directory,'icons/icon-192.png'),'invalid');await assert.rejects(()=>verifyPwaBuild(directory,catalog));
  }finally{assert.ok(resolve(directory).startsWith(join(resolve(tmpdir()),'lumio-pwa-test-')));await rm(directory,{recursive:true,force:true});}
});
