package dev.lumio.core.infrastructure.providers.odoo;

import dev.lumio.core.application.*;
import dev.lumio.core.domain.*;
import java.math.*;
import java.text.Normalizer;
import java.time.LocalDate;
import java.util.*;
import org.jsoup.Jsoup;
import tools.jackson.databind.JsonNode;
import static dev.lumio.core.infrastructure.providers.odoo.OdooJson2Client.failure;

/** Read-only translation boundary: no Odoo records escape into the domain. */
public final class OdooCatalogProvider implements CatalogProvider {
    private final OdooJson2Client client;
    private final OdooSettings settings;
    private final CatalogBranding branding;
    private final boolean campaignsEnabled;
    public OdooCatalogProvider(OdooJson2Client client, OdooSettings settings) { this(client, settings, CatalogBranding.DEFAULT); }
    public OdooCatalogProvider(OdooJson2Client client, OdooSettings settings, CatalogBranding branding) { this(client, settings, branding, false); }
    public OdooCatalogProvider(OdooJson2Client client, OdooSettings settings, CatalogBranding branding, boolean campaignsEnabled) {
        this.client = client; this.settings = settings; this.branding = branding; this.campaignsEnabled = campaignsEnabled;
    }

    @Override public List<CampaignSlide> campaigns() {
        if (!campaignsEnabled) return List.of();
        var context = context(); website(context);
        return new OdooCampaignReader(client, settings.websiteId(), java.time.Clock.systemUTC()).read(context);
    }

