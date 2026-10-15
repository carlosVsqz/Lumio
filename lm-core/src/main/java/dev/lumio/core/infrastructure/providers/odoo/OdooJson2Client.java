package dev.lumio.core.infrastructure.providers.odoo;

import dev.lumio.core.application.CatalogUnavailableException;
import io.netty.channel.ChannelOption;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** JSON-2 only; the allowlist prevents this adapter from invoking write operations. */
public final class OdooJson2Client {
    private final WebClient web;
    private final OdooSettings settings;
    private final Map<String, JsonNode> schemas = new ConcurrentHashMap<>();
    private final JsonMapper mapper = JsonMapper.builder().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).build();

    public OdooJson2Client(OdooSettings settings) {
        this(settings, WebClient.builder().baseUrl(settings.url())
            .clientConnector(new ReactorClientHttpConnector(HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, settings.connectTimeoutMs())
                .responseTimeout(Duration.ofMillis(settings.requestTimeoutMs())).followRedirect(false)))
            .codecs(codecs -> codecs.defaultCodecs().maxInMemorySize(Math.max(16000000, settings.maxImageBytes() * 2))).build());
    }
    public OdooJson2Client(OdooSettings settings, WebClient web) { this.settings = settings; this.web = web; }

    public JsonNode call(String model, String method, Map<String, Object> arguments, Map<String, Object> context) {
        if (!Set.of("fields_get", "search_read", "read", "get_contextual_price").contains(method)
            || !Set.of("website", "stock.warehouse", "product.pricelist", "res.currency", "product.template", "product.product",
                "product.public.category", "product.template.attribute.value", "product.template.attribute.line", "product.image", "product.attribute", "product.combo", "product.combo.item", "lumio.campaign.slide").contains(model)
            || (method.equals("get_contextual_price") && !model.equals("product.product"))) throw new IllegalArgumentException("Odoo operation is not allowlisted for read-only catalog access");
        var body = new LinkedHashMap<>(arguments);
        body.put("context", context);
        try {
            var result = web.post().uri("/json/2/" + model + "/" + method)
                .headers(headers -> { headers.setBearerAuth(settings.apiKey()); headers.set("X-Odoo-Database", settings.database()); headers.set("User-Agent", "Lumio-Catalog/0.0.1"); })
                .contentType(MediaType.APPLICATION_JSON).bodyValue(body)
                .exchangeToMono(response -> {
                    int status = response.statusCode().value();
                    if (status >= 200 && status < 300) return response.bodyToMono(String.class);
                    return response.releaseBody().then(reactor.core.publisher.Mono.error(httpError(status, model, method)));
                }).timeout(Duration.ofMillis(settings.requestTimeoutMs())).block();
            if (result == null) throw failure("PROTOCOL", "Odoo devolvió una respuesta vacía.");
            var node = mapper.readTree(result);
            if (node == null || node.isNull() || node.has("error")) throw failure("PROTOCOL", "Odoo devolvió una respuesta JSON-2 inválida.");
            return node;
        } catch (CatalogUnavailableException ex) { throw ex; }
        catch (RuntimeException ex) {
            if (ex instanceof tools.jackson.core.JacksonException) throw failure("PROTOCOL", "Odoo devolvió JSON inválido.");
            throw failure("CONNECTION", "No se pudo conectar con Odoo o se agotó el tiempo de espera.");
        }
    }
    private CatalogUnavailableException httpError(int status, String model, String method) {
        return switch (status) {
            case 401 -> failure("AUTHENTICATION", "Odoo rechazó la clave API; comprueba su validez y vencimiento en el backend.");
            case 403 -> failure("ACCESS", "Odoo denegó acceso; revisa permisos, reglas de registros y campos del usuario de integración.");
            case 404 -> failure("COMPATIBILITY", "Odoo no expone " + model + "." + method + "; revisa Odoo 19, módulos y /doc de la instancia.");
            case 429 -> failure("RATE_LIMIT", "Odoo limitó las solicitudes. Inténtalo más tarde.");
            default -> failure("UPSTREAM", "Odoo no pudo atender la consulta del catálogo (HTTP " + status + ").");
        };
    }
    public JsonNode fields(String model, Map<String, Object> context) {
        return schemas.computeIfAbsent(model, key -> {
            var result = call(model, "fields_get", Map.of("attributes", List.of("type", "relation")), context);
            if (!result.isObject()) throw failure("PROTOCOL", "Odoo devolvió metadatos de campos inválidos.");
            return result;
        });
    }
    public List<String> requireFields(String model, Map<String, Object> context, String... names) {
        var schema = fields(model, context);
        for (var name : names) if (!schema.has(name)) throw failure("COMPATIBILITY", "Odoo no permite leer " + model + "." + name + "; revisa campos, módulos y permisos en /doc.");
        return new ArrayList<>(List.of(names));
    }
    public List<JsonNode> search(String model, List<?> domain, List<String> fields, Map<String, Object> context) {
        var result = new ArrayList<JsonNode>();
        for (int offset = 0; ; offset += 200) {
            var arguments = new LinkedHashMap<String, Object>();
            arguments.put("domain", domain); arguments.put("fields", fields); arguments.put("offset", offset);
            arguments.put("limit", 200); arguments.put("order", "id asc"); arguments.put("load", null);
            var page = call(model, "search_read", arguments, context);
            if (!page.isArray() || page.size() > 200) throw failure("PROTOCOL", "Odoo devolvió una página inválida.");
            for (var record : page) result.add(record);
            if (result.size() > settings.maxRecords()) throw failure("LIMIT", "El catálogo Odoo excede ODOO_MAX_RECORDS; no se devolverá una lista truncada.");
            if (page.size() < 200) return result;
        }
    }
    public JsonNode readOne(String model, int id, List<String> fields, Map<String, Object> context) {
        var arguments = new LinkedHashMap<String, Object>();
        arguments.put("ids", List.of(id)); arguments.put("fields", fields); arguments.put("load", null);
        var records = call(model, "read", arguments, context);
        if (!records.isArray() || records.size() != 1 || records.get(0).get("id") == null
            || !records.get(0).get("id").isIntegralNumber() || !records.get(0).get("id").canConvertToInt() || records.get(0).get("id").intValue() != id)
            throw failure("CONFIGURATION", "No se pudo leer el registro Odoo configurado en " + model + ".");
        return records.get(0);
    }
    public static CatalogUnavailableException failure(String reason, String message) { return new CatalogUnavailableException(reason, message); }
}

