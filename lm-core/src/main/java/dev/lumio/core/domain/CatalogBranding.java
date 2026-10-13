package dev.lumio.core.domain;

/** Business identity, independent of the catalog's source. */
public record CatalogBranding(String logoUrl, String primaryColor) {
    public static final CatalogBranding DEFAULT = new CatalogBranding("", "#234d46");
}
