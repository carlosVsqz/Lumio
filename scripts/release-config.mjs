export function httpsOrigin(value,name){
 let url;try{url=new URL(value);}catch{throw new Error(`${name}: configura un origen HTTPS.`);}
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error(`${name}: debe ser HTTPS, sin credenciales, ruta, consulta ni fragmento.`);
 return url.origin;
}
export function releaseConfiguration(environment){
 const publicUrl=httpsOrigin(environment.PUBLIC_SITE_URL,'PUBLIC_SITE_URL');
 httpsOrigin(environment.ODOO_PUBLIC_URL,'ODOO_PUBLIC_URL');
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(environment.LUMIO_CATALOG_ID??''))throw new Error('Configura LUMIO_CATALOG_ID estable.');
 if(!/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(environment.ODOO_DATABASE??'')||environment.ODOO_DATABASE==='lumio_demo')throw new Error('Configura una base de producción distinta de lumio_demo.');
 const passwords=['POSTGRES_ADMIN_PASSWORD','ODOO_DB_PASSWORD','ODOO_MASTER_PASSWORD','ODOO_ADMIN_PASSWORD'];
 for(const name of passwords){const value=environment[name];if(!value||value.length<24||value!==value.trim()||/[\r\n\0]/.test(value))throw new Error(`${name}: configura una contraseña privada de al menos 24 caracteres.`);}
 if(new Set(passwords.map(name=>environment[name])).size!==4)throw new Error('Las cuatro contraseñas de producción deben ser diferentes.');
 for(const name of ['ODOO_WEBSITE_ID','ODOO_PRICELIST_ID','ODOO_WAREHOUSE_ID']){const value=environment[name];if(value&&(!/^[1-9][0-9]*$/.test(value)||Number(value)>2147483647))throw new Error(`${name}: usa un ID real positivo o deja vacío para selección automática.`);}
 if(environment.LUMIO_CURRENCY&&!/^[A-Z]{3}$/.test(environment.LUMIO_CURRENCY))throw new Error('LUMIO_CURRENCY requiere un código ISO.');
 return{publicUrl,database:environment.ODOO_DATABASE};
}
export function publicBuildEnvironment(environment,apiUrl,publicUrl){
 const clean=Object.fromEntries(Object.entries(environment).filter(([name])=>!/^(ODOO_|POSTGRES_|LUMIO_|CATALOG_|PUBLIC_SITE_URL$|BUILD_DOCKER_NETWORK$)/.test(name)));
 return{...clean,CATALOG_BUILD_API_URL:apiUrl,PUBLIC_SITE_URL:publicUrl};
}
