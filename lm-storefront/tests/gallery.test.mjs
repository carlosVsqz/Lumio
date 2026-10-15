import {test} from 'node:test';
import assert from 'node:assert/strict';
import {variantImages,uniqueImages,imageSize} from '../src/app/features/catalog/detail/gallery-model.ts';

test('gallery follows only the explicitly selected variant, preserving order and avoiding duplicate images',()=>{
  const steel={url:'/steel.jpg',alt:'Steel'},aluminium={url:'/aluminium.jpg',alt:'Aluminium'},detail={url:'/detail.jpg',alt:'Detail'};
  const first={id:'steel',images:[steel,detail,steel]},second={id:'aluminium',images:[aluminium]};
  const item={images:[steel,aluminium],variants:[first,second]};
  assert.deepEqual(variantImages(item,null),[steel,aluminium]);
  assert.deepEqual(variantImages(item,first),[steel,detail]);
  assert.deepEqual(variantImages(item,second),[aluminium]);
  assert.deepEqual(variantImages(item,{...second}),[]);
  assert.deepEqual(uniqueImages([steel,steel,aluminium]),[steel,aluminium]);
});
test('an explicitly imageless variant never inherits photos from another variant; older responses keep shared images',()=>{
  const photo={url:'/shared.jpg',alt:'Shared'},empty={images:[]},legacy={id:'old'};
  const item={images:[photo],variants:[empty,legacy]};
  assert.deepEqual(variantImages(item,empty),[]);
  assert.deepEqual(variantImages(item,legacy),[photo]);
  assert.deepEqual(variantImages({images:[],variants:[]},null),[]);
});
test('zoom fits images without distorting them, supports portrait/landscape viewports and clamps scale',()=>{
  assert.deepEqual(imageSize(1200,800,600,600,1),{width:600,height:400});
  assert.deepEqual(imageSize(1200,800,600,600,2),{width:1200,height:800});
  assert.deepEqual(imageSize(600,1200,300,500,1),{width:250,height:500});
  assert.deepEqual(imageSize(100,50,1200,800,1),{width:100,height:50});
  assert.deepEqual(imageSize(1200,800,600,600,50),{width:1800,height:1200});
  for(const value of [0,-1,NaN,Infinity])assert.deepEqual(imageSize(value,800,600,600,1),{width:0,height:0});
});
