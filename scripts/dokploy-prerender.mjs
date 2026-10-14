import {spawn} from 'node:child_process';
import {cp, mkdir, readFile, readdir, readlink, rename, rm, symlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {httpsOrigin, publicBuildEnvironment} from './release-config.mjs';

export async function waitForCatalog(origin, stopped, {fetcher=fetch, timeoutMs=120000, pauseMs=1000} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stopped()) throw new Error('La API Java temporal no pudo iniciar. Revisa la configuración de Odoo del build.');
    let healthy = false;
    try { healthy = (await fetcher(origin + '/actuator/health', {signal:AbortSignal.timeout(2000)})).ok; } catch {}
    if (healthy) {
      try {
        const response = await fetcher(origin + '/graphql', {method:'POST', headers:{'Content-Type':'application/json'},
          signal:AbortSignal.timeout(15000), body:JSON.stringify({query:'{catalog{name} items{slug}}'})});
        const body = await response.json();
        if (!response.ok || body.errors?.length || !body.data?.catalog || !Array.isArray(body.data.items)) throw new Error();
        return;
      } catch { /* Backend may be restarting after private integration settings changed. */ }
    }
    await new Promise(complete => setTimeout(complete, pauseMs));
  }
  throw new Error('Odoo no entregó el catálogo a través de GraphQL dentro del tiempo de espera. No se publican archivos estáticos.');
}

export async function verifyPublicArtifact(directory, key) {
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await verifyPublicArtifact(path, key);
    else if (/\.(?:html|js|mjs|css|json|xml|txt|map)$/.test(entry.name)) {
      if ((await readFile(path, 'utf8')).includes(key)) throw new Error('Se detectó una credencial en el artefacto público. Build cancelado.');
    }
  }
}

export async function publishStatic(source, directory) {
  const root = resolve(directory), id = randomUUID();
  const releases = join(root, 'releases'), release = join(releases, id), next = join(root, '.current-' + id);
  let previous = '';
  try { previous = await readlink(join(root, 'current')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(releases, {recursive:true});
  try {
    // Copy the complete verified artifact before atomically switching Nginx's current directory.
    await cp(source, release, {recursive:true});
    await symlink(process.platform === 'win32' ? release : 'releases/' + id, next, process.platform === 'win32' ? 'junction' : 'dir');
    await rename(next, join(root, 'current'));
  } catch (error) {
    await rm(next, {force:true}); await rm(release, {recursive:true, force:true}); throw error;
  }
  // Retain one previous release. Never remove the current target or arbitrary paths.
  const current = await readlink(join(root, 'current'));
  const history = (await readdir(releases)).filter(name => /^[a-f0-9-]{36}$/.test(name)
    && ![current, previous].some(target => target === 'releases/' + name || resolve(target) === join(releases, name)));
  for (const name of history) await rm(join(releases, name), {recursive:true, force:true});
}

async function main() {
  try {
    const origin = new URL(process.env.CATALOG_BUILD_API_URL).origin;
    const publicUrl = httpsOrigin(process.env.PUBLIC_SITE_URL, 'PUBLIC_SITE_URL');
    const frontendEnvironment = publicBuildEnvironment(process.env, process.env.CATALOG_BUILD_API_URL, publicUrl);
    console.log('Esperando GraphQL real para compilar el escaparate estático.');
    await new Promise(complete => setTimeout(complete, 2000));
    await waitForCatalog(origin, () => false);
    const code = await new Promise((complete, reject) => {
      const child = spawn(process.execPath, ['scripts/build-static.mjs'], {env:frontendEnvironment, stdio:'inherit'});
      child.on('error', () => reject(new Error('No se pudo iniciar el build estático Angular.'))); child.on('exit', complete);
    });
    if (code !== 0) throw new Error('Angular no completó el prerenderizado.');
    const output = 'dist/lm-storefront/browser';
    const marker = JSON.parse(await readFile(join(output, 'static-build.json'), 'utf8'));
    if (marker.publicUrl !== publicUrl) throw new Error('El artefacto no corresponde al dominio público configurado.');
    await publishStatic(output, process.env.STATIC_OUTPUT_DIRECTORY);
    console.log('Escaparate verificado y publicado de forma atómica. La tarea Node termina; Nginx sirve archivos estáticos.');
  } catch (error) {
    console.error('BUILD DOKPLOY FALLIDO: ' + error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
