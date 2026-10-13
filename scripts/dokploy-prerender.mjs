import {spawn} from 'node:child_process';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {releaseConfiguration, publicBuildEnvironment} from './release-config.mjs';

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
      } catch {
        throw new Error('Odoo no entregó el catálogo: comprueba ODOO_BUILD_URL, clave API, permisos, IDs y conectividad. Build cancelado.');
      }
    }
    await new Promise(complete => setTimeout(complete, pauseMs));
  }
  throw new Error('La API Java temporal no estuvo disponible en dos minutos. Build cancelado.');
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

async function main() {
  let server;
  try {
    const key = await readFile('/run/secrets/odoo_api_key', 'utf8');
    const configuration = releaseConfiguration({...process.env, ODOO_API_KEY:key});
    const origin = 'http://127.0.0.1:8080';
    const frontendEnvironment = publicBuildEnvironment(process.env, origin + '/graphql', configuration.publicUrl);
    const serverEnvironment = {...publicBuildEnvironment(process.env, '', ''), ...configuration.coreEnvironment,
      PORT:'8080', SERVER_ADDRESS:'127.0.0.1', JAVA_TOOL_OPTIONS:'-Xmx512m', LOGGING_LEVEL_ROOT:'ERROR'};
    let stopped = false;
    server = spawn('java', ['-jar', '/opt/lumio/app.jar'], {env:serverEnvironment, stdio:'ignore'});
    server.on('error', () => { stopped = true; }); server.on('exit', () => { stopped = true; });
    console.log('Iniciando lm-core temporal para consultar el Odoo configurado y prerenderizar.');
    await waitForCatalog(origin, () => stopped);
    const code = await new Promise((complete, reject) => {
      const child = spawn(process.execPath, ['scripts/build-static.mjs'], {env:frontendEnvironment, stdio:'inherit'});
      child.on('error', () => reject(new Error('No se pudo iniciar el build estático Angular.'))); child.on('exit', complete);
    });
    if (code !== 0) throw new Error('Angular no completó el prerenderizado.');
    await verifyPublicArtifact('dist/lm-storefront/browser', key);
    console.log('Prerenderizado verificado; únicamente los archivos estáticos pasan a la imagen Nginx.');
  } catch (error) {
    console.error('BUILD DOKPLOY FALLIDO: ' + error.message);
    process.exitCode = 1;
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await Promise.race([new Promise(complete => server.once('exit', complete)), new Promise(complete => setTimeout(complete, 5000))]);
      if (server.exitCode === null) server.kill('SIGKILL');
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
