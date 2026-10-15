import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterCategories} from '../src/app/core/category-navigation.ts';

const categories=[{id:'a',name:'Lámparas de escritorio'},{id:'b',name:'Office Desks'},{id:'c',name:'Sillas y sillones'},{id:'d',name:'Café & té'}];

test('category search matches names across accents, case and multiple words without changing identities or provider order',()=>{
  assert.deepEqual(filterCategories(categories,'  '),categories);
  assert.deepEqual(filterCategories(categories,'LAMPARAS escritorio'),[categories[0]]);
  assert.deepEqual(filterCategories(categories,'desk OFFICE'),[categories[1]]);
  assert.deepEqual(filterCategories(categories,'CAFÉ &'),[categories[3]]);
  assert.deepEqual(filterCategories(categories,'does not exist'),[]);
  assert.deepEqual(filterCategories([],''),[]);
  assert.deepEqual(filterCategories(categories,'.*'),[]);
});
