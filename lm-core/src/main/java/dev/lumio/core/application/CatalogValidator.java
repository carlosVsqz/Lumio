package dev.lumio.core.application;

import dev.lumio.core.domain.Catalog;
import java.net.URI;
import java.util.Currency;
import java.util.HashSet;
import java.util.Set;
import java.util.TreeMap;

/** Provider-independent validation of a complete catalog snapshot. */
public final class CatalogValidator {
    private CatalogValidator() {}

    public static void validate(Catalog catalog) {
        text(catalog.name(), "name");
        require(catalog.branding() != null, "branding", "is required");
        require(catalog.branding().primaryColor() != null && catalog.branding().primaryColor().matches("#[0-9a-fA-F]{6}"), "branding.primaryColor", "must be a six-digit hexadecimal color");
        var logo = catalog.branding().logoUrl();
        require(logo != null, "branding.logoUrl", "must be empty or a public image URL");
        if (!logo.isEmpty()) {
            try {
                var uri = URI.create(logo);
                require(logo.equals(logo.strip()) && !logo.contains("\\") && ((uri.isAbsolute() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                    && uri.getHost() != null && uri.getUserInfo() == null) || (logo.startsWith("/") && !logo.startsWith("//") && !uri.isAbsolute())), "branding.logoUrl", "must be an HTTP(S) URL without credentials or a path starting with /");
            } catch (IllegalArgumentException ex) { throw invalid("branding.logoUrl", "must be a public image URL without credentials"); }
        }
        require(catalog.description() != null, "description", "is required");
        require(catalog.currency() != null && catalog.currency().matches("[A-Z]{3}"), "currency", "must be an ISO 4217 code");
        try {
            Currency.getInstance(catalog.currency());
        } catch (IllegalArgumentException ex) {
            throw invalid("currency", "must be an ISO 4217 code");
        }
        require(catalog.currencyDecimals() >= 0 && catalog.currencyDecimals() <= 6,
            "currencyDecimals", "must be between 0 and 6");
        require(catalog.whatsappNumber() != null && (catalog.whatsappNumber().isEmpty()
            || catalog.whatsappNumber().matches("[1-9][0-9]{7,14}")), "whatsappNumber", "must be empty or international digits without + or spaces");

        var categoryIds = new HashSet<String>();
        var categorySlugs = new HashSet<String>();
        for (int i = 0; i < catalog.categories().size(); i++) {
            var category = catalog.categories().get(i);
            var path = "categories[" + i + "]";
            identity(category.id(), category.slug(), category.name(), categoryIds, categorySlugs, path);
            require(category.description() != null, path + ".description", "is required");
        }
        var itemIds = new HashSet<String>();
        var itemSlugs = new HashSet<String>();
        var variantIds = new HashSet<String>();
        for (int i = 0; i < catalog.items().size(); i++) {
            var item = catalog.items().get(i);
            var path = "items[" + i + "]";
            identity(item.id(), item.slug(), item.name(), itemIds, itemSlugs, path);
            require(item.description() != null, path + ".description", "is required");
            var references = new HashSet<String>();
            for (var id : item.categoryIds()) {
                require(categoryIds.contains(id), path + ".categoryIds", "references an unknown category");
                require(references.add(id), path + ".categoryIds", "contains a duplicate reference");
            }
            for (int j = 0; j < item.images().size(); j++) {
                var image = item.images().get(j);
                var imagePath = path + ".images[" + j + "]";
                text(image.alt(), imagePath + ".alt");
                text(image.url(), imagePath + ".url");
                try {
                    var uri = URI.create(image.url());
                    require((uri.isAbsolute() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                        && uri.getHost() != null && uri.getUserInfo() == null)
                        || (image.url().startsWith("/") && !image.url().startsWith("//") && !uri.isAbsolute()),
                        imagePath + ".url", "must be an HTTP(S) URL or a path starting with /");
                } catch (IllegalArgumentException ex) {
                    throw invalid(imagePath + ".url", "must be an HTTP(S) URL or a path starting with /");
                }
            }
            require(!item.variants().isEmpty(), path + ".variants", "must contain at least one variant");
            var variantSlugs = new HashSet<String>();
            var combinations = new HashSet<java.util.Map<String, String>>();
            for (int j = 0; j < item.variants().size(); j++) {
                var variant = item.variants().get(j);
                var variantPath = path + ".variants[" + j + "]";
                identity(variant.id(), variant.slug(), variant.name(), variantIds, variantSlugs, variantPath);
                require(variant.priceMinor() >= 0, variantPath + ".priceMinor", "must be a nonnegative integer");
                var attributes = new TreeMap<String, String>();
                for (var attribute : variant.attributes()) {
                    text(attribute.name(), variantPath + ".attributes.name");
                    text(attribute.value(), variantPath + ".attributes.value");
                    require(attributes.putIfAbsent(attribute.name(), attribute.value()) == null,
                        variantPath + ".attributes", "contains a duplicate attribute name");
                }
                require(combinations.add(attributes), variantPath + ".attributes", "duplicates a variant attribute combination");
            }
            var classification = new HashSet<dev.lumio.core.domain.VariantAttribute>();
            for (var attribute : item.attributes()) {
                text(attribute.name(), path + ".attributes.name");
                text(attribute.value(), path + ".attributes.value");
                require(attribute.name().length()<=CatalogAttributeFilters.MAX_NAME_LENGTH && attribute.value().length()<=CatalogAttributeFilters.MAX_VALUE_LENGTH,
                    path + ".attributes", "exceeds filterable attribute length limits");
                require(classification.add(attribute), path + ".attributes", "contains a duplicate name/value pair");
            }
        }
    }

    private static void identity(String id, String slug, String name, Set<String> ids, Set<String> slugs, String path) {
        require(id != null && id.matches("[A-Za-z0-9][A-Za-z0-9_-]*"), path + ".id", "must use letters, digits, underscores or hyphens");
        require(ids.add(id), path + ".id", "must be unique");
        require(slug != null && slug.matches("[a-z0-9]+(?:-[a-z0-9]+)*"), path + ".slug", "must use lowercase words separated by hyphens");
        require(slugs.add(slug), path + ".slug", "must be unique");
        text(name, path + ".name");
    }

    private static void text(String value, String path) {
        require(value != null && !value.isBlank() && value.equals(value.strip()), path, "must be nonblank without surrounding whitespace");
    }

    private static void require(boolean condition, String path, String message) {
        if (!condition) throw invalid(path, message);
    }

    private static IllegalArgumentException invalid(String path, String message) {
        return new IllegalArgumentException(path + ": " + message);
    }
}
