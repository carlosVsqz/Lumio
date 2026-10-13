package dev.lumio.core.domain;

import java.util.List;

public record CatalogItem(String id, String slug, String name, String description,
                          List<String> categoryIds, List<CatalogImage> images,
                          boolean available, List<CatalogVariant> variants, CatalogItemType type, List<VariantAttribute> attributes) {
    public CatalogItem(String id, String slug, String name, String description,
                       List<String> categoryIds, List<CatalogImage> images,
                       boolean available, List<CatalogVariant> variants, CatalogItemType type) {
        this(id,slug,name,description,categoryIds,images,available,variants,type,
            variants.stream().flatMap(variant -> variant.attributes().stream()).distinct().toList());
    }
    public CatalogItem(String id, String slug, String name, String description,
                       List<String> categoryIds, List<CatalogImage> images,
                       boolean available, List<CatalogVariant> variants) {
        this(id, slug, name, description, categoryIds, images, available, variants, CatalogItemType.PRODUCT);
    }
    public CatalogItem {
        java.util.Objects.requireNonNull(type, "Catalog item type is required");
        categoryIds = List.copyOf(categoryIds);
        images = List.copyOf(images);
        variants = List.copyOf(variants);
        attributes = List.copyOf(attributes);
    }
}
