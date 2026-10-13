{
    "name": "Lumio · Identidad y acceso administrativo",
    "version": "19.0.1.2.0",
    "summary": "Paleta negra para Odoo y formulario de acceso sin contenido comercial",
    "category": "Website",
    "license": "LGPL-3",
    "author": "Lumio",
    "depends": ["website", "auth_signup"],
    "data": ["views/login_templates.xml"],
    "assets": {
        "web._assets_primary_variables": [
            ("prepend", "lumio_storefront/static/src/scss/primary_variables.scss"),
        ],
    },
    "installable": True,
    "application": False,
}
