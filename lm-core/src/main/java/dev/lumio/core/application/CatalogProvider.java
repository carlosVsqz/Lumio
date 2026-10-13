package dev.lumio.core.application;

import dev.lumio.core.domain.Catalog;

public interface CatalogProvider {
    Catalog catalog();
    default java.util.List<dev.lumio.core.domain.CampaignSlide> campaigns() { return java.util.List.of(); }
}
