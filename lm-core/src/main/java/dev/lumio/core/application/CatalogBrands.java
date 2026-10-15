package dev.lumio.core.application;

import dev.lumio.core.domain.Catalog;
import java.util.TreeMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Published brands reuse the same classification attribute as the catalog's facet filters. */
@Component
public final class CatalogBrands {
    private final String attribute;
    public CatalogBrands(@Value("${lumio.catalog.brand-attribute:Marca}") String attribute) {
        if(attribute==null || attribute.isBlank() || !attribute.equals(attribute.strip()) || attribute.length()>CatalogAttributeFilters.MAX_NAME_LENGTH)
            throw new IllegalArgumentException("CATALOG_BRAND_ATTRIBUTE must be nonblank text of at most 120 characters, without surrounding whitespace");
        this.attribute=attribute;
    }
    public CatalogAttributeFacet facet(Catalog catalog) {
        var counts=new TreeMap<String,Integer>();
        for(var item:catalog.items())item.attributes().stream().filter(value -> value.name().equals(attribute))
            .map(value -> value.value()).distinct().forEach(value -> counts.merge(value,1,Integer::sum));
        var images=new java.util.HashMap<String,dev.lumio.core.domain.CatalogImage>();
        catalog.attributeImages().stream().filter(value -> value.name().equals(attribute))
            .forEach(value -> images.putIfAbsent(value.value(),value.image()));
        return new CatalogAttributeFacet(attribute,counts.entrySet().stream()
            .map(entry -> new CatalogAttributeFacet.Value(entry.getKey(),entry.getValue(),images.get(entry.getKey()))).toList());
    }
}
