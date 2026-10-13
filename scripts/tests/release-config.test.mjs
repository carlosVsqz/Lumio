import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseConfiguration, publicBuildEnvironment} from '../release-config.mjs';
import {waitForCatalog, verifyPublicArtifact} from '../dokploy-prerender.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
function fixture(){return {
 PUBLIC_SITE_URL:'https://lumio-catalog.escod.com.gt',LUMIO_CATALOG_ID:'lumio-escod-production',
 ODOO_BUILD_URL:'https://lumio-odoo.escod.com.gt',ODOO_DATABASE:'lumio_production',
 ODOO_API_KEY:'synthetic-test-key',ODOO_WEBSITE_ID:'1',ODOO_PRICELIST_ID:'3',ODOO_WAREHOUSE_ID:'2',
 ODOO_DB_PASSWORD:'synthetic-db-password',ODOO_MASTER_PASSWORD:'synthetic-master-password',ODOO_ADMIN_PASSWORD:'synthetic-admin-password',POSTGRES_ADMIN_PASSWORD:'synthetic-pg-password',
};}
test('Dokploy build configuration needs no registry/image variables and uses the correct Odoo origin',()=>{
 const env=fixture(),config=releaseConfiguration(env);assert.equal(config.publicUrl,env.PUBLIC_SITE_URL);assert.equal(config.coreEnvironment.ODOO_URL,env.ODOO_BUILD_URL);assert.equal(config.coreEnvironment.ODOO_API_KEY,env.ODOO_API_KEY);
 for(const key of ['ODOO_DB_PASSWORD','ODOO_MASTER_PASSWORD','ODOO_ADMIN_PASSWORD','POSTGRES_ADMIN_PASSWORD'])assert.ok(!(key in config.coreEnvironment));
});
test('rejects local demo, missing API access and invalid IDs before compiling the storefront',()=>{
 for(const patch of [{ODOO_DATABASE:'lumio_demo'},{ODOO_API_KEY:''},{ODOO_WEBSITE_ID:'0'},{ODOO_PRICELIST_ID:'bad'},{ODOO_WAREHOUSE_ID:'2147483648'},{LUMIO_CATALOG_ID:''},{ODOO_BUSINESS_DESCRIPTION:'two\nlines'}])assert.throws(()=>releaseConfiguration({...fixture(),...patch}));
});
test('rejects non-HTTPS public origins and URL credentials',()=>{
 for(const patch of [{PUBLIC_SITE_URL:'http://example.org'},{PUBLIC_SITE_URL:'https://example.org/shop'},{ODOO_BUILD_URL:'https://user:secret@example.org'},{ODOO_BUILD_URL:'http://example.org'}])assert.throws(()=>releaseConfiguration({...fixture(),...patch}));
 assert.equal(releaseConfiguration({...fixture(),ODOO_BUILD_URL:'http://odoo:8069'}).coreEnvironment.ODOO_URL,'http://odoo:8069');
});
test('initial Odoo phase does not require an API key or catalog IDs',()=>{assert.deepEqual(releaseConfiguration({ODOO_DATABASE:'lumio_production'},{odooOnly:true}),{database:'lumio_production'});});
test('Angular receives public URLs and process environment, never Odoo/DB credentials',()=>{
 const env=publicBuildEnvironment({...fixture(),PATH:'/bin',SYSTEMROOT:'C:/Windows'},'http://127.0.0.1:8080/graphql',fixture().PUBLIC_SITE_URL);
 assert.equal(env.PATH,'/bin');assert.equal(env.SYSTEMROOT,'C:/Windows');assert.ok(!JSON.stringify(env).includes('synthetic-'));
 assert.ok(!Object.keys(env).some(key=>/^(ODOO_|POSTGRES_|LUMIO_)/.test(key)));
});
test('API readiness verifies the real catalog and allows a genuinely empty catalog',async()=>{
 let calls=0;await waitForCatalog('http://127.0.0.1:8080',()=>false,{fetcher:async()=>++calls===1?{ok:true}:{ok:true,json:async()=>({data:{catalog:{name:'Lumio'},items:[]}})}});assert.equal(calls,2);
});
test('GraphQL errors fail immediately without exposing upstream error contents or secrets',async()=>{
 let calls=0;await assert.rejects(waitForCatalog('http://127.0.0.1:8080',()=>false,{fetcher:async()=>++calls===1?{ok:true}:{ok:true,json:async()=>({errors:[{message:'synthetic-private-upstream-value'}]})}}),error=>error.message.includes('Odoo no entregó')&&!error.message.includes('synthetic-private'));assert.equal(calls,2);
});
test('a terminated Java process fails the build instead of waiting for a fallback',async()=>{await assert.rejects(waitForCatalog('http://127.0.0.1:8080',()=>true),/no pudo iniciar/);});
test('public artifact verification rejects a leaked API key without printing its value',async()=>{
 const path=await mkdtemp(join(tmpdir(),'lumio-artifact-test-'));
 try{await writeFile(join(path,'index.html'),'<h1>Lumio</h1>');await verifyPublicArtifact(path,'synthetic-private-key');await writeFile(join(path,'main.js'),'synthetic-private-key');await assert.rejects(verifyPublicArtifact(path,'synthetic-private-key'),error=>error.message.includes('credencial')&&!error.message.includes('synthetic-private-key'));}
 finally{await rm(path,{recursive:true,force:true});}
});
