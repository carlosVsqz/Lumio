package dev.lumio.core.application;

import dev.lumio.core.domain.CatalogItem;
import java.util.*;

/** Classification and compatible variant filters, independent of catalog origin. */
public final class CatalogAttributeFilters {
    public static final int MAX_FILTERS=16, MAX_VALUES=32, MAX_NAME_LENGTH=120, MAX_VALUE_LENGTH=200;
    private CatalogAttributeFilters() {}
    public static List<CatalogAttributeFilter> validate(List<CatalogAttributeFilter> filters) {
        if (filters == null) return List.of();
        if (filters.size()>MAX_FILTERS) throw new IllegalArgumentException("attributes must contain at most " + MAX_FILTERS + " filters");
        var names=new HashSet<String>();
        for (var filter:filters) {
            if (filter == null || !validText(filter.name(),MAX_NAME_LENGTH) || !names.add(filter.name()))
                throw new IllegalArgumentException("attribute names must be unique nonblank text of at most " + MAX_NAME_LENGTH + " characters");
            if (filter.values() == null || filter.values().isEmpty() || filter.values().size()>MAX_VALUES
                    || filter.values().stream().anyMatch(value -> !validText(value,MAX_VALUE_LENGTH))
                    || new HashSet<>(filter.values()).size()!=filter.values().size())
                throw new IllegalArgumentException("attribute values must be unique nonblank text: 1 to " + MAX_VALUES + " values, at most " + MAX_VALUE_LENGTH + " characters each");
        }
        return filters.stream().map(filter -> new CatalogAttributeFilter(filter.name(),List.copyOf(filter.values()))).toList();
    }
    private static boolean validText(String value,int max) { return value != null && !value.isBlank() && value.equals(value.strip()) && value.length()<=max; }
    public static boolean matches(CatalogItem item,List<CatalogAttributeFilter> filters,boolean availableOnly) {
        if (filters.isEmpty()) return true;
        if (!filters.stream().allMatch(filter -> item.attributes().stream().anyMatch(attribute ->
                attribute.name().equals(filter.name()) && filter.values().contains(attribute.value())))) return false;
        var variantNames=new HashSet<String>();
        item.variants().forEach(variant -> variant.attributes().forEach(attribute -> variantNames.add(attribute.name())));
        return item.variants().stream().filter(variant -> !availableOnly || variant.available()).anyMatch(variant ->
            filters.stream().allMatch(filter -> !variantNames.contains(filter.name()) || variant.attributes().stream().anyMatch(attribute ->
                attribute.name().equals(filter.name()) && filter.values().contains(attribute.value()))));
    }
    /** Counts products against other selected attributes; selecting values in one group is OR. */
    public static List<CatalogAttributeFacet> facets(List<CatalogItem> context,List<CatalogAttributeFilter> filters,boolean availableOnly) {
        var values=new TreeMap<String,Set<String>>();
        context.forEach(item -> item.attributes().forEach(attribute -> values.computeIfAbsent(attribute.name(),key -> new TreeSet<>()).add(attribute.value())));
        filters.forEach(filter -> values.computeIfAbsent(filter.name(),key -> new TreeSet<>()).addAll(filter.values()));
        return values.entrySet().stream().map(entry -> {
            var others=filters.stream().filter(filter -> !filter.name().equals(entry.getKey())).toList();
            var candidates=context.stream().filter(item -> matches(item,others,availableOnly)).toList();
            return new CatalogAttributeFacet(entry.getKey(),entry.getValue().stream().map(value -> {
                var selection=new ArrayList<>(others); selection.add(new CatalogAttributeFilter(entry.getKey(),List.of(value)));
                int count=(int)candidates.stream().filter(item -> matches(item,selection,availableOnly)).count();
                return new CatalogAttributeFacet.Value(value,count);
            }).toList());
        }).toList();
    }
}
