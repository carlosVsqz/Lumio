import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {releaseConfiguration,publicBuildEnvironment} from './release-config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try{
 const args=process.argv.slice(2);let envFile=resolve(root,'.env.production');
 for(let i=0;i<args.length;i++){
  if(args[i]==='--env-file'){if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('--env-file requiere una ruta.');envFile=resolve(args[++i]);}
  else if(args[i]!=='--check')throw new Error('Usa --check o --env-file. El Compose completo no requiere etapas.');
 }
 releaseConfiguration(parseEnv(await readFile(envFile,'utf8')));
 if(args.includes('--check'))console.log('Configuración del despliegue completo válida; API key e IDs se generan automáticamente.');
 else{
  const code=await new Promise((complete,reject)=>{
   const child=spawn('docker',['compose','--env-file',envFile,'-f','compose.production.yaml','build'],{cwd:root,env:publicBuildEnvironment(process.env,'',''),stdio:'inherit'});
   child.on('error',()=>reject(new Error('No se pudo ejecutar Docker Compose.')));child.on('exit',complete);
  });
  if(code!==0)throw new Error('Docker Compose no completó la construcción.');
  console.log('Todas las imágenes compiladas. Compose ejecutará bootstrap y prerenderizado durante up.');
 }
}catch(error){console.error('BUILD FALLIDO: '+error.message);process.exitCode=1;}
