"""Explicit setup for the isolated local shop; never called by CatalogProvider.

Preserves catalog products, stock, prices, campaigns and the administrator password.
Reads private bootstrap data without printing credentials.
"""
import base64
import json
from pathlib import Path
from odoo import Command
from odoo.tools import file_open


def configure_identity(env, settings):
    if env.cr.dbname != 'lumio_demo':
        raise RuntimeError('Identity setup only supports the isolated lumio_demo database')
    login = settings['admin_login']
    if not login or 'demo' in login.lower():
        raise RuntimeError('Configure an administrative login without demo in the private environment')
    spanish = env['res.lang']._activate_and_install_lang('es_ES')
    if not spanish:
        raise RuntimeError('Odoo does not provide the requested Spanish language')
    admin = env.ref('base.user_admin')
    admin.write({'name': 'Administrador de Lumio', 'login': login, 'lang': spanish.code})
    company = env.ref('base.main_company')
    with file_open('lumio_storefront/static/src/img/logo.svg', 'rb') as logo_file:
        logo = base64.b64encode(logo_file.read())
    company.write({'name': 'Lumio', 'logo': logo})
    site_id = settings.get('website_id')
    website = env['website'].browse(site_id).exists() if site_id else env['website'].search([('company_id', '=', company.id)], limit=1)
    if not website or website.company_id != company:
        raise RuntimeError('The configured local website is missing or belongs to another company')
    website.write({'name': 'Lumio', 'logo': logo, 'language_ids': [Command.set([spanish.id])], 'default_lang_id': spanish.id})
    website.user_id.write({'lang': spanish.code})
    integration = env.ref('lumio_local_demo.integration_user', raise_if_not_found=False)
    if integration:
        integration.write({'name': 'Catálogo de Lumio', 'lang': spanish.code})
    env['ir.config_parameter'].set_param('lumio.admin_login', login)


if __name__ == '__main__':
    settings = json.loads(Path('/mnt/lumio-local/bootstrap-input.json').read_text())
    configure_identity(env, settings)
    env.cr.commit()
    print('Identidad local configurada: administración de Lumio, español y logo L. Catálogo conservado.')
