package dev.lumio.core.domain;

/** Optional visual metadata for a classification value, independent of its provider. */
public record CatalogAttributeImage(String name, String value, CatalogImage image) {}
