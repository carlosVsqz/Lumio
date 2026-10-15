import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const MAX_LOGO_BYTES=5*1024*1024;

/** Resolve against core, never against the public site or an Odoo URL with credentials. */
export function brandLogoUrl(logo,api) {
  const url=new URL(logo,api);
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password)throw new Error('URL del logo del negocio inválida.');
  return url;
}

async function readLogo(logo,api) {
  const url=brandLogoUrl(logo,api);
  const response=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw new Error('No se pudo obtener el logo del negocio (HTTP '+response.status+').');
  if(Number(response.headers.get('content-length'))>MAX_LOGO_BYTES)throw new Error('El logo del negocio supera 5 MiB.');
  const chunks=[];let size=0;
  for await(const chunk of response.body) {
    size+=chunk.length;
    if(size>MAX_LOGO_BYTES)throw new Error('El logo del negocio supera 5 MiB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Build-time only: all startup images are local, opaque PNGs derived from the actual brand. */
export async function writeBrandAssets(output,catalog,api) {
  const configured=catalog.branding?.logoUrl;
  const bytes=configured ? await readLogo(configured,api) : await readFile(new URL('../public/favicon.svg',import.meta.url));
  const image=sharp(bytes,{limitInputPixels:16_000_000}).rotate();
  const metadata=await image.metadata();
  if(!metadata.width || !metadata.height)throw new Error('El logo del negocio no es una imagen válida.');
  await mkdir(resolve(output,'icons'),{recursive:true});
  for(const [name,size] of [['icon-192',192],['icon-512',512],['apple-touch-icon',180]]) {
    // A 56% central square stays entirely inside the maskable icon's 80% safe circle.
    const content=await image.clone().resize({width:Math.round(size*.56),height:Math.round(size*.56),fit:'inside'}).png().toBuffer();
    await sharp({create:{width:size,height:size,channels:3,background:'#ffffff'}})
      .composite([{input:content,gravity:'centre'}]).png().toFile(resolve(output,'icons',name+'.png'));
  }
  const splash=await image.clone().resize({width:640,height:320,fit:'inside'}).flatten({background:'#ffffff'}).png().toBuffer();
  await writeFile(resolve(output,'icons/splash-logo.png'),splash);
}
