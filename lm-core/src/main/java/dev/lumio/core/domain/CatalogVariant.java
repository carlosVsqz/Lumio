package dev.lumio.core.domain;

import java.util.List;

/** Price is an integer in the catalog currency's minor units. */
public record CatalogVariant(String id, String slug, String name, List<VariantAttribute> attributes,
                             int priceMinor, boolean available) {
    public CatalogVariant {
        attributes = List.copyOf(attributes);
    }
}
