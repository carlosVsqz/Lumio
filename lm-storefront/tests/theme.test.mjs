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

import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {storedTheme,THEME_STORAGE_KEY} from '../src/app/core/theme-model.ts';

test('theme defaults to light and restores only an explicit valid selection, including before first paint',async()=>{
  const source=await readFile(new URL('../public/theme-init.js',import.meta.url),'utf8');
  for(const [raw,expected] of [[null,'light'],['light','light'],['dark','dark'],['DARK','light'],['{}','light'],['system','light'],['','light']]){
    assert.equal(storedTheme(raw),expected);
    const root={dataset:{}};let color='';
    runInNewContext(source,{document:{documentElement:root,querySelector:()=>({setAttribute:(_name,value)=>color=value})},localStorage:{getItem:key=>{assert.equal(key,THEME_STORAGE_KEY);return raw;}},matchMedia:()=>{throw new Error('System preference must not be used');}});
    assert.equal(root.dataset.theme,expected);assert.equal(color,expected==='dark'?'#141a17':'#ffffff');
  }
  const root={dataset:{}};
  const context={document:{documentElement:root,querySelector:()=>null}};
  Object.defineProperty(context,'localStorage',{get(){throw new Error('blocked');}});
  assert.doesNotThrow(()=>runInNewContext(source,context));assert.equal(root.dataset.theme,'light');
});
