"""Idempotent administrative startup job, outside the read-only CatalogProvider."""
import base64
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit
import psycopg2
from bootstrap_state import read_settings, select_id, write_settings

MODULES = 'website_sale,website_sale_stock,lumio_campaign,lumio_storefront'
STATE = Path('/var/lib/lumio-integration')


def required(name, minimum=1):
    value = os.environ.get(name, '')
    if len(value) < minimum or value != value.strip() or any(char in value for char in '\r\n\0'):
        raise ValueError(f'Configure {name} privately before startup')
    return value


def initialize_modules(database):
    result = subprocess.run(['odoo', '--config', os.environ['ODOO_RC'], '--database', database,
        '--init', MODULES, '--without-demo', '--load-language', 'es_ES', '--no-http', '--stop-after-init', '--log-level=warn'])
    if result.returncode:
        raise ValueError('Odoo module initialization failed; HTTP remains blocked and no catalog fallback is used')


def record(env, model, name, values):
    existing = env.ref('lumio_production.' + name, raise_if_not_found=False)
    if existing:
        if existing._name != model:
            raise ValueError('An integration external ID belongs to a different model')
        return existing
    created = env[model].search([('group_id', '=', values['group_id']), ('model_id', '=', values['model_id']),
        ('perm_read', '=', True), ('perm_write', '=', False), ('perm_create', '=', False), ('perm_unlink', '=', False)], limit=1) if model == 'ir.model.access' else env[model]
    if not created:
        created = env[model].create(values)
    env['ir.model.data'].create({'module':'lumio_production', 'name':name, 'model':model, 'res_id':created.id, 'noupdate':True})
    return created


def configure(env, fresh, login, password, business, origin):
    from odoo import Command
    from odoo.tools import file_open
    previous = read_settings(STATE / 'catalog.properties')
    company = env.ref('base.main_company')
    if fresh:
        spanish = env['res.lang']._activate_and_install_lang('es_ES')
        currency = env['res.currency'].with_context(active_test=False).search([('name', '=', os.environ.get('LUMIO_CURRENCY', 'GTQ'))], limit=1)
        if not currency:
            raise ValueError('LUMIO_CURRENCY is not available in Odoo')
        currency.active = True
        env.ref('base.user_admin').write({'login':login, 'name':'Administrador de ' + business,
            'password':password, 'lang':spanish.code, 'group_ids':[Command.link(env.ref('lumio_campaign.group_campaign_manager').id)]})
        with file_open('lumio_storefront/static/src/img/logo.svg', 'rb') as file:
            logo = base64.b64encode(file.read())
        company.write({'name':business, 'logo':logo, 'currency_id':currency.id})
        site = env['website'].search([('company_id', '=', company.id)], limit=1)
        site.write({'name':business, 'domain':origin, 'logo':logo,
            'language_ids':[Command.set([spanish.id])], 'default_lang_id':spanish.id})
        # Odoo installs its initial public tariff in USD before company configuration.
        # Only change those initial tariffs in this new database, never existing prices.
        env['product.pricelist'].search(['|', ('company_id', '=', False),
            ('company_id', '=', company.id)]).filtered(
                lambda price: not price.website_id or price.website_id == site
            ).write({'currency_id':currency.id})
        site.user_id.lang = spanish.code
        env['ir.config_parameter'].set_param('lumio.admin_login', login)
        env['ir.config_parameter'].set_param('web.base.url', origin)
        env['ir.config_parameter'].set_param('web.base.url.freeze', 'True')

    sites = env['website'].search([])
    site_id = os.environ.get('ODOO_WEBSITE_ID', '') or previous.get('ODOO_WEBSITE_ID', '')
    if not site_id:
        matched = sites.filtered(lambda site: (site.domain or '').rstrip('/') == origin)
        if matched:
            sites = matched
    site = env['website'].browse(select_id([{'id':site.id} for site in sites], site_id, 'ODOO_WEBSITE_ID'))
    company = site.company_id
    if not env['res.lang'].search([('code', '=', 'es_ES'), ('active', '=', True)], limit=1):
        env['res.lang']._activate_and_install_lang('es_ES')
    warehouses = env['stock.warehouse'].search([('company_id', '=', company.id)])
    warehouse_id = select_id([{'id':warehouse.id} for warehouse in warehouses], os.environ.get('ODOO_WAREHOUSE_ID', '') or previous.get('ODOO_WAREHOUSE_ID', ''), 'ODOO_WAREHOUSE_ID')
    pricelists = env['product.pricelist'].search([('active', '=', True), '|', ('company_id', '=', False), ('company_id', '=', company.id)])
    pricelists = pricelists.filtered(lambda price: not price.website_id or price.website_id == site)
    requested = os.environ.get('ODOO_PRICELIST_ID', '') or previous.get('ODOO_PRICELIST_ID', '')
    if not pricelists and not requested:
        pricelists = env['product.pricelist'].create({'name':'Catálogo ' + business, 'company_id':company.id,
            'currency_id':company.currency_id.id, 'website_id':site.id, 'selectable':True})
    pricelist_id = select_id([{'id':price.id} for price in pricelists], requested, 'ODOO_PRICELIST_ID')

    group = record(env, 'res.groups', 'catalog_group', {'name':'Lumio: lectura de catálogo (API)',
        'implied_ids':[Command.link(env.ref('base.group_user').id)], 'api_key_duration':90})
    models = ['website','stock.warehouse','product.pricelist','product.pricelist.item','res.currency',
        'product.template','product.product','product.public.category','product.template.attribute.value',
        'product.template.attribute.line','product.attribute','product.attribute.value','product.image',
        'stock.quant','stock.move','stock.location','stock.picking','stock.picking.type']
    for model in models:
        record(env, 'ir.model.access', 'read_' + model.replace('.', '_'), {'name':'Lumio API read ' + model,
            'model_id':env['ir.model']._get(model).id, 'group_id':group.id,
            'perm_read':True, 'perm_write':False, 'perm_create':False, 'perm_unlink':False})
    user = record(env, 'res.users', 'catalog_user', {'name':'Catálogo de ' + business, 'login':'lumio-catalog',
        'lang':'es_ES', 'company_id':company.id, 'company_ids':[Command.set([company.id])],
        'group_ids':[Command.set([group.id, env.ref('lumio_campaign.group_campaign_reader').id])], 'notification_type':'inbox'})
    if company not in user.company_ids:
        raise ValueError('The integration user does not have access to the selected website company')
    if not user.active:
        raise ValueError('The dedicated integration user is disabled; no account was reactivated')
    for model in ('product.template','product.product','stock.quant','lumio.campaign.slide'):
        if not env[model].with_user(user).has_access('read') or env[model].with_user(user).has_access('write'):
            raise ValueError('The integration user requires catalog read access without write privileges')
    supplied = os.environ.get('ODOO_API_KEY', '')
    key = supplied or previous.get('ODOO_API_KEY', '')
    keys = env['res.users.apikeys'].with_user(user)
    valid = key and keys._check_credentials(scope='rpc', key=key) == user.id
    if supplied and not valid:
        raise ValueError('The supplied ODOO_API_KEY is invalid for the dedicated integration user')
    if not valid:
        key = keys._generate('rpc', 'Lumio catálogo producción', datetime.datetime.now() + datetime.timedelta(days=89))
    settings = {'ODOO_API_KEY':key, 'ODOO_WEBSITE_ID':site.id, 'ODOO_PRICELIST_ID':pricelist_id, 'ODOO_WAREHOUSE_ID':warehouse_id}
    env['ir.config_parameter'].set_param('lumio.bootstrap.ready', 'True')
    env.cr.commit()
    write_settings(STATE / 'catalog.properties', settings)


