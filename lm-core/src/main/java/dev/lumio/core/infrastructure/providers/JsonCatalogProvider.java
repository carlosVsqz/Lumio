package dev.lumio.core.infrastructure.providers;

import dev.lumio.core.application.CatalogProvider;
import dev.lumio.core.application.CatalogValidator;
import dev.lumio.core.application.CampaignValidator;
import dev.lumio.core.domain.*;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiFunction;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ResourceLoader;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** JSON is confined to this adapter; the rest of the application sees domain records. */
public final class JsonCatalogProvider implements CatalogProvider {
    private final Catalog catalog;
    private final List<CampaignSlide> campaigns;

    public JsonCatalogProvider(ResourceLoader resources, @Value("${lumio.catalog.location}") String location) {
        this(resources, location, null);
    }

    public JsonCatalogProvider(ResourceLoader resources, String location, CatalogBranding brandingOverride) {
        if (!location.startsWith("classpath:") && !location.startsWith("file:")) {
            throw new IllegalArgumentException("Catalog location must start with classpath: or file:");
        }
        try (var input = resources.getResource(location).getInputStream()) {
            var mapper = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
            var root = mapper.readTree(input);
            object(root, "catalog");
            catalog = new Catalog(text(root, "name", "catalog"), text(root, "description", "catalog"),
                text(root, "currency", "catalog"), integer(root, "currencyDecimals", "catalog"),
                text(root, "whatsappNumber", "catalog"),
                list(root, "categories", "categories", this::category),
                list(root, "items", "items", this::item), brandingOverride == null ? branding(root) : brandingOverride);
            CatalogValidator.validate(catalog);
            campaigns = CampaignValidator.validate(root.has("campaigns") ? list(root, "campaigns", "campaigns", this::campaign) : List.of());
        } catch (IOException | RuntimeException ex) {
            throw new IllegalArgumentException("Cannot load catalog at " + location + ": " + ex.getMessage(), ex);
        }
    }

    @Override
    public Catalog catalog() { return catalog; }
    @Override public List<CampaignSlide> campaigns() { return campaigns; }

    private CampaignSlide campaign(JsonNode node, String path) {
        object(node, path);
        return new CampaignSlide(text(node, "id", path), text(node, "title", path), text(node, "message", path),
            text(node, "actionLabel", path), text(node, "actionUrl", path));
    }

    private static CatalogBranding branding(JsonNode root) {
        if (!root.has("branding")) return CatalogBranding.DEFAULT;
        var value = root.get("branding"); object(value, "branding");
        return new CatalogBranding(value.has("logoUrl") ? text(value,"logoUrl","branding") : "",
            value.has("primaryColor") ? text(value,"primaryColor","branding") : CatalogBranding.DEFAULT.primaryColor());
    }

    private Category category(JsonNode node, String path) {
        object(node, path);
        return new Category(text(node, "id", path), text(node, "slug", path),
            text(node, "name", path), text(node, "description", path));
    }

    private CatalogItem item(JsonNode node, String path) {
        object(node, path);
        return new CatalogItem(text(node, "id", path), text(node, "slug", path),
            text(node, "name", path), text(node, "description", path),
            list(node, "categoryIds", path + ".categoryIds", (value, p) -> string(value, p)),
            list(node, "images", path + ".images", (image, p) -> {
                object(image, p);
                return new CatalogImage(text(image, "url", p), text(image, "alt", p));
            }), bool(node, "available", path), list(node, "variants", path + ".variants", this::variant), itemType(node, path), itemAttributes(node,path));
    }

    private List<VariantAttribute> itemAttributes(JsonNode node,String path) {
        var attributes = new ArrayList<VariantAttribute>();
        if (node.has("attributes")) attributes.addAll(list(node,"attributes",path + ".attributes",(attribute,p) -> {
            object(attribute,p); return new VariantAttribute(text(attribute,"name",p),text(attribute,"value",p));
        }));
        if (new java.util.HashSet<>(attributes).size() != attributes.size()) throw invalid(path + ".attributes","contains duplicate name/value pairs");
        for (var variant : list(node,"variants",path + ".variants",this::variant))
            for (var attribute : variant.attributes()) if (!attributes.contains(attribute)) attributes.add(attribute);
        return attributes;
    }

    private static CatalogItemType itemType(JsonNode node, String path) {
        if (!node.has("type")) return CatalogItemType.PRODUCT;
        try { return CatalogItemType.valueOf(text(node, "type", path)); }
        catch (IllegalArgumentException ex) { throw invalid(path + ".type", "must be PRODUCT or SERVICE"); }
    }

    private CatalogVariant variant(JsonNode node, String path) {
        object(node, path);
        return new CatalogVariant(text(node, "id", path), text(node, "slug", path), text(node, "name", path),
            list(node, "attributes", path + ".attributes", (attribute, p) -> {
                object(attribute, p);
                return new VariantAttribute(text(attribute, "name", p), text(attribute, "value", p));
            }), integer(node, "priceMinor", path), bool(node, "available", path));
    }

    private static <T> List<T> list(JsonNode node, String key, String path, BiFunction<JsonNode, String, T> read) {
        var array = node.get(key);
        if (array == null || !array.isArray()) throw invalid(path, "must be an array");
        var values = new ArrayList<T>();
        for (int i = 0; i < array.size(); i++) values.add(read.apply(array.get(i), path + "[" + i + "]"));
        return values;
    }

    private static String text(JsonNode node, String key, String path) {
        return string(node.get(key), path + "." + key);
    }

    private static String string(JsonNode node, String path) {
        if (node == null || !node.isString()) throw invalid(path, "must be a string");
        return node.stringValue();
    }

    private static int integer(JsonNode node, String key, String path) {
        var value = node.get(key);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt()) {
            throw invalid(path + "." + key, "must be a 32-bit integer");
        }
        return value.intValue();
    }

    private static boolean bool(JsonNode node, String key, String path) {
        var value = node.get(key);
        if (value == null || !value.isBoolean()) throw invalid(path + "." + key, "must be a boolean");
        return value.booleanValue();
    }

    private static void object(JsonNode node, String path) {
        if (node == null || !node.isObject()) throw invalid(path, "must be an object");
    }

    private static IllegalArgumentException invalid(String path, String message) {
        return new IllegalArgumentException(path + ": " + message);
    }
}
