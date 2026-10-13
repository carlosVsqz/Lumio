package dev.lumio.core.infrastructure.providers.odoo;

import dev.lumio.core.application.CampaignValidator;
import dev.lumio.core.domain.CampaignSlide;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import tools.jackson.databind.JsonNode;
import static dev.lumio.core.infrastructure.providers.odoo.OdooJson2Client.failure;

/** Reads authoring records only; no inventory download or Odoo field enters GraphQL. */
final class OdooCampaignReader {
    private static final String MODEL = "lumio.campaign.slide";
    private static final DateTimeFormatter DATETIME = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss").withResolverStyle(java.time.format.ResolverStyle.STRICT);
    private final OdooJson2Client client;
    private final int websiteId;
    private final Clock clock;
    OdooCampaignReader(OdooJson2Client client, int websiteId, Clock clock) { this.client=client; this.websiteId=websiteId; this.clock=clock; }

    List<CampaignSlide> read(Map<String,Object> context) {
        var fields = client.requireFields(MODEL, context, "id", "title", "message", "action_label", "action_url", "sequence",
            "active", "is_published", "website_id", "company_id", "starts_at", "ends_at");
        var now = LocalDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        var domain = List.of(List.of("active", "=", true), List.of("is_published", "=", true),
            List.of("website_id", "=", websiteId), List.of("company_id", "=", context.get("company_id")),
            "|", List.of("starts_at", "=", false), List.of("starts_at", "<=", DATETIME.format(now)),
            "|", List.of("ends_at", "=", false), List.of("ends_at", ">", DATETIME.format(now)));
        var rows = client.call(MODEL, "search_read", Map.of("domain",domain,"fields",fields,"order","sequence asc, id asc",
            "limit",CampaignValidator.MAX_SLIDES + 1,"load",false),context);
        if (!rows.isArray()) throw failure("PROTOCOL", "Odoo devolvió campañas inválidas.");
        if (rows.size() > CampaignValidator.MAX_SLIDES) throw failure("LIMIT", "Hay más de 20 campañas vigentes en Odoo; reduce la lista, no se truncará.");
        var records = new ArrayList<JsonNode>();
        for (var row : rows) {
            if (!row.isObject()) throw failure("PROTOCOL", "Odoo devolvió una campaña inválida.");
            int id = integer(row,"id");
            if (id <= 0) throw failure("PROTOCOL", "Odoo devolvió una referencia de campaña inválida.");
            boolean active = bool(row,"active"), published = bool(row,"is_published");
            int site = relation(row.get("website_id")), company = relation(row.get("company_id"));
            var start = date(row.get("starts_at"));
            var end = date(row.get("ends_at"));
            if (start != null && end != null && !start.isBefore(end)) throw failure("VALIDATION", "La vigencia de una campaña Odoo es inválida.");
            if (active && published && site == websiteId && Objects.equals(company, context.get("company_id"))
                && (start == null || !start.isAfter(now)) && (end == null || end.isAfter(now))) records.add(row);
        }
        try {
            records.sort(Comparator.comparingInt((JsonNode row) -> integer(row,"sequence")).thenComparingInt(row -> integer(row,"id")));
            return CampaignValidator.validate(records.stream().map(row -> new CampaignSlide("campaign-"+integer(row,"id"),
                text(row,"title"),text(row,"message"),text(row,"action_label"),text(row,"action_url"))).toList());
        } catch (IllegalArgumentException ex) { throw failure("VALIDATION", "El contenido de las campañas Odoo es inválido; revisa títulos, enlaces y límites."); }
    }
    private static int integer(JsonNode row, String field) {
        var value=row.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt()) throw failure("PROTOCOL", "Odoo devolvió un entero de campaña inválido.");
        return value.intValue();
    }
    private static int relation(JsonNode value) {
        if (value != null && value.isArray()) value=value.get(0);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() <= 0) throw failure("PROTOCOL", "Odoo devolvió una relación de campaña inválida.");
        return value.intValue();
    }
    private static boolean bool(JsonNode row, String field) {
        var value=row.get(field);
        if (value == null || !value.isBoolean()) throw failure("PROTOCOL", "Odoo devolvió una publicación de campaña inválida.");
        return value.booleanValue();
    }
    private static LocalDateTime date(JsonNode value) {
        if (value != null && value.isBoolean() && !value.booleanValue()) return null;
        if (value == null || !value.isString()) throw failure("PROTOCOL", "Odoo devolvió una fecha de campaña inválida.");
        try { return LocalDateTime.parse(value.stringValue(),DATETIME); }
        catch (Exception ex) { throw failure("PROTOCOL", "Odoo devolvió una fecha de campaña inválida."); }
    }
    private static String text(JsonNode row, String field) {
        var value=row.get(field);
        if (value != null && value.isBoolean() && !value.booleanValue()) return "";
        if (value == null || !value.isString()) throw failure("PROTOCOL", "Odoo devolvió un texto de campaña inválido.");
        return value.stringValue().strip();
    }
}