def main():
    database = required('ODOO_DATABASE')
    login = required('ODOO_ADMIN_LOGIN')
    password = required('ODOO_ADMIN_PASSWORD', 24)
    business = required('LUMIO_BUSINESS_NAME')
    origin = required('ODOO_PUBLIC_URL').rstrip('/')
    url = urlsplit(origin)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.path or url.query or url.fragment:
        raise ValueError('ODOO_PUBLIC_URL must be an HTTPS origin without credentials or path')
    if login == 'admin' or 'demo' in login.lower() or password in (os.environ['PASSWORD'], os.environ['ODOO_MASTER_PASSWORD']):
        raise ValueError('Use a production administrator identity and a distinct password')
    currency = os.environ.get('LUMIO_CURRENCY', 'GTQ')
    if not re.fullmatch(r'[A-Z]{3}', currency):
        raise ValueError('LUMIO_CURRENCY must be an ISO currency code')
    pending = STATE / 'bootstrap-pending.json'
    with psycopg2.connect(host=os.environ['HOST'], port=5432, user=os.environ['USER'],
        password=os.environ['PASSWORD'], dbname=database, connect_timeout=10) as lock:
        lock.autocommit = True
        with lock.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_lock(hashtext('lumio-bootstrap'))")
            cursor.execute("SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public')")
            empty = not cursor.fetchone()[0]
            cursor.execute("SELECT to_regclass('public.ir_module_module')")
            if not empty and not cursor.fetchone()[0]:
                raise ValueError('Existing database is not an Odoo database; no data were changed')
            if pending.exists() and json.loads(pending.read_text()) != {'database':database}:
                raise ValueError('Bootstrap state belongs to a different database')
            fresh = empty or pending.exists()
            if empty:
                pending.write_text(json.dumps({'database':database}))
                pending.chmod(0o600)
            missing_modules = True
            if not empty:
                cursor.execute('SELECT name FROM ir_module_module WHERE state = %s AND name = ANY(%s)', ('installed', MODULES.split(',')))
                missing_modules = len(cursor.fetchall()) != len(MODULES.split(','))
        if missing_modules:
            initialize_modules(database)
        import odoo
        import odoo.init
        from odoo.modules.registry import Registry
        odoo.tools.config.parse_config(['--config', os.environ['ODOO_RC'], '--database', database, '--no-http'])
        with Registry(database).cursor() as cursor:
            configure(odoo.api.Environment(cursor, odoo.SUPERUSER_ID, {}), fresh, login, password, business, origin)
        pending.unlink(missing_ok=True)
    print('Odoo preparado: identidad preservada, integración de lectura y referencias reales guardadas privadamente.')


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        raise SystemExit('BOOTSTRAP ODOO FALLIDO: ' + str(error)) from None
