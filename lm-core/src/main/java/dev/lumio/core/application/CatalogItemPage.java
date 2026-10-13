package dev.lumio.core.application;

import dev.lumio.core.domain.CatalogItem;
import java.util.List;

public record CatalogItemPage(List<CatalogItem> items, int totalCount, int page, int pageSize, int totalPages, List<CatalogAttributeFacet> facets) {
    public CatalogItemPage(List<CatalogItem> items, int totalCount, int page, int pageSize, int totalPages) {
        this(items,totalCount,page,pageSize,totalPages,List.of());
    }
    public CatalogItemPage {
        items = List.copyOf(items);
        facets = List.copyOf(facets);
    }
}
