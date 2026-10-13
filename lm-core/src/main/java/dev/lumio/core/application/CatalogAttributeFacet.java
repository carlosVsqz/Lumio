package dev.lumio.core.application;

import java.util.List;

public record CatalogAttributeFacet(String name,List<Value> values) {
    public record Value(String value,int count) {}
}
