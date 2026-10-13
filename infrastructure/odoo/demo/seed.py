"""One-off, idempotent fixture for the isolated lumio_demo database, executed via Odoo shell.

Runtime catalog access remains read-only; this script is never invoked by lm-core.
All secrets are read/written through the ignored local mount, never printed.
"""
import base64
import datetime
import io
import json
from pathlib import Path
from PIL import Image, ImageDraw
from odoo import Command
import sys
sys.path.insert(0, '/mnt/lumio-demo')
from configure_identity import configure_identity

if env.cr.dbname != 'lumio_demo':
    raise RuntimeError('Refusing to seed any database other than lumio_demo')

private = Path('/mnt/lumio-local')
settings = json.loads((private / 'bootstrap-input.json').read_text())

def record(model, name, values):
    key = 'lumio_local_demo.' + name
    existing = env.ref(key, raise_if_not_found=False)
    if existing:
        if existing._name != model:
            raise RuntimeError('Demo external ID belongs to an unexpected model')
        existing.write(values)
        return existing
    result = env[model].create(values)
    env['ir.model.data'].create({'module':'lumio_local_demo', 'name':name, 'model':model, 'res_id':result.id, 'noupdate':True})
    return result

company = env.ref('base.main_company')
currency = env.ref('base.GTQ')
currency.active = True
company.write({'name':'Lumio', 'currency_id':currency.id})
website = env['website'].search([('company_id','=',company.id)],limit=1)
website.write({'name':'Lumio', 'domain':'http://localhost:8069'})
warehouse = record('stock.warehouse','warehouse',{'name':'Almacén demo Lumio','code':'LMD','company_id':company.id})
pricelist = record('product.pricelist','pricelist',{'name':'Tarifa demo Lumio','currency_id':currency.id,'company_id':company.id,'active':True,'website_id':website.id,'selectable':True})
if 'pricelist_ids' in website._fields:
    website.pricelist_ids = [Command.link(pricelist.id)]

categories = {}
for key, label in [('ropa','Ropa'),('accesorios','Accesorios'),('hogar','Hogar'),('servicios','Servicios')]:
    categories[key] = record('product.public.category','category_'+key,{'name':label,'website_id':website.id})

size = record('product.attribute','size',{'name':'Talla','create_variant':'always'})
sizes = [record('product.attribute.value','size_'+value.lower(),{'name':value,'attribute_id':size.id}) for value in ['M','L']]
color = record('product.attribute','color',{'name':'Color','create_variant':'always'})
colors = [record('product.attribute.value','color_'+key,{'name':label,'attribute_id':color.id}) for key,label in [('azul','Azul'),('natural','Natural')]]

def fixture_image(label, rgb):
    # Explicitly illustrative catalog fixture, not a commercial product photograph.
    image = Image.new('RGB',(900,1100),'#f3f4f1')
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((190,250,710,790),radius=45,fill=rgb)
    draw.text((40,35),'LUMIO DEMO - IMAGEN DE PRUEBA',fill='#191f1d',font_size=28)
    draw.text((40,1020),label,fill='#191f1d',font_size=26)
    output=io.BytesIO(); image.save(output,format='PNG')
    return base64.b64encode(output.getvalue()).decode()

products = [
    ('camiseta','Camiseta de algodón demo','ropa',125,109,True),
    ('sudadera','Sudadera ligera demo','ropa',260,239,True),
    ('bolso','Bolso de lona demo','accesorios',180,169,True),
    ('botella','Botella reutilizable demo','accesorios',95,85,True),
    ('libreta','Libreta demo','accesorios',45,39,True),
    ('taza','Taza de cerámica demo','hogar',70,65,True),
    ('lampara','Lámpara de escritorio demo','hogar',350,329,True),
    ('cojin','Cojín demo','hogar',120,109,True),
    ('organizador','Organizador demo','hogar',85,79,True),
    ('mantel','Mantel demo','hogar',160,149,True),
    ('bandeja','Bandeja demo','hogar',110,99,True),
    ('vaso','Vaso demo','hogar',55,49,True),
    ('gorra','Gorra demo','ropa',90,79,True),
    ('asesoria','Asesoría personalizada demo','servicios',90,75,False),
]
templates = {}
variant_count = 0
for index,(key,name,category,base_price,sale_price,storable) in enumerate(products):
    values={'name':name,'type':'consu' if storable else 'service','is_storable':storable,'sale_ok':True,'active':True,
        'company_id':company.id,'website_id':website.id,'is_published':True,'public_categ_ids':[Command.set([categories[category].id])],
        'list_price':base_price,'website_description':f'<p>{name}. Artículo de ejemplo para probar catálogo, precios y disponibilidad de Lumio.</p>'}
    if storable:
        values['image_1920']=fixture_image(name,('#5365b9','#337d72','#a46b44','#84749e')[index%4])
    template=record('product.template',key,values)
    templates[key]=template
    if key=='camiseta':
        record('product.template.attribute.line','shirt_sizes',{'product_tmpl_id':template.id,'attribute_id':size.id,'value_ids':[Command.set([v.id for v in sizes])]})
        record('product.template.attribute.line','shirt_colors',{'product_tmpl_id':template.id,'attribute_id':color.id,'value_ids':[Command.set([v.id for v in colors])]})
        template.attribute_line_ids.product_template_value_ids.filtered(lambda v:v.name=='L').write({'price_extra':20})
    for variant in template.product_variant_ids:
        variant_count += 1
        large=any(v.name=='L' for v in variant.product_template_attribute_value_ids)
        variant.write({'default_code':'LM-DEMO-'+key.upper()+'-'+str(variant.id)})
        record('product.pricelist.item','price_'+str(variant.id),{'pricelist_id':pricelist.id,'applied_on':'0_product_variant','product_id':variant.id,'compute_price':'fixed','fixed_price':sale_price+(20 if large else 0)})
        if storable:
            quantity=0 if key=='lampara' or (key=='camiseta' and large and any(v.name=='Natural' for v in variant.product_template_attribute_value_ids)) else 12
            current=env['stock.quant']._get_available_quantity(variant,warehouse.lot_stock_id,strict=True)
            if quantity != current:
                env['stock.quant']._update_available_quantity(variant,warehouse.lot_stock_id,quantity-current)

