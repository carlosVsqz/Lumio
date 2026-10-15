import {test} from 'node:test';
import assert from 'node:assert/strict';
import {categoryTree,categoryLinks,categoryTrail} from '../src/app/core/category-navigation.ts';
const categories=[{id:'deep',name:'Lámparas de escritorio',parentId:'lamps'},{id:'furniture',name:'Muebles'},
  {id:'lamps',name:'Lámparas',parentId:'furniture'},{id:'chair',name:'Sillas',parentId:'furniture'},{id:'services',name:'Servicios'}];
test('mega menu groups actual parents without inferring relationships from names and preserves provider order',()=>{
  const tree=categoryTree(categories);
  assert.deepEqual(tree.map(branch=>branch.category.id),['furniture','services']);
  assert.deepEqual(tree[0].children.map(branch=>branch.category.id),['lamps','chair']);
  assert.deepEqual(categoryLinks(tree[0]).map(link=>[link.category.id,link.depth]),[['lamps',0],['deep',1],['chair',0]]);
  assert.deepEqual(categoryTrail(categories,'deep').map(category=>category.id),['furniture','lamps','deep']);
  assert.deepEqual(categoryTrail(categories,null),[]);
  assert.deepEqual(categoryTrail(categories,'missing'),[]);
});
test('flat catalogs and unavailable parents remain navigable without invented groups',()=>{
  const flat=[{id:'a',name:'A'},{id:'b',name:'A / B'},{id:'c',name:'C',parentId:'missing'}];
  assert.deepEqual(categoryTree(flat).map(branch=>branch.category),flat);
  assert.deepEqual(categoryTree([]),[]);
});
test('malformed cached hierarchies cannot loop or hide categories',()=>{
  const cycle=[{id:'a',name:'A',parentId:'b'},{id:'b',name:'B',parentId:'a'},{id:'c',name:'C',parentId:'a'}];
  assert.equal(categoryTree(cycle).length,3);
  assert.equal(categoryTrail(cycle,'a').length,2);
});
