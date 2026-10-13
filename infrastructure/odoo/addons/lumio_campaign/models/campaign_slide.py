from urllib.parse import urlsplit

from odoo import api, fields, models
from odoo.exceptions import ValidationError


class LumioCampaignSlide(models.Model):
    _name = "lumio.campaign.slide"
    _description = "Mensaje de campaña para Lumio"
    _order = "sequence, id"
    _rec_name = "title"
    _check_company_auto = True

    title = fields.Char("Título público", required=True, translate=True)
    message = fields.Text("Mensaje público", translate=True)
    action_label = fields.Char("Texto del enlace", translate=True)
    action_url = fields.Char("Destino del enlace", help="Ruta de Lumio desde / o URL pública HTTP(S). No uses rutas /shop de Odoo para artículos de Lumio.")
    sequence = fields.Integer("Orden", default=10)
    active = fields.Boolean("Activo", default=True)
    is_published = fields.Boolean("Publicado", default=False)
    website_id = fields.Many2one("website", string="Sitio web", required=True, ondelete="cascade", check_company=True)
    company_id = fields.Many2one(related="website_id.company_id", store=True, readonly=True)
    starts_at = fields.Datetime("Publicar desde")
    ends_at = fields.Datetime("Publicar hasta", help="A partir de este instante deja de publicarse. Fechas mostradas en tu zona horaria y almacenadas en UTC.")
    utm_campaign_id = fields.Many2one("utm.campaign", string="Campaña UTM", ondelete="set null", help="Asociación opcional para organizar la campaña; no añade parámetros UTM automáticamente.")

    @api.constrains("title", "message", "action_label", "action_url", "starts_at", "ends_at")
    def _validate_content(self):
        for slide in self:
            for field, maximum, required in [("title", 120, True), ("message", 500, False), ("action_label", 80, False), ("action_url", 2048, False)]:
                value = slide[field] or ""
                if len(value) > maximum or (required and not value.strip()) or (value and not value.strip()) or any((ord(c) < 32 and c != "\n") or 127 <= ord(c) <= 159 for c in value):
                    raise ValidationError(f"{slide._fields[field].string}: contenido vacío, inválido o demasiado extenso (máximo {maximum}).")
            if bool(slide.action_label) != bool(slide.action_url):
                raise ValidationError("Completa el texto y el destino del enlace, o deja ambos vacíos.")
            if slide.starts_at and slide.ends_at and slide.starts_at >= slide.ends_at:
                raise ValidationError("El final de la publicación debe ser posterior al inicio.")
            if slide.action_url:
                value = slide.action_url
                try:
                    url = urlsplit(value)
                    internal = value.startswith("/") and not value.startswith("//") and not url.netloc and not url.scheme
                    external = url.scheme.lower() in ("http", "https") and bool(url.hostname) and not url.username and not url.password
                    valid = (internal or external) and "\\" not in value and not any(c.isspace() for c in value)
                except ValueError:
                    valid = False
                if not valid:
                    raise ValidationError("El destino debe ser una ruta desde / o una URL HTTP(S) sin credenciales.")