record('product.template','unpublished',{'name':'Producto interno demo (no publicado)','type':'consu','sale_ok':True,'is_published':False,'company_id':company.id,'website_id':website.id,'list_price':999})

record('lumio.campaign.slide','campaign_clothing',{'title':'Explora la ropa de la tienda demo','message':'Prueba talla, color y disponibilidad desde los productos publicados en Odoo.','action_label':'Ver ropa','action_url':'/?category=category-'+str(categories['ropa'].id),'website_id':website.id,'sequence':10,'is_published':True})
record('lumio.campaign.slide','campaign_service',{'title':'Productos y servicios en un solo catálogo','message':'La asesoría de ejemplo se consulta con la misma lista de pedido.','action_label':'Ver servicios','action_url':'/?category=category-'+str(categories['servicios'].id),'website_id':website.id,'sequence':20,'is_published':True})
record('lumio.campaign.slide','campaign_draft',{'title':'Borrador demo: no debe aparecer','website_id':website.id,'sequence':30,'is_published':False})

admin=env.ref('base.user_admin')
admin.write({'login':settings['admin_login'],'password':settings['admin_password'],'group_ids':[Command.link(env.ref('lumio_campaign.group_campaign_manager').id)]})
read_group=record('res.groups','catalog_reader',{'name':'Lumio Demo: catálogo solo lectura','implied_ids':[Command.link(env.ref('base.group_user').id)],'api_key_duration':90})
read_models=['website','stock.warehouse','product.pricelist','product.pricelist.item','res.currency','product.template','product.product',
    'product.public.category','product.template.attribute.value','product.template.attribute.line','product.attribute','product.attribute.value','product.image',
    'stock.quant','stock.move','stock.location','stock.picking','stock.picking.type']
for model in read_models:
    model_record=env['ir.model']._get(model)
    record('ir.model.access','read_'+model.replace('.','_'),{'name':'Lumio demo read '+model,'model_id':model_record.id,'group_id':read_group.id,'perm_read':True,'perm_write':False,'perm_create':False,'perm_unlink':False})
user=record('res.users','integration_user',{'name':'Lumio catálogo local','login':'lumio-catalog-local','company_id':company.id,'company_ids':[Command.set([company.id])],
    'group_ids':[Command.set([read_group.id,env.ref('lumio_campaign.group_campaign_reader').id])],'notification_type':'inbox'})
keys=env['res.users.apikeys'].with_user(user)
key=settings.get('existing_api_key')
if not key or keys._check_credentials(scope='rpc',key=key) != user.id:
    key=keys._generate('rpc','Lumio demo local',datetime.datetime.now()+datetime.timedelta(days=89))

# Demo fixtures never send external mail, create customer orders or contact WhatsApp.
env['ir.mail_server'].search([]).write({'active':False})
env['ir.config_parameter'].set_param('web.base.url','http://localhost:8069')
env['ir.config_parameter'].set_param('web.base.url.freeze','True')
configure_identity(env, settings)
env.cr.commit()
result={'website_id':website.id,'pricelist_id':pricelist.id,'warehouse_id':warehouse.id,'api_key':key,'products':len(products),'variants':variant_count}
path=private/'catalog-settings.json'
path.write_text(json.dumps(result),encoding='utf-8');path.chmod(0o600)
print(f'Demo preparada: {len(products)} artículos publicados, {variant_count} variantes, 4 categorías y 2 campañas. Credenciales escritas solo en el archivo privado.')
