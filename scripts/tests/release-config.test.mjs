import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseConfiguration,publicBuildEnvironment} from '../release-config.mjs';
import {waitForCatalog,verifyPublicArtifact,publishStatic} from '../dokploy-prerender.mjs';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
function fixture(){return{
 PUBLIC_SITE_URL:'https://lumio-catalog.escod.com.gt',ODOO_PUBLIC_URL:'https://lumio-odoo.escod.com.gt',
 LUMIO_CATALOG_ID:'lumio-escod-production',ODOO_DATABASE:'lumio_production',LUMIO_CURRENCY:'GTQ',
 ODOO_DB_PASSWORD:'synthetic-database-password-0001',ODOO_MASTER_PASSWORD:'synthetic-master-password-0002',
 ODOO_ADMIN_PASSWORD:'synthetic-admin-password-0003',POSTGRES_ADMIN_PASSWORD:'synthetic-postgres-password-0004',
};}
test('full Compose startup requires neither registry nor pre-existing API key/catalog IDs',()=>{const cfg=releaseConfiguration(fixture());assert.equal(cfg.database,'lumio_production');assert.equal(cfg.publicUrl,fixture().PUBLIC_SITE_URL);});
test('production configuration rejects demo, weak/duplicate secrets, invalid optional references and public URLs',()=>{
 for(const patch of [{ODOO_DATABASE:'lumio_demo'},{POSTGRES_ADMIN_PASSWORD:''},{ODOO_DB_PASSWORD:fixture().ODOO_MASTER_PASSWORD},{ODOO_WEBSITE_ID:'0'},{ODOO_PRICELIST_ID:'bad'},{ODOO_WAREHOUSE_ID:'2147483648'},{PUBLIC_SITE_URL:'http://example.org'},{ODOO_PUBLIC_URL:'https://user:secret@example.org'}])assert.throws(()=>releaseConfiguration({...fixture(),...patch}));
});
test('Angular environment never receives credentials or provider details',()=>{const env=publicBuildEnvironment({...fixture(),ODOO_API_KEY:'synthetic-api-secret',PATH:'/bin'},'http://lm-core:8080/graphql',fixture().PUBLIC_SITE_URL);assert.equal(env.PATH,'/bin');assert.ok(!JSON.stringify(env).includes('synthetic-'));assert.ok(!Object.keys(env).some(key=>/^(ODOO_|POSTGRES_|LUMIO_)/.test(key)));});
test('API readiness permits a genuine empty catalog',async()=>{let calls=0;await waitForCatalog('http://lm-core:8080',()=>false,{fetcher:async()=>++calls===1?{ok:true}:{ok:true,json:async()=>({data:{catalog:{name:'Lumio'},items:[]}})}});assert.equal(calls,2);});
test('readiness waits through a backend restart and never exposes upstream secrets',async()=>{
 let query=0;await waitForCatalog('http://lm-core:8080',()=>false,{pauseMs:1,fetcher:async url=>url.endsWith('/health')?{ok:true}:{ok:true,json:async()=>++query===1?{errors:[{message:'synthetic-private'}]}:{data:{catalog:{name:'Lumio'},items:[]}}}});assert.equal(query,2);
 await assert.rejects(waitForCatalog('http://lm-core:8080',()=>false,{timeoutMs:5,pauseMs:1,fetcher:async url=>url.endsWith('/health')?{ok:true}:{ok:true,json:async()=>({errors:[{message:'synthetic-private'}]})}}),error=>error.message.includes('No se publican')&&!error.message.includes('synthetic-private'));
});
test('an unavailable backend fails without publishing',async()=>{await assert.rejects(waitForCatalog('http://lm-core:8080',()=>false,{timeoutMs:5,pauseMs:1,fetcher:async()=>{throw new Error('offline');}}),/No se publican/);});
test('a stopped backend fails promptly',async()=>{await assert.rejects(waitForCatalog('http://lm-core:8080',()=>true),/no pudo iniciar/);});
test('atomic publication preserves the current site on failure and replaces it only with a complete artifact',{skip:process.platform==='win32'?'Atomic rename runs in the Linux Docker runtime':false},async()=>{
 const root=await mkdtemp(join(tmpdir(),'lumio-publish-test-')),src=join(root,'source'),out=join(root,'static');
 try{await mkdir(src);await writeFile(join(src,'index.html'),'first');await publishStatic(src,out);assert.equal(await readFile(join(out,'current/index.html'),'utf8'),'first');
 await assert.rejects(publishStatic(join(root,'missing'),out));assert.equal(await readFile(join(out,'current/index.html'),'utf8'),'first');
 await writeFile(join(src,'index.html'),'second');await publishStatic(src,out);assert.equal(await readFile(join(out,'current/index.html'),'utf8'),'second');
 await verifyPublicArtifact(out,'synthetic-api-secret');await writeFile(join(src,'secret.js'),'synthetic-api-secret');await assert.rejects(verifyPublicArtifact(src,'synthetic-api-secret'),/credencial/);
 }finally{assert.ok(resolve(root).startsWith(resolve(tmpdir())));await rm(root,{recursive:true,force:true});}
});
