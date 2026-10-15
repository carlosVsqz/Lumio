import { COMBO_FIELDS } from '../src/app/features/catalog/data-access/catalog.models.ts';
import { spawn } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { publicSiteUrl, buildApiUrl, sitemap } from '../src/app/core/seo-model.ts';
import { verifyArticleHtml } from './verify-html.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist/lm-storefront/browser');
try {
  const api = buildApiUrl(process.env.CATALOG_BUILD_API_URL ?? 'http://localhost:8080/graphql');
  const origin = publicSiteUrl(process.env.PUBLIC_SITE_URL ?? 'http://localhost:4200');
  // An unsuccessful build must not leave an older artifact ready to publish.
  await rm(resolve(root, 'dist/lm-storefront'), {recursive:true, force:true});
  console.log('Consultando slugs y catálogo de lm-core para prerenderizar…');
  const response = await fetch(api, {
    method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(15000),
    body:JSON.stringify({query:`query StaticBuild {
      catalog { branding { logoUrl primaryColor } name description currency currencyDecimals whatsappNumber categories { id slug name description }
        items { id slug type name description categoryIds available images { url alt }
          variants { id slug name priceMinor available attributes { name value } }
          ${COMBO_FIELDS}
        }
      }
      items { slug }
    }`}),
  });
  if (!response.ok) throw new Error('La API devolvió HTTP ' + response.status);
  const result = await response.json();
  if (result.errors?.length || !result.data?.catalog || !Array.isArray(result.data.items)) throw new Error('Respuesta GraphQL inválida al consultar el catálogo.');
  const catalog = result.data.catalog;
  const slugs = result.data.items.map(item => item.slug);
  if (new Set(slugs).size !== slugs.length || slugs.some(slug => typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) throw new Error('Slugs inválidos o duplicados.');
  if (!Array.isArray(catalog.items) || catalog.items.length !== slugs.length || catalog.items.some(item => !slugs.includes(item.slug))) throw new Error('Los slugs y el catálogo no corresponden a la misma instantánea.');
  console.log('Prerenderizando ' + slugs.length + ' fichas reales.');
  const exitCode = await new Promise((complete, reject) => {
    const child = spawn(process.execPath, [resolve(root, 'node_modules/@angular/cli/bin/ng.js'), 'build', ...process.argv.slice(2)], {
      cwd:root, stdio:'inherit', env:{...process.env, CATALOG_BUILD_API_URL:api, PUBLIC_SITE_URL:origin},
    });
    child.on('error', reject); child.on('exit', complete);
  });
  if (exitCode !== 0) throw new Error('Angular no completó el prerenderizado.');
  for (const item of catalog.items) {
    const html = await readFile(resolve(output, 'catalogo', item.slug, 'index.html'), 'utf8');
    verifyArticleHtml(html, item, catalog, origin);
  }
  await writeFile(resolve(output, 'sitemap.xml'), sitemap(origin, slugs));
  await writeFile(resolve(output, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: ' + origin + '/sitemap.xml\n');
  await writeFile(resolve(output, 'static-build.json'), JSON.stringify({publicUrl:origin,slugs}, null, 2));
  console.log('HTML verificado; sitemap y robots.txt generados. Artefacto estático listo en ' + output);
} catch (error) {
  await rm(resolve(root, 'dist/lm-storefront'), {recursive:true, force:true});
  console.error('BUILD ESTÁTICO FALLIDO: ' + error.message + '\nComprueba que lm-core esté iniciado con el catálogo configurado y que CATALOG_BUILD_API_URL sea accesible.');
  process.exitCode = 1;
}