    private Map<String,Object> context() {
        return new HashMap<>(Map.of("lang", settings.language(), "website_id", settings.websiteId(), "warehouse_id", settings.warehouseId(),
            "pricelist", settings.pricelistId(), "quantity", 1, "date", LocalDate.now().toString(), "bin_size", true));
    }
    private JsonNode read(String model, int id, Map<String,Object> context, String... fields) {
        return client.readOne(model, id, client.requireFields(model, context, fields), context);
    }
    private JsonNode website(Map<String,Object> context) {
        var website = read("website", settings.websiteId(), context, "id", "name", "company_id");
        int company = relation(website.get("company_id"));
        if (company <= 0) throw failure("CONFIGURATION", "El sitio Odoo debe pertenecer a una compañía.");
        context.put("allowed_company_ids", List.of(company)); context.put("company_id", company);
        return website;
    }
    private List<String> fields(String model, Map<String,Object> context, List<String> optional, String... required) {
        var result = client.requireFields(model, context, required);
        var schema = client.fields(model, context);
        optional.stream().filter(schema::has).forEach(result::add);
        return result;
    }
    @Override public Catalog catalog() {
        try {
            var context = context(); var website = website(context);
            var warehouse = read("stock.warehouse", settings.warehouseId(), context, "id", "company_id");
            var pricelist = read("product.pricelist", settings.pricelistId(), context, "id", "company_id", "currency_id", "active");
            int company = relation(website.get("company_id"));
            if (relation(warehouse.get("company_id")) != company || (relation(pricelist.get("company_id")) != 0 && relation(pricelist.get("company_id")) != company)
                || !pricelist.path("active").asBoolean()) throw failure("CONFIGURATION", "Sitio, almacén y tarifa Odoo deben corresponder a la misma compañía y la tarifa debe estar activa.");
            if (client.fields("product.pricelist", context).has("website_id")) {
                int site = relation(read("product.pricelist", settings.pricelistId(), context, "id", "website_id").get("website_id"));
                if (site != 0 && site != settings.websiteId()) throw failure("CONFIGURATION", "La tarifa pertenece a otro sitio Odoo.");
            }
            var currency = read("res.currency", relation(pricelist.get("currency_id")), context, "id", "name", "decimal_places", "rounding", "active");
            if (!currency.path("active").asBoolean()) throw failure("CONFIGURATION", "La moneda de la tarifa está inactiva.");
            if (!currency.path("decimal_places").isIntegralNumber() || !currency.path("decimal_places").canConvertToInt())
                throw failure("PRICE", "Los decimales de la moneda Odoo deben ser enteros.");
            int decimals = currency.path("decimal_places").intValue();
            BigDecimal rounding = number(currency.get("rounding"));
            if (decimals < 0 || decimals > 6 || rounding.signum() <= 0 || rounding.movePointRight(decimals).stripTrailingZeros().scale() > 0)
                throw failure("PRICE", "La precisión monetaria Odoo no puede representarse en unidades menores.");
            var categoryFields = fields("product.public.category", context, List.of("website_description"), "id", "name", "website_id", "parent_id");
            var categoryRecords = client.search("product.public.category", siteDomain(), categoryFields, context);
            var visibleCategoryIds=new HashSet<>(categoryRecords.stream().map(OdooCatalogProvider::id).toList());
            var categories = categoryRecords.stream().map(c -> new Category("category-" + id(c), slug(text(c,"name"),id(c)), text(c,"name"), description(c),
                visibleCategoryIds.contains(relation(c.get("parent_id"))) ? "category-"+relation(c.get("parent_id")) : null)).toList();
            var categoryIds = new HashSet<>(categories.stream().map(Category::id).toList());
            var templateFields = fields("product.template", context, List.of("website_description", "description_sale", "image_128", "product_template_image_ids", "attribute_line_ids", "combo_ids"),
                "id", "name", "type", "active", "sale_ok", "is_published", "website_id", "public_categ_ids", "company_id");
            var domain = new ArrayList<Object>(List.of(List.of("active","=",true), List.of("sale_ok","=",true),
                List.of("is_published","=",true)));
            domain.addAll(siteDomain()); domain.addAll(List.of("|",List.of("company_id","=",false),List.of("company_id","=",company)));
            var templates = client.search("product.template", domain, templateFields, context);
            var templateIds = templates.stream().map(OdooCatalogProvider::id).toList();
            var variantFields = fields("product.product", context, List.of("image_variant_128"), "id", "display_name", "active", "product_tmpl_id", "product_template_attribute_value_ids", "is_storable", "free_qty", "uom_id");
            if (settings.stockPolicy() == OdooSettings.StockPolicy.WEBSITE) variantFields.addAll(client.requireFields("product.product",context,"allow_out_of_stock_order"));
            var variants = templateIds.isEmpty() ? List.<JsonNode>of() : client.search("product.product",List.of(List.of("active","=",true),List.of("product_tmpl_id","in",templateIds)),variantFields,context);
            var lines = templates.stream().anyMatch(template -> template.has("attribute_line_ids")) && !templateIds.isEmpty()
                ? client.search("product.template.attribute.line",List.of(List.of("product_tmpl_id","in",templateIds)),
                    client.requireFields("product.template.attribute.line",context,"id","product_tmpl_id","product_template_value_ids"),context) : List.<JsonNode>of();
            var valueIds = java.util.stream.Stream.concat(variants.stream().flatMap(v -> ids(v.get("product_template_attribute_value_ids")).stream()),
                lines.stream().flatMap(line -> ids(line.get("product_template_value_ids")).stream())).distinct().toList();
            var values = valueIds.isEmpty() ? List.<JsonNode>of() : client.search("product.template.attribute.value", List.of(List.of("id","in",valueIds)),fields("product.template.attribute.value",context,List.of("ptav_active","image"),"id","name","attribute_id"),context);
            var attributeIds = values.stream().map(v -> relation(v.get("attribute_id"))).distinct().toList();
            var attributeFields = attributeIds.isEmpty() ? List.<String>of() : fields("product.attribute",context,List.of("visibility"),"id","name");
            var attributes = attributeIds.isEmpty() ? List.<JsonNode>of() : client.search("product.attribute",List.of(List.of("id","in",attributeIds)),attributeFields,context);
            var attributeNames = new HashMap<Integer,String>(); attributes.forEach(a -> attributeNames.put(id(a),text(a,"name")));
            var visibleAttributes = new HashSet<Integer>();
            for (var attribute:attributes) {
                var visibility=text(attribute,"visibility");
                if (attributeFields.contains("visibility") && !Set.of("visible","hidden").contains(visibility))
                    throw failure("PROTOCOL","Odoo devolvió una visibilidad de atributo desconocida.");
                if (!visibility.equals("hidden")) visibleAttributes.add(id(attribute));
            }
            var valueMap = new HashMap<Integer,VariantAttribute>();
            values.forEach(v -> valueMap.put(id(v),new VariantAttribute(Objects.requireNonNull(attributeNames.get(relation(v.get("attribute_id")))),text(v,"name"))));
            var filterableValues = new HashSet<Integer>();
            values.stream().filter(value -> visibleAttributes.contains(relation(value.get("attribute_id"))) && (!value.has("ptav_active") || value.path("ptav_active").asBoolean()))
                .forEach(value -> filterableValues.add(id(value)));
            var variantTemplates = new HashMap<Integer,Integer>(); variants.forEach(v -> variantTemplates.put(id(v),relation(v.get("product_tmpl_id"))));
            var extras = templates.stream().anyMatch(t -> t.has("product_template_image_ids")) && !templateIds.isEmpty()
                ? client.search("product.image",List.of("|",List.of("product_tmpl_id","in",templateIds),List.of("product_variant_id","in",new ArrayList<>(variantTemplates.keySet()))),client.requireFields("product.image",context,"id","name","product_tmpl_id","product_variant_id","image_128"),context) : List.<JsonNode>of();
            var items = new ArrayList<CatalogItem>();
            var comboGroups = new OdooComboReader(client,settings).read(templates,context,relation(pricelist.get("currency_id")),rounding,decimals);
            for (var template : templates) {
                var itemVariants = new ArrayList<CatalogVariant>(); var images = new ArrayList<CatalogImage>();
                if (hasImage(template,"image_128")) images.add(image("template",id(template),text(template,"name")));
                for (var variant : variants) if (relation(variant.get("product_tmpl_id")) == id(template)) {
                    var priceContext = new HashMap<>(context); priceContext.put("uom",relation(variant.get("uom_id")));
                    var price = client.call("product.product","get_contextual_price",Map.of("ids",List.of(id(variant))),priceContext);
                    boolean available = !variant.path("is_storable").asBoolean() || number(variant.get("free_qty")).compareTo(BigDecimal.ONE) >= 0
                        || settings.stockPolicy() == OdooSettings.StockPolicy.WEBSITE && variant.path("allow_out_of_stock_order").asBoolean();
                    var attrs = ids(variant.get("product_template_attribute_value_ids")).stream().map(valueMap::get).map(Objects::requireNonNull).toList();
                    var variantImages = new ArrayList<CatalogImage>();
                    if (hasImage(variant,"image_variant_128")) variantImages.add(image("variant",id(variant),text(variant,"display_name")));
                    else if (hasImage(template,"image_128")) variantImages.add(image("template",id(template),text(template,"name")));
                    for (var extra:extras) if (hasImage(extra,"image_128") && (relation(extra.get("product_variant_id")) == id(variant)
                        || relation(extra.get("product_variant_id")) == 0 && relation(extra.get("product_tmpl_id")) == id(template)))
                        variantImages.add(image("extra",id(extra),text(extra,"name")));
                    itemVariants.add(new CatalogVariant("variant-"+id(variant),slug(text(variant,"display_name"),id(variant)),text(variant,"display_name"),attrs,minor(price,rounding,decimals),available,variantImages));
                    if (hasImage(variant,"image_variant_128")) images.add(image("variant",id(variant),text(variant,"display_name")));
                }
                if (itemVariants.isEmpty()) continue; // Only materialized, active combinations can be ordered.
                for (var extra : extras) if ((relation(extra.get("product_tmpl_id")) == id(template)
                    || variantTemplates.getOrDefault(relation(extra.get("product_variant_id")),0) == id(template)) && hasImage(extra,"image_128")) {
                    int variant = relation(extra.get("product_variant_id"));
                    if (variant == 0 || itemVariants.stream().anyMatch(v -> v.id().equals("variant-"+variant))) images.add(image("extra",id(extra),text(extra,"name")));
                }
                var classification = new ArrayList<VariantAttribute>();
                lines.stream().filter(line -> relation(line.get("product_tmpl_id")) == id(template))
                    .flatMap(line -> ids(line.get("product_template_value_ids")).stream()).filter(filterableValues::contains)
                    .map(valueMap::get).map(Objects::requireNonNull).forEach(classification::add);
                variants.stream().filter(variant -> relation(variant.get("product_tmpl_id")) == id(template))
                    .flatMap(variant -> ids(variant.get("product_template_attribute_value_ids")).stream()).filter(filterableValues::contains)
                    .map(valueMap::get).map(Objects::requireNonNull).forEach(classification::add);
                var groups=comboGroups.getOrDefault(id(template),List.of());
                boolean componentsAvailable=ComboAvailability.canConfigure(groups);
                items.add(new CatalogItem("item-"+id(template),slug(text(template,"name"),id(template)),text(template,"name"),description(template),
                    ids(template.get("public_categ_ids")).stream().map(i -> "category-"+i).filter(categoryIds::contains).toList(),images,
                    componentsAvailable && itemVariants.stream().anyMatch(CatalogVariant::available),itemVariants,
                    text(template,"type").equals("combo") ? CatalogItemType.COMBO : text(template,"type").equals("service") ? CatalogItemType.SERVICE : CatalogItemType.PRODUCT,
                    classification.stream().distinct().toList(),groups));
            }
            var logoFields = fields("website", context, List.of("logo"), "id");
            var logo = client.readOne("website", settings.websiteId(), logoFields, context);
            var catalogBranding = new CatalogBranding(logoFields.contains("logo") && hasImage(logo,"logo") ? "/catalog-media/logo/" + settings.websiteId() : branding.logoUrl(), branding.primaryColor());
            var publishedValues=new HashSet<VariantAttribute>();items.forEach(item -> publishedValues.addAll(item.attributes()));
            var attributeImages=new LinkedHashMap<VariantAttribute,CatalogAttributeImage>();
            for(var value:values) {
                var attribute=valueMap.get(id(value));
                if(filterableValues.contains(id(value)) && publishedValues.contains(attribute) && hasImage(value,"image"))
                    attributeImages.putIfAbsent(attribute,new CatalogAttributeImage(attribute.name(),attribute.value(),image("attribute",id(value),attribute.value())));
            }
            var catalog = new Catalog(settings.businessName().isBlank() ? text(website,"name") : settings.businessName(), settings.businessDescription(),
                text(currency,"name"),decimals,settings.whatsappNumber(),categories,items,catalogBranding,new ArrayList<>(attributeImages.values()));
            CatalogValidator.validate(catalog); return catalog;
        } catch (CatalogUnavailableException ex) { throw ex; }
        catch (IllegalArgumentException | NullPointerException | ArithmeticException ex) { throw failure("MAPPING", "Los datos Odoo no cumplen el contrato del catálogo; revisa identificadores, atributos y valores monetarios."); }
    }
    private List<Object> siteDomain() { return List.of("|",List.of("website_id","=",false),List.of("website_id","=",settings.websiteId())); }
    static int minor(JsonNode price, BigDecimal rounding, int decimals) {
        var amount = number(price);
        if (amount.signum() < 0) throw failure("PRICE", "Odoo devolvió un precio negativo.");
        try { return amount.divide(rounding,0,RoundingMode.HALF_UP).multiply(rounding).movePointRight(decimals).intValueExact(); }
        catch (ArithmeticException ex) { throw failure("PRICE", "El precio Odoo excede el rango de unidades menores enteras."); }
    }
    private static BigDecimal number(JsonNode node) {
        if (node == null || !node.isNumber()) throw failure("PROTOCOL", "Odoo devolvió un valor numérico inválido.");
        return node.decimalValue();
    }
    private static int id(JsonNode record) { int id = relation(record.get("id")); if(id <= 0) throw failure("PROTOCOL","Odoo devolvió un identificador inválido."); return id; }
    private static int relation(JsonNode node) { if(node == null || node.isBoolean()) return 0; if(node.isArray()) node=node.get(0); if(node == null || !node.isIntegralNumber() || !node.canConvertToInt()) throw failure("PROTOCOL","Odoo devolvió una referencia inválida."); return node.intValue(); }
    private static List<Integer> ids(JsonNode node) {
        if(node == null || !node.isArray()) throw failure("PROTOCOL","Odoo devolvió referencias inválidas.");
        var result=new ArrayList<Integer>();
        node.forEach(n -> { int value=relation(n); if(value<=0 || result.contains(value)) throw failure("PROTOCOL","Odoo devolvió referencias inválidas o repetidas."); result.add(value); });
        return result;
    }
    private static String text(JsonNode node,String field) { var value=node.get(field); return value != null && value.isString() ? value.stringValue().strip() : ""; }
    private static String description(JsonNode node) { String value=text(node,"website_description"); if(value.isBlank()) value=text(node,"description_sale"); var document=Jsoup.parse(value); document.select("script,style").remove(); return document.text(); }
    private static String slug(String name,int id) { String base=Normalizer.normalize(name,Normalizer.Form.NFD).replaceAll("\\p{M}+","").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+","-").replaceAll("^-|-$",""); return (base.isBlank()?"articulo":base)+"-"+id; }
    private static boolean hasImage(JsonNode node,String field) { return !text(node,field).isBlank(); }
    private static CatalogImage image(String kind,int id,String alt) { return new CatalogImage("/catalog-media/"+kind+"/"+id,alt); }

    public record Image(byte[] bytes,String contentType) {}
    public Image image(String kind,int id) {
        if (kind.equals("logo")) {
            if (id != settings.websiteId()) throw new ImageNotFoundException();
            var context = context(); website(context); context.put("bin_size",false);
            return decodeImage(text(read("website",id,context,"id","logo"),"logo"),true);
        }
        String model=switch(kind) { case "template" -> "product.template"; case "variant" -> "product.product"; case "extra" -> "product.image"; case "attribute" -> "product.template.attribute.value"; default -> throw new ImageNotFoundException(); };
        if(id <= 0) throw new ImageNotFoundException();
        var context=context(); website(context);
        int templateId=id;
        if(kind.equals("attribute")) {
            var record=client.readOne(model,id,fields(model,context,List.of("ptav_active"),"id","product_tmpl_id","attribute_id"),context);
            if(record.has("ptav_active") && !record.path("ptav_active").asBoolean())throw new ImageNotFoundException();
            var attribute=client.readOne("product.attribute",relation(record.get("attribute_id")),fields("product.attribute",context,List.of("visibility"),"id"),context);
            if(attribute.has("visibility") && !text(attribute,"visibility").equals("visible"))throw new ImageNotFoundException();
            templateId=relation(record.get("product_tmpl_id"));
        } else if(!kind.equals("template")) {
            var record=read(model,id,context,"id","product_tmpl_id",kind.equals("variant")?"active":"product_variant_id");
            if(kind.equals("variant") && !record.path("active").asBoolean()) throw new ImageNotFoundException();
            templateId=relation(record.get("product_tmpl_id"));
            if(kind.equals("extra") && relation(record.get("product_variant_id")) != 0) {
                var variant=read("product.product",relation(record.get("product_variant_id")),context,"id","active","product_tmpl_id");
                if(!variant.path("active").asBoolean() || templateId != 0 && templateId != relation(variant.get("product_tmpl_id"))) throw new ImageNotFoundException();
                templateId=relation(variant.get("product_tmpl_id"));
            }
        }
        var template=read("product.template",templateId,context,"id","active","sale_ok","is_published","website_id","company_id");
        int site=relation(template.get("website_id")); int company=relation(template.get("company_id"));
        if(!template.path("active").asBoolean() || !template.path("sale_ok").asBoolean() || !template.path("is_published").asBoolean()
            || site != 0 && site != settings.websiteId() || company != 0 && company != (int)context.get("company_id")) throw new ImageNotFoundException();
        context.put("bin_size",false);
        String imageField=kind.equals("attribute")?"image":"image_1024";
        String encoded=text(read(model,id,context,"id",imageField),imageField);
        return decodeImage(encoded,kind.equals("attribute"));
    }
    private Image decodeImage(String encoded, boolean allowSvg) {
        if(encoded.isEmpty()) throw new ImageNotFoundException();
        if(encoded.length() > (long)settings.maxImageBytes()*4/3+4) throw failure("LIMIT","La imagen Odoo excede el límite configurado.");
        byte[] bytes;
        try { bytes=Base64.getDecoder().decode(encoded); } catch(IllegalArgumentException ex) { throw failure("PROTOCOL","Odoo devolvió una imagen inválida."); }
        if(bytes.length > settings.maxImageBytes()) throw failure("LIMIT","La imagen Odoo excede el límite configurado.");
        String mime= bytes.length>=3 && bytes[0]==(byte)0xff && bytes[1]==(byte)0xd8 && bytes[2]==(byte)0xff ? "image/jpeg"
            : bytes.length>=8 && Arrays.equals(Arrays.copyOf(bytes,8),new byte[]{(byte)137,80,78,71,13,10,26,10}) ? "image/png"
            : bytes.length>=6 && (new String(bytes,0,6,java.nio.charset.StandardCharsets.US_ASCII).equals("GIF89a") || new String(bytes,0,6,java.nio.charset.StandardCharsets.US_ASCII).equals("GIF87a")) ? "image/gif"
            : bytes.length>=12 && new String(bytes,0,4,java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF") && new String(bytes,8,4,java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP") ? "image/webp" : null;
        if(mime == null && allowSvg && OdooLogoSvg.isSafe(bytes)) mime = "image/svg+xml";
        if(mime==null) throw failure("PROTOCOL","Formato de imagen Odoo no admitido o logo SVG no seguro.");
        return new Image(bytes,mime);
    }
    public static final class ImageNotFoundException extends RuntimeException {}
}

