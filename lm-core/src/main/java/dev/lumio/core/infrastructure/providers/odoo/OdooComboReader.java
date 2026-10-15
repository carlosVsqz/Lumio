package dev.lumio.core.infrastructure.providers.odoo;

import dev.lumio.core.domain.*;
import java.math.*;
import java.util.*;
import tools.jackson.databind.JsonNode;
import static dev.lumio.core.infrastructure.providers.odoo.OdooJson2Client.failure;

/** Batched, read-only mapping of Odoo combo choices, including unpublished components. */
final class OdooComboReader {
    private final OdooJson2Client client;
    private final OdooSettings settings;
    OdooComboReader(OdooJson2Client client, OdooSettings settings) { this.client=client; this.settings=settings; }

    Map<Integer,List<ComboGroup>> read(List<JsonNode> templates, Map<String,Object> context, int currencyId, BigDecimal rounding, int decimals) {
        var parents=templates.stream().filter(t -> text(t,"type").equals("combo")).toList();
        if (parents.isEmpty()) return Map.of();
        client.requireFields("product.template", context, "combo_ids");
        var groupIds=parents.stream().flatMap(t -> ids(t.path("combo_ids")).stream()).distinct().toList();
        if (groupIds.isEmpty()) throw failure("MAPPING","Odoo devolvió un combo sin grupos de componentes.");
        var groups=search("product.combo", "id", groupIds, context, "id","name","combo_item_ids","company_id");
        var optionIds=groups.stream().flatMap(g -> ids(g.path("combo_item_ids")).stream()).distinct().toList();
        var options=optionIds.isEmpty()?List.<JsonNode>of():search("product.combo.item","id",optionIds,context,"id","combo_id","product_id","extra_price","currency_id");
        var componentContext=new HashMap<>(context); componentContext.put("active_test",false);
        var componentIds=options.stream().map(o -> ref(o.path("product_id"))).distinct().toList();
        var componentFields=new ArrayList<>(List.of("id","display_name","active","sale_ok","company_id","type","product_template_attribute_value_ids","is_storable","free_qty"));
        if (settings.stockPolicy()==OdooSettings.StockPolicy.WEBSITE) componentFields.add("allow_out_of_stock_order");
        var components=componentIds.isEmpty()?List.<JsonNode>of():search("product.product","id",componentIds,componentContext,componentFields.toArray(String[]::new));
        var valueIds=components.stream().flatMap(c -> ids(c.path("product_template_attribute_value_ids")).stream()).distinct().toList();
        var values=valueIds.isEmpty()?List.<JsonNode>of():search("product.template.attribute.value","id",valueIds,componentContext,"id","name","attribute_id");
        var attributeIds=values.stream().map(v -> ref(v.path("attribute_id"))).distinct().toList();
        var attributes=attributeIds.isEmpty()?List.<JsonNode>of():search("product.attribute","id",attributeIds,componentContext,"id","name");
        var attributeNames=new HashMap<Integer,String>(); attributes.forEach(a -> attributeNames.put(ref(a.path("id")),text(a,"name")));
        var valueMap=new HashMap<Integer,VariantAttribute>();
        values.forEach(v -> valueMap.put(ref(v.path("id")),new VariantAttribute(Objects.requireNonNull(attributeNames.get(ref(v.path("attribute_id")))),text(v,"name"))));
        var products=index(components); var choices=index(options); var groupMap=index(groups);
        var rates=new HashMap<Integer,BigDecimal>();
        var result=new HashMap<Integer,List<ComboGroup>>();
        for (var parent:parents) {
            var mapped=new ArrayList<ComboGroup>();
            for (int groupId:ids(parent.path("combo_ids"))) {
                var group=groupMap.get(groupId);
                if (group==null) throw failure("ACCESS","No se pudo leer un grupo del combo Odoo; revisa permisos y compañía.");
                checkCompany(group,context);
                var mappedOptions=new ArrayList<ComboOption>();
                for (int optionId:ids(group.path("combo_item_ids"))) {
                    var option=choices.get(optionId);
                    if (option==null || ref(option.path("combo_id"))!=groupId) throw failure("MAPPING","Referencia de opción de combo Odoo inválida.");
                    var component=products.get(ref(option.path("product_id")));
                    if (component==null) throw failure("ACCESS","No se pudo leer un componente del combo Odoo; revisa permisos y compañía.");
                    checkCompany(component,context);
                    boolean unlimited=!component.path("is_storable").asBoolean()
                        || settings.stockPolicy()==OdooSettings.StockPolicy.WEBSITE && component.path("allow_out_of_stock_order").asBoolean();
                    Integer maximum=unlimited?null:number(component.path("free_qty")).max(BigDecimal.ZERO)
                        .min(BigDecimal.valueOf(Integer.MAX_VALUE)).setScale(0,RoundingMode.DOWN).intValueExact();
                    boolean available=component.path("active").asBoolean() && component.path("sale_ok").asBoolean()
                        && !text(component,"type").equals("combo") && (maximum==null || maximum>0);
                    var extra=number(option.path("extra_price")); int sourceCurrency=ref(option.path("currency_id"));
                    if (sourceCurrency!=currencyId && extra.signum()!=0) {
                        var sourceRate=rate(sourceCurrency,context,rates); var targetRate=rate(currencyId,context,rates);
                        extra=extra.multiply(targetRate).divide(sourceRate,MathContext.DECIMAL128);
                    }
                    int minor;
                    try { minor=extra.divide(rounding,0,RoundingMode.HALF_UP).multiply(rounding).movePointRight(decimals).intValueExact(); }
                    catch (ArithmeticException ex) { throw failure("PRICE","El recargo del combo excede las unidades menores admitidas."); }
                    var attrs=ids(component.path("product_template_attribute_value_ids")).stream().map(valueMap::get).map(Objects::requireNonNull).toList();
                    mappedOptions.add(new ComboOption("option-"+optionId,"variant-"+ref(component.path("id")),text(component,"display_name"),attrs,minor,available,maximum));
                }
                mapped.add(new ComboGroup("group-"+groupId,text(group,"name"),mappedOptions));
            }
            result.put(ref(parent.path("id")),List.copyOf(mapped));
        }
        return result;
    }
    private BigDecimal rate(int id,Map<String,Object> context,Map<Integer,BigDecimal> rates) {
        return rates.computeIfAbsent(id, key -> {
            var row=client.readOne("res.currency",key,client.requireFields("res.currency",context,"id","rate","active"),context);
            var rate=number(row.path("rate"));
            if (!row.path("active").asBoolean() || rate.signum()<=0) throw failure("PRICE","La moneda del componente no tiene un tipo de cambio activo válido.");
            return rate;
        });
    }
    private List<JsonNode> search(String model,String field,List<Integer> ids,Map<String,Object> context,String... fields) {
        return client.search(model,List.of(List.of(field,"in",ids)),client.requireFields(model,context,fields),context);
    }
    private static void checkCompany(JsonNode row,Map<String,Object> context) {
        int company=ref(row.path("company_id"));
        if (company!=0 && company!=(int)context.get("company_id")) throw failure("CONFIGURATION","Un componente o grupo del combo pertenece a otra compañía.");
    }
    private static Map<Integer,JsonNode> index(List<JsonNode> rows) { var result=new HashMap<Integer,JsonNode>(); rows.forEach(row -> result.put(ref(row.path("id")),row)); return result; }
    private static String text(JsonNode row,String field) { var value=row.path(field); return value.isString()?value.stringValue().strip():""; }
    private static int ref(JsonNode value) { if(value.isBoolean() || value.isMissingNode() || value.isNull()) return 0; if(value.isArray()) value=value.get(0); if(!value.isIntegralNumber() || !value.canConvertToInt()) throw failure("PROTOCOL","Referencia de combo inválida."); return value.intValue(); }
    private static List<Integer> ids(JsonNode values) { if(!values.isArray()) throw failure("PROTOCOL","Lista de referencias de combo inválida."); var result=new ArrayList<Integer>(); values.forEach(v -> {int id=ref(v); if(id<=0 || result.contains(id)) throw failure("PROTOCOL","Referencia de combo duplicada o inválida."); result.add(id);}); return result; }
    private static BigDecimal number(JsonNode value) { if(!value.isNumber()) throw failure("PROTOCOL","Valor monetario o stock del combo inválido."); return value.decimalValue(); }
}
