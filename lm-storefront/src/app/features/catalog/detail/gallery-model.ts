import type {CatalogImage,CatalogItem,CatalogVariant} from '../data-access/catalog.models';

export function uniqueImages(images:CatalogImage[]):CatalogImage[] {
  const seen=new Set<string>();
  return images.filter(image=>{if(seen.has(image.url))return false;seen.add(image.url);return true;});
}

export function variantImages(item:CatalogItem,variant:CatalogVariant|null):CatalogImage[] {
  if(variant && !item.variants.includes(variant))return [];
  // [] means explicitly no image; undefined keeps compatibility with older snapshots.
  return uniqueImages(variant?.images ?? item.images);
}

export function imageSize(width:number,height:number,viewportWidth:number,viewportHeight:number,zoom:number) {
  if(![width,height,viewportWidth,viewportHeight,zoom].every(value=>Number.isFinite(value)&&value>0))return {width:0,height:0};
  const fit=Math.min(viewportWidth/width,viewportHeight/height,1);
  const scale=Math.max(1,Math.min(3,zoom));
  return {width:width*fit*scale,height:height*fit*scale};
}
