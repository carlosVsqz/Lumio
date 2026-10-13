import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {releaseConfiguration, publicBuildEnvironment} from './release-config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try {
  const args=process.argv.slice(2);let envFile=resolve(root,'.env.production');
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--env-file') {if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('--env-file requiere una ruta.');envFile=resolve(args[++i]);}
    else if(!['--check','--odoo-only'].includes(args[i]))throw new Error('Usa --check, --odoo-only o --env-file. Dokploy compila el código; este flujo no publica imágenes.');
  }
  const odooOnly=args.includes('--odoo-only'),environment=parseEnv(await readFile(envFile,'utf8'));
  releaseConfiguration(environment,{odooOnly});
  if(args.includes('--check'))console.log(odooOnly?'Configuración inicial de Odoo válida.':'Configuración de build Dokploy válida.');
  else {
    const code=await new Promise((complete,reject)=>{
      const child=spawn('docker',['compose','--env-file',envFile,'-f','compose.production.yaml','build',...(odooOnly?['odoo']:['lm-core','lm-storefront'])],{cwd:root,env:publicBuildEnvironment(process.env,'',''),stdio:'inherit'});
      child.on('error',()=>reject(new Error('No se pudo ejecutar Docker Compose.')));child.on('exit',complete);
    });
    if(code!==0)throw new Error('Docker Compose no completó el build.');
    console.log('Código compilado por Docker Compose. No se desplegó ni publicó en un registro.');
  }
}catch(error){console.error('BUILD FALLIDO: '+error.message);process.exitCode=1;}
