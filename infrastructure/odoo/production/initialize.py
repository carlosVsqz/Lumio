"""Explicit, offline first initialization. Refuses ANY existing application database."""
import base64
import os
import subprocess
from urllib.parse import urlsplit
import psycopg2


def required(name, minimum=1):
    value = os.environ.get(name, '')
    if len(value) < minimum or value != value.strip() or any(char in value for char in '\r\n\0'):
        raise SystemExit(f'Configure {name} privately before initialization')
    return value


def main():
    login = required('ODOO_ADMIN_LOGIN')
    password = required('ODOO_ADMIN_PASSWORD', 24)
    business = required('LUMIO_BUSINESS_NAME')
    origin = required('ODOO_PUBLIC_URL')
    url = urlsplit(origin)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment:
        raise SystemExit('ODOO_PUBLIC_URL must be an HTTPS origin without credentials or path')
    if login == 'admin' or 'demo' in login.lower():
        raise SystemExit('Choose a production administrator login different from admin and without demo identity')
    if password in (os.environ['PASSWORD'], os.environ['ODOO_MASTER_PASSWORD']):
        raise SystemExit('Administrator password must differ from database and master passwords')
    database = os.environ['ODOO_DATABASE']
    # PostgreSQL creates the database beforehand, owned by the non-superuser application role.
    with psycopg2.connect(host=os.environ['HOST'], port=5432, user=os.environ['USER'],
                          password=os.environ['PASSWORD'], dbname=database, connect_timeout=10) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public')")
            if cursor.fetchone()[0]:
                raise SystemExit('Refusing initialization: database already contains tables. No existing data or passwords were changed.')
    result = subprocess.run([
        'odoo', '--config', os.environ['ODOO_RC'], '--database', database,
        '--init', 'website_sale,website_sale_stock,lumio_campaign,lumio_storefront',
        '--without-demo', '--load-language', 'es_ES', '--no-http', '--stop-after-init', '--log-level=warn',
    ], check=False)
    if result.returncode:
        raise SystemExit('Odoo initialization failed. Keep HTTP stopped and inspect this new database before retrying.')

    import odoo
    import odoo.init  # Odoo 19 initializes its namespace/ORM shortcuts before CLI commands.
    from odoo import Command
    from odoo.modules.registry import Registry
    from odoo.tools import file_open
    odoo.tools.config.parse_config(['--config', os.environ['ODOO_RC'], '--database', database, '--no-http'])
    with Registry(database).cursor() as cursor:
        env = odoo.api.Environment(cursor, odoo.SUPERUSER_ID, {})
        spanish = env['res.lang']._activate_and_install_lang('es_ES')
        admin = env.ref('base.user_admin')
        admin.write({'login':login, 'name':'Administrador de ' + business, 'password':password, 'lang':spanish.code,
                     'group_ids':[Command.link(env.ref('lumio_campaign.group_campaign_manager').id)]})
        company = env.ref('base.main_company')
        with file_open('lumio_storefront/static/src/img/logo.svg', 'rb') as file:
            logo = base64.b64encode(file.read())
        company.write({'name':business, 'logo':logo})
        website = env['website'].search([('company_id', '=', company.id)], limit=1)
        website.write({'name':business, 'domain':origin.rstrip('/'), 'logo':logo,
                       'language_ids':[Command.set([spanish.id])], 'default_lang_id':spanish.id})
        website.user_id.write({'lang':spanish.code})
        env['ir.config_parameter'].set_param('lumio.admin_login', login)
        env['ir.config_parameter'].set_param('web.base.url', origin.rstrip('/'))
        env['ir.config_parameter'].set_param('web.base.url.freeze', 'True')

        # Same catalog ACL requirements as local integration, without fixtures or API key creation.
        group = env['res.groups'].create({'name':'Lumio: lectura de catálogo (API)',
            'implied_ids':[Command.link(env.ref('base.group_user').id)], 'api_key_duration':90})
        models = [
            'website','stock.warehouse','product.pricelist','product.pricelist.item','res.currency',
            'product.template','product.product','product.public.category','product.template.attribute.value',
            'product.template.attribute.line','product.attribute','product.attribute.value','product.image',
            'stock.quant','stock.move','stock.location','stock.picking','stock.picking.type',
        ]
        for model in models:
            env['ir.model.access'].create({'name':'Lumio API read ' + model, 'model_id':env['ir.model']._get(model).id,
                'group_id':group.id, 'perm_read':True, 'perm_write':False, 'perm_create':False, 'perm_unlink':False})
        integration = env['res.users'].create({'name':'Catálogo de ' + business, 'login':'lumio-catalog',
            'lang':spanish.code, 'company_id':company.id, 'company_ids':[Command.set([company.id])],
            'group_ids':[Command.set([group.id, env.ref('lumio_campaign.group_campaign_reader').id])],
            'notification_type':'inbox'})
        for name, record in [('catalog_group', group), ('catalog_user', integration)]:
            env['ir.model.data'].create({'module':'lumio_production', 'name':name, 'model':record._name, 'res_id':record.id, 'noupdate':True})
        cursor.commit()
    print('Base nueva preparada sin catálogo demo. Administración en español, logo L y usuario de integración configurados.')
    print('Configura moneda, sitio, tarifa, almacén y catálogo reales. Genera la clave API del usuario de integración desde Odoo.')


if __name__ == '__main__':
    main()
