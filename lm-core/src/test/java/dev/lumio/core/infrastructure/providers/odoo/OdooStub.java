package dev.lumio.core.infrastructure.providers.odoo;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** HTTP fixture for the actual WebClient/JSON-2 transport, never an ERP connection. */
public final class OdooStub implements AutoCloseable {
    private final HttpServer server;
    public final List<Request> requests = new CopyOnWriteArrayList<>();
    public volatile int status=200;
    public volatile int delayMs=0;
    public volatile String campaignRows="[]";
    public volatile boolean campaignSchemaAvailable=true;
    public volatile String price="12.345";
    public volatile boolean published=true;
    public volatile boolean backorder=false;
    public volatile boolean missingFreeQty=false;
    public volatile boolean malformed=false;
    public volatile boolean extraImage=false;
    public volatile boolean duplicateCombination=false;
    public volatile int company=7;
    public volatile int currencyDecimals=2;
    public volatile String logo="";
    public volatile boolean logoSchemaAvailable=true;
    public volatile boolean classification=false, classificationHidden=false;
    public volatile boolean comboProducts=false, onlyCombos=false;
    public volatile String comboExtra="5.00", sourceRate="2.0";
    public volatile int componentStock=3, comboCurrency=4, componentCompany=7;
    public volatile String currency="USD", rounding="0.01";
    public volatile String image=Base64.getEncoder().encodeToString(new byte[]{(byte)137,80,78,71,13,10,26,10});
    public record Request(String model,String method,JsonNode body,String authorization,String database) {}
    private final JsonMapper mapper=JsonMapper.builder().build();
    public OdooStub() throws java.io.IOException {
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/json/2/", exchange -> {
            String[] path=exchange.getRequestURI().getPath().split("/");
            var request=new Request(path[3],path[4],mapper.readTree(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8)),
                exchange.getRequestHeaders().getFirst("Authorization"),exchange.getRequestHeaders().getFirst("X-Odoo-Database"));
            requests.add(request);
            if(delayMs>0) try { Thread.sleep(delayMs); } catch(InterruptedException ex) { Thread.currentThread().interrupt(); }
            String result=status!=200 ? "{\"message\":\"server secret must not escape\"}" : malformed ? "not JSON" : response(request);
            byte[] bytes=result.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json");
            try { exchange.sendResponseHeaders(status,bytes.length); exchange.getResponseBody().write(bytes); } finally { exchange.close(); }
        });
        server.start();
    }
    public String url() { return "http://127.0.0.1:"+server.getAddress().getPort(); }
    public OdooSettings settings(OdooSettings.StockPolicy policy,int timeout) {
        return new OdooSettings(url(),"fixture-db","test-only-api-key",1,2,3,policy,"es_GT","","","",1000,timeout,5000,4000000);
    }
    private String response(Request request) {
        if(request.method().equals("fields_get")) {
            if (request.model().equals("lumio.campaign.slide")) {
                var schema=new LinkedHashMap<String,Object>();
                if (campaignSchemaAvailable) for (var field:List.of("id","title","message","action_label","action_url","sequence","active","is_published","website_id","company_id","starts_at","ends_at")) schema.put(field,Map.of("type","test"));
                return mapper.writeValueAsString(schema);
            }
            var fields=new LinkedHashMap<String,Object>();
            for(String field:List.of("id","name","company_id","currency_id","active","decimal_places","rounding","website_id","website_description",
                "description_sale","image_128","image_1024","image_variant_128","product_template_image_ids","type","sale_ok","is_published",
                "public_categ_ids","display_name","product_tmpl_id","product_template_attribute_value_ids","is_storable","free_qty","uom_id",
                "allow_out_of_stock_order","attribute_id","product_variant_id","logo","visibility","attribute_line_ids","product_template_value_ids","ptav_active","combo_ids","combo_item_ids","combo_id","product_id","extra_price","rate")) fields.put(field,Map.of("type","test"));
            if(missingFreeQty) fields.remove("free_qty");
            if(!logoSchemaAvailable) fields.remove("logo");
            return mapper.writeValueAsString(fields);
        }
        if(request.method().equals("get_contextual_price")) return switch(request.body().path("ids").get(0).intValue()){case 11->price; case 101->"100.00";default->"22.50";};
        boolean read=request.method().equals("read");
        if(!read && request.body().has("offset") && request.body().path("offset").intValue()>0) return "[]";
        return switch(request.model()) {
            case "lumio.campaign.slide" -> campaignRows;
            case "website" -> mapper.writeValueAsString(List.of(Map.of("id",1,"name","Tienda de prueba","company_id",7,"logo",logo)));
            case "stock.warehouse" -> "[{\"id\":3,\"company_id\":"+company+"}]";
            case "product.pricelist" -> "[{\"id\":2,\"company_id\":7,\"currency_id\":4,\"active\":true,\"website_id\":1}]";
            case "res.currency" -> request.body().path("ids").get(0).intValue()==8 ? "[{\"id\":8,\"active\":true,\"rate\":"+sourceRate+"}]" : "[{\"id\":4,\"name\":\""+currency+"\",\"decimal_places\":"+currencyDecimals+",\"rounding\":"+rounding+",\"active\":true,\"rate\":1.0}]";
            case "product.combo" -> "[{\"id\":70,\"name\":\"Prenda\",\"company_id\":7,\"combo_item_ids\":[71,72]},{\"id\":80,\"name\":\"Servicio\",\"company_id\":7,\"combo_item_ids\":[81]}]";
            case "product.combo.item" -> "[{\"id\":71,\"combo_id\":70,\"product_id\":11,\"extra_price\":2.50,\"currency_id\":4},{\"id\":72,\"combo_id\":70,\"product_id\":12,\"extra_price\":"+comboExtra+",\"currency_id\":"+comboCurrency+"},{\"id\":81,\"combo_id\":80,\"product_id\":21,\"extra_price\":0,\"currency_id\":4}]";
            case "product.public.category" -> "[{\"id\":5,\"name\":\"Ropa\",\"website_id\":1,\"website_description\":\"<p>Prendas</p>\"}]";
            case "product.template" -> read ? "["+template(request.body().path("ids").get(0).intValue())+"]" : searchTemplates(request);
            case "product.product" -> read ? "["+variant(request.body().path("ids").get(0).intValue())+"]" : searchVariants(request);
            case "product.template.attribute.value" -> "[{\"id\":31,\"name\":\"S\",\"attribute_id\":30},{\"id\":32,\"name\":\""+(duplicateCombination?"S":"M")+"\",\"attribute_id\":30}"+(classification?",{\"id\":33,\"name\":\"Algodón\",\"attribute_id\":34,\"ptav_active\":true}":"")+"]";
            case "product.attribute" -> "[{\"id\":30,\"name\":\"Talla\",\"visibility\":\"visible\"}"+(classification?",{\"id\":34,\"name\":\"Material\",\"visibility\":\""+(classificationHidden?"hidden":"visible")+"\"}":"")+"]";
            case "product.template.attribute.line" -> classification ? "[{\"id\":71,\"product_tmpl_id\":10,\"product_template_value_ids\":[33]}]" : "[]";
            case "product.image" -> extraImage ? "[{\"id\":41,\"name\":\"Foto de talla S\",\"product_tmpl_id\":false,\"product_variant_id\":11,\"image_128\":\"8 bytes\",\"image_1024\":\""+image+"\"}]" : "[]";
            default -> throw new IllegalArgumentException(request.model());
        };
    }
    private String searchTemplates(Request request) {
        var rows=new ArrayList<JsonNode>();
        if (comboProducts || onlyCombos) rows.add(mapper.readTree(template(100)));
        if (!onlyCombos) { rows.add(mapper.readTree(template(10))); rows.add(mapper.readTree(template(20))); }
        // Simulate Odoo's actual type condition, rather than always hiding combo fixtures.
        for (var term:request.body().path("domain")) {
            if (term.isArray() && term.size()==3 && "type".equals(term.get(0).stringValue())
                && "!=".equals(term.get(1).stringValue()) && "combo".equals(term.get(2).stringValue()))
                rows.removeIf(row -> "combo".equals(row.path("type").stringValue()));
        }
        return mapper.writeValueAsString(rows);
    }
    private String searchVariants(Request request) {
        var rows=new ArrayList<JsonNode>();
        if (comboProducts || onlyCombos) rows.add(mapper.readTree(variant(101)));
        for (int id:List.of(11,12,21)) rows.add(mapper.readTree(variant(id)));
        for (var term:request.body().path("domain")) {
            if(term.isArray() && term.size()==3 && "id".equals(term.get(0).stringValue()) && "in".equals(term.get(1).stringValue())) {
                var allowed=new HashSet<Integer>();term.get(2).forEach(value->allowed.add(value.intValue()));
                rows.removeIf(row->!allowed.contains(row.path("id").intValue()));
            }
            if (term.isArray() && term.size()==3 && "product_tmpl_id".equals(term.get(0).stringValue()) && "in".equals(term.get(1).stringValue())) {
                var allowed=new HashSet<Integer>(); term.get(2).forEach(value -> allowed.add(value.intValue()));
                rows.removeIf(row -> !allowed.contains(row.path("product_tmpl_id").intValue()));
            }
        }
        return mapper.writeValueAsString(rows);
    }
    private String template(int id) {
        return "{\"id\":"+id+",\"name\":\""+(id==100?"Combo de prueba":id==10?"Camiseta":"Asesoría")+"\",\"type\":\""+(id==100?"combo":id==10?"consu":"service")+"\",\"active\":true,\"sale_ok\":true,\"is_published\":"+published+",\"website_id\":1,\"company_id\":7,\"combo_ids\":"+(id==100?"[70,80]":"[]")+",\"public_categ_ids\":[5],\"website_description\":\"<p>Descripción real</p><script>secret()</script>\",\"image_128\":\"8 bytes\",\"product_template_image_ids\":[],\"attribute_line_ids\":"+(classification&&id==10?"[71]":"[]")+",\"image_1024\":\""+image+"\"}";
    }
    private String variant(int id) {
        return "{\"id\":"+id+",\"display_name\":\"Variante "+id+"\",\"active\":true,\"product_tmpl_id\":"+(id==101?100:id==21?20:10)+",\"product_template_attribute_value_ids\":"+(id==21||id==101?"[]":id==11?"[31]":"[32]")+",\"sale_ok\":true,\"company_id\":"+componentCompany+",\"type\":\""+(id==101?"combo":id==21?"service":"consu")+"\",\"is_storable\":"+(id!=21 && id!=101)+",\"free_qty\":"+(id==12?componentStock:0)+",\"qty_available\":999,\"virtual_available\":999,\"uom_id\":6,\"allow_out_of_stock_order\":"+backorder+",\"image_variant_128\":false,\"image_1024\":\""+image+"\"}";
    }
    @Override public void close() { server.stop(0); }
    /** Optional local fixture for manually building Angular against the real Java adapter. */
    public static void main(String[] args) throws Exception {
        var stub=new OdooStub(); stub.comboProducts=java.util.Arrays.asList(args).contains("--combos");
        Runtime.getRuntime().addShutdownHook(new Thread(stub::close));
        System.out.println("Odoo test fixture: "+stub.url());
        new java.util.concurrent.CountDownLatch(1).await();
    }
}
