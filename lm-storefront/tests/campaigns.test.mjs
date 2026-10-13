import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCampaigns,campaignIndex,nextCampaignIndex,safeCampaignUrl} from '../src/app/features/campaigns/campaign-model.ts';

const first={id:'campaign-1',title:'Campaña publicada',message:'Contenido de Odoo',actionLabel:'Explorar',actionUrl:'/?category=ropa'};
const second={...first,id:'campaign-2'};

test('campaigns accept an empty feed and bounded typed content without duplicates',()=>{
  assert.deepEqual(validateCampaigns([]),[]);
  assert.deepEqual(validateCampaigns([first]),[first]);
  assert.throws(()=>validateCampaigns([first,first]));
  assert.throws(()=>validateCampaigns(Array.from({length:21},(_,i)=>({...first,id:`campaign-${i}`}))));
  for (const invalid of [null,{},[{...first,title:''}],[{...first,title:'x'.repeat(121)}],[{...first,message:'x'.repeat(501)}],[{...first,actionUrl:undefined}],[{...first,actionLabel:''}]]) assert.throws(()=>validateCampaigns(invalid));
});
test('campaign links reject credentials, script URLs and protocol-relative navigation',()=>{
  for (const url of ['/', '/catalogo/camiseta?ref=campaign#opciones','https://example.com/collection']) assert.equal(safeCampaignUrl(url),true);
  for (const url of ['//example.com','javascript:alert(1)','https://user:secret@example.com','/\\example.com','data:text/html,hello','http:///example.com','/new\nline']) assert.equal(safeCampaignUrl(url),false);
  assert.throws(()=>validateCampaigns([{...first,actionUrl:'javascript:alert(1)'}]));
});
test('manual carousel wraps safely and preserves the current campaign when the feed is reordered',()=>{
  assert.equal(nextCampaignIndex(0,-1,2),1);
  assert.equal(nextCampaignIndex(1,1,2),0);
  assert.equal(nextCampaignIndex(0,1,1),0);
  assert.equal(nextCampaignIndex(0,1,0),0);
  assert.equal(campaignIndex([first,second],second.id),1);
  assert.equal(campaignIndex([second,first],second.id),0);
  assert.equal(campaignIndex([first],second.id),0);
  assert.equal(campaignIndex([],null),0);
});
