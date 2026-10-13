package dev.lumio.core.application;

import dev.lumio.core.domain.CatalogItem;

/** A missing or unpublished item has a null item; transport failures remain GraphQL errors. */
public record CatalogItemLookup(String id, CatalogItem item) { }
