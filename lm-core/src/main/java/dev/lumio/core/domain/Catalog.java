package dev.lumio.core.domain;

import java.util.List;

public record Catalog(String name, String description, String currency, int currencyDecimals,
                      String whatsappNumber, List<Category> categories, List<CatalogItem> items, CatalogBranding branding,
                      List<CatalogAttributeImage> attributeImages) {
    public Catalog(String name, String description, String currency, int currencyDecimals,
                   String whatsappNumber, List<Category> categories, List<CatalogItem> items, CatalogBranding branding) {
        this(name, description, currency, currencyDecimals, whatsappNumber, categories, items, branding, List.of());
    }
    public Catalog(String name, String description, String currency, int currencyDecimals,
                   String whatsappNumber, List<Category> categories, List<CatalogItem> items) {
        this(name, description, currency, currencyDecimals, whatsappNumber, categories, items, CatalogBranding.DEFAULT);
    }
    public Catalog {
        categories = List.copyOf(categories);
        items = List.copyOf(items);
        attributeImages = List.copyOf(attributeImages);
    }
}
