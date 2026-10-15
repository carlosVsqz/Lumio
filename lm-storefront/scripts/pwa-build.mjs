import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

export function catalogManifest(base,catalog) {
  if(typeof catalog?.name!=='string' || !catalog.name.trim() || typeof catalog.description!=='string')throw new Error('Configuración del negocio inválida para PWA.');
  return {...base,name:catalog.name,short_name:Array.from(catalog.name).slice(0,24).join(''),description:catalog.description};
}

/** Verify the final artifacts, after changing the business manifest and generating service worker hashes. */
export async function verifyPwaBuild(output,catalog) {
  const manifest=JSON.parse(await readFile(resolve(output,'manifest.webmanifest'),'utf8'));
  if(manifest.name!==catalog.name || manifest.id!=='/' || manifest.start_url!=='/' || manifest.scope!=='/' || manifest.display!=='standalone')throw new Error('Manifest PWA inválido.');
  for(const size of [192,512]) {
    const icon=manifest.icons.find(icon=>icon.sizes===`${size}x${size}` && icon.type==='image/png' && icon.purpose.split(' ').includes('any'));
    if(!icon || !/^\/icons\/[a-z0-9-]+\.png$/.test(icon.src))throw new Error('Falta un icono PWA válido.');
    const bytes=await readFile(resolve(output,icon.src.slice(1)));
    if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a' || bytes.readUInt32BE(16)!==size || bytes.readUInt32BE(20)!==size)throw new Error('Dimensiones de icono PWA inválidas.');
  }
  const config=JSON.parse(await readFile(resolve(output,'ngsw.json'),'utf8'));
  const paths=Object.keys(config.hashTable);
  if(config.index!=='/index.csr.html' || config.navigationRequestStrategy!=='freshness' || config.dataGroups.length
    || !paths.includes('/index.csr.html') || paths.some(path=>path.endsWith('.html') && path!=='/index.csr.html' || path.startsWith('/catalog-media/') || path.startsWith('/graphql')))
    throw new Error('La caché PWA no debe conservar datos del catálogo ni HTML de artículos.');
  for(const path of ['/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png','/icons/splash-logo.png','/splash.css','/splash-init.js']) {
    const hash=createHash('sha1').update(await readFile(resolve(output,path.slice(1)))).digest('hex');
    if(config.hashTable[path]!==hash)throw new Error('Un archivo de identidad PWA cambió después de generar su caché: '+path);
  }
}
