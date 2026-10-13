import {test} from 'node:test';
import assert from 'node:assert/strict';
import {brandContrast,brandSurfaceColor,brandTextColor,contrastRatio} from '../src/app/core/branding-model.ts';

test('business colors keep readable text, identifiable buttons and contrasting button labels in dark mode',()=>{
  for(const original of ['#234d46','#ffffff','#000000','#ffee00','#888888','#ff0000','#0000ff','#19ac83']){
    const text=brandTextColor(original,'dark'),button=brandSurfaceColor(original,'dark');
    for(const background of ['#141a17','#1c2420','#242e28'])assert.ok(contrastRatio(text,background)>=4.5,`${original}: ${text} on ${background}`);
    assert.ok(contrastRatio(button,'#1c2420')>=3);
    assert.ok(contrastRatio(brandContrast(button),button)>=4.5);
  }
  assert.equal(brandSurfaceColor('#234d46','light'),'#234d46');
  assert.equal(brandTextColor('#234d46','light'),'#234d46');
  assert.equal(brandSurfaceColor('#ffee00','dark'),'#ffee00');
});

