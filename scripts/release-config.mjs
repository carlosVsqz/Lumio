const coreVariables = [
  'LUMIO_CATALOG_ID', 'LUMIO_LOGO_URL', 'LUMIO_PRIMARY_COLOR',
  'ODOO_DATABASE', 'ODOO_API_KEY', 'ODOO_WEBSITE_ID', 'ODOO_PRICELIST_ID', 'ODOO_WAREHOUSE_ID',
  'ODOO_STOCK_POLICY', 'ODOO_LANGUAGE', 'ODOO_CAMPAIGNS_ENABLED', 'ODOO_BUSINESS_NAME',
  'ODOO_BUSINESS_DESCRIPTION', 'ODOO_WHATSAPP_NUMBER', 'ODOO_CONNECT_TIMEOUT_MS',
  'ODOO_REQUEST_TIMEOUT_MS', 'ODOO_MAX_RECORDS', 'ODOO_MAX_IMAGE_BYTES',
];

export function httpsOrigin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name}: configura un origen HTTPS.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name}: debe ser un origen HTTPS, sin credenciales, ruta, consulta ni fragmento.`);
  }
  return url.origin;
}

export function buildOdooOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('ODOO_BUILD_URL: configura la URL accesible desde el contenedor de compilación.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || (url.protocol === 'http:' && !['odoo', 'localhost', '127.0.0.1', 'host.docker.internal'].includes(url.hostname))) {
    throw new Error('ODOO_BUILD_URL: usa HTTPS para Odoo público o HTTP con el servicio interno o loopback, sin credenciales ni ruta.');
  }
  return url.origin;
}

export function releaseConfiguration(environment, {odooOnly = false} = {}) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(environment.ODOO_DATABASE ?? '') || environment.ODOO_DATABASE === 'lumio_demo') {
    throw new Error('Configura una base Odoo de producción distinta de lumio_demo.');
  }
  if (odooOnly) return {database:environment.ODOO_DATABASE};
  const publicUrl = httpsOrigin(environment.PUBLIC_SITE_URL, 'PUBLIC_SITE_URL');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(environment.LUMIO_CATALOG_ID ?? '')) throw new Error('Configura LUMIO_CATALOG_ID estable para el negocio de producción.');
  if (!environment.ODOO_API_KEY || environment.ODOO_API_KEY !== environment.ODOO_API_KEY.trim()) throw new Error('Configura ODOO_API_KEY privada para el build del catálogo real.');
  for (const name of ['ODOO_WEBSITE_ID', 'ODOO_PRICELIST_ID', 'ODOO_WAREHOUSE_ID']) {
    if (!/^[1-9][0-9]*$/.test(environment[name] ?? '') || Number(environment[name]) > 2147483647) throw new Error(`${name}: utiliza el ID real de producción.`);
  }
  const buildOdooUrl = buildOdooOrigin(environment.ODOO_BUILD_URL || environment.ODOO_PUBLIC_URL || environment.ODOO_URL);
  const coreEnvironment = Object.fromEntries(coreVariables.filter(name => environment[name] !== undefined).map(name => [name, environment[name]]));
  Object.assign(coreEnvironment, {CATALOG_PROVIDER:'odoo', ODOO_URL:buildOdooUrl, GRAPHIQL_ENABLED:'false', LOGGING_LEVEL_ROOT:'WARN'});
  for (const [name, value] of Object.entries(coreEnvironment)) {
    if (/[\r\n\0]/.test(value)) throw new Error(`${name}: no puede contener saltos de línea.`);
  }
  return {publicUrl, coreEnvironment};
}

export function publicBuildEnvironment(environment, apiUrl, publicUrl) {
  const clean = Object.fromEntries(Object.entries(environment).filter(([name]) => !/^(ODOO_|POSTGRES_|LUMIO_|CATALOG_|PUBLIC_SITE_URL$|BUILD_DOCKER_NETWORK$)/.test(name)));
  return {...clean, CATALOG_BUILD_API_URL:apiUrl, PUBLIC_SITE_URL:publicUrl};
}
