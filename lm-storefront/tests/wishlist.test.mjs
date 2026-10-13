import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WishlistSession,decodeFavorites,encodeFavorites,favoriteKey} from '../src/app/features/wishlist/wishlist-model.ts';
import {validateFavoriteResponse} from '../src/app/features/wishlist/wishlist-response.ts';
const a='catalog-'+'a'.repeat(64), b='catalog-'+'b'.repeat(64);
function storage() { const data=new Map(); return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),data}; }

test('favorites use stable product IDs, avoid duplicates and keep catalogs separate',()=>{
  const disk=storage(), first=new WishlistSession(a), second=new WishlistSession(b);
  first.load(disk);first.set('item-1',true,disk);first.set('item-1',true,disk);
  assert.deepEqual(first.ids,['item-1']);
  second.load(disk);assert.deepEqual(second.ids,[]);second.set('item-2',true,disk);
  assert.deepEqual(decodeFavorites(disk.getItem(favoriteKey(a)),a),['item-1']);
  assert.deepEqual(decodeFavorites(disk.getItem(favoriteKey(b)),b),['item-2']);
  assert.ok(!disk.getItem(favoriteKey(a)).includes('slug'));
  const reload=new WishlistSession(a);reload.load(disk);assert.deepEqual(reload.ids,['item-1']);
  reload.set('item-1',false,disk);assert.deepEqual(reload.ids,[]);
});
test('rejects corrupt, cross-catalog, unsupported, duplicated and oversized persistence without overwriting it',()=>{
  const malformed=['{',JSON.stringify([]),JSON.stringify({version:2,catalogId:a,ids:[]}),encodeFavorites(b,['x']),
    JSON.stringify({version:1,catalogId:a,ids:['x','x']}),JSON.stringify({version:1,catalogId:a,ids:['/bad']}),
    JSON.stringify({version:1,catalogId:a,ids:Array.from({length:101},(_,i)=>'i-'+i)}),'x'.repeat(25001)];
  for(const raw of malformed){
    const disk=storage();disk.setItem(favoriteKey(a),raw);
    const session=new WishlistSession(a);session.load(disk);
    assert.deepEqual(session.ids,[]);assert.ok(session.warning);assert.equal(disk.getItem(favoriteKey(a)),raw);
    session.set('kept',true,disk);assert.equal(session.accept(raw),false);assert.deepEqual(session.ids,['kept']);
  }
});
test('blocked storage preserves in-memory edits and merges pending changes when storage recovers',()=>{
  const disk=storage();disk.setItem(favoriteKey(a),encodeFavorites(a,['original']));
  const session=new WishlistSession(a);session.load(disk);
  const blocked={getItem:disk.getItem,setItem:()=>{throw new Error('Quota blocked');}};
  session.set('new',true,blocked);session.set('original',false,blocked);
  assert.deepEqual(session.ids,['new']);assert.ok(session.warning);
  session.accept(encodeFavorites(a,['original','other-tab']));assert.deepEqual(session.ids,['other-tab','new']);
  disk.setItem(favoriteKey(a),encodeFavorites(a,['original','other-tab']));
  session.set('last',true,disk);assert.deepEqual(session.ids,['other-tab','new','last']);assert.equal(session.warning,'');
  const noStorage=new WishlistSession(b);noStorage.load(null);noStorage.set('local',true,null);assert.deepEqual(noStorage.ids,['local']);
});
test('storage events synchronize additions, removals and clearing; corrupted events keep the last valid state',()=>{
  const disk=storage(), first=new WishlistSession(a), second=new WishlistSession(a);
  first.load(disk);second.load(disk);first.set('x',true,disk);second.accept(disk.getItem(first.key));
  assert.deepEqual(second.ids,['x']);second.set('y',true,disk);first.accept(disk.getItem(first.key));assert.deepEqual(first.ids,['x','y']);
  second.set('x',false,disk);first.accept(disk.getItem(first.key));assert.deepEqual(first.ids,['y']);
  assert.equal(first.accept('{'),false);assert.deepEqual(first.ids,['y']);first.accept(null);assert.deepEqual(first.ids,[]);
});
test('mutations merge the latest other-tab selection and enforce a visible 100-item limit',()=>{
  const disk=storage(), first=new WishlistSession(a), stale=new WishlistSession(a);
  first.load(disk);stale.load(disk);first.set('one',true,disk);stale.set('two',true,disk);
  assert.deepEqual(stale.ids,['one','two']);
  disk.setItem(first.key,encodeFavorites(a,Array.from({length:100},(_,i)=>'item-'+i)));first.load(disk);
  assert.equal(first.set('overflow',true,disk),false);assert.equal(first.ids.length,100);
  assert.equal(first.set('item-0',false,disk),true);assert.equal(first.ids.length,99);
});
test('batch responses distinguish explicit missing items from incomplete/error responses and retain current data',()=>{
  const ids=['x','y'];const product={id:'x',slug:'new-slug',name:'Current name',available:false,variants:[{priceMinor:1700}]};
  const result=validateFavoriteResponse({catalog:{id:a},itemsByIds:[{id:'y',item:null},{id:'x',item:product}]},a,ids);
  assert.deepEqual(result.itemsByIds.map(row=>row.id),ids);assert.equal(result.itemsByIds[0].item,product);assert.equal(result.itemsByIds[1].item,null);
  for(const invalid of [undefined,{catalog:{id:b},itemsByIds:result.itemsByIds},{catalog:{id:a},itemsByIds:[]},
    {catalog:{id:a},itemsByIds:[{id:'x',item:product},{id:'x',item:product}]},{catalog:{id:a},itemsByIds:[{id:'x',item:undefined},{id:'y',item:null}]}]){
    assert.throws(()=>validateFavoriteResponse(invalid,a,ids));
  }
  const session=new WishlistSession(a);session.set('x',true,null);
  assert.throws(()=>validateFavoriteResponse(undefined,a,['x']));assert.deepEqual(session.ids,['x']);
});
