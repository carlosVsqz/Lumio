import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandContrast, brandTextColor } from '../src/app/core/branding-model.ts';
test('business colors get readable button labels and text on a white surface',()=>{
  assert.equal(brandContrast('#234d46'),'#ffffff');
  assert.equal(brandContrast('#ffffff'),'#000000');
  assert.equal(brandContrast('#ffee00'),'#000000');
  assert.equal(brandTextColor('#ffee00'),'#191f1d');
  assert.equal(brandTextColor('#234d46'),'#234d46');
});
