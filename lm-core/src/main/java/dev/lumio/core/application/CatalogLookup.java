package dev.lumio.core.application;

import dev.lumio.core.domain.Catalog;
import dev.lumio.core.domain.CatalogItem;
import java.util.*;

public final class CatalogLookup {
    public static final int MAX_IDS = 100;
    private CatalogLookup() { }

    public static void validate(List<String> ids) {
        if (ids == null || ids.isEmpty() || ids.size() > MAX_IDS) {
            throw new IllegalArgumentException("ids must contain between 1 and 100 item identifiers");
        }
        var unique = new HashSet<String>();
        for (String id : ids) {
            if (id == null || !id.matches("[A-Za-z0-9_-]{1,200}") || !unique.add(id)) {
                throw new IllegalArgumentException("ids must be valid, distinct item identifiers of at most 200 characters");
            }
        }
    }

    public static List<CatalogItemLookup> find(Catalog catalog, List<String> ids) {
        var requested = new HashSet<>(ids);
        var found = new HashMap<String, CatalogItem>();
        for (var item : catalog.items()) if (requested.contains(item.id())) found.put(item.id(), item);
        return ids.stream().map(id -> new CatalogItemLookup(id, found.get(id))).toList();
    }
}
