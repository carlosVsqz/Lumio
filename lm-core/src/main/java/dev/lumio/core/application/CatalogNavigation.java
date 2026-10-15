package dev.lumio.core.application;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Comparator;
import dev.lumio.core.domain.CatalogItem;
import dev.lumio.core.domain.CatalogVariant;
import org.springframework.stereotype.Service;

/** Filtering and paging a provider-independent snapshot in its original order. */
@Service
public final class CatalogNavigation {
    public static final int DEFAULT_PAGE_SIZE = 12;
    public static final int MAX_PAGE_SIZE = 50;
    public static final int MAX_SEARCH_LENGTH = 200;
    private final CatalogProvider provider;

    public CatalogNavigation(CatalogProvider provider) {
        this.provider = provider;
    }

    public CatalogItemPage page(String search, String categoryId, Integer requestedPage, Integer requestedSize) {
        validateRequest(search, requestedPage, requestedSize);
        return page(provider.catalog(), search, categoryId, requestedPage, requestedSize);
    }

    public CatalogItemPage page(dev.lumio.core.domain.Catalog catalog, String search, String categoryId, Integer requestedPage, Integer requestedSize) {
        return page(catalog,search,categoryId,requestedPage,requestedSize,CatalogSort.CATALOG_ORDER,false);
    }

    public CatalogItemPage page(dev.lumio.core.domain.Catalog catalog, String search, String categoryId, Integer requestedPage, Integer requestedSize, CatalogSort sort, boolean availableOnly) {
        return page(catalog,search,categoryId,requestedPage,requestedSize,sort,availableOnly,List.of());
    }
    public CatalogItemPage page(dev.lumio.core.domain.Catalog catalog, String search, String categoryId, Integer requestedPage, Integer requestedSize, CatalogSort sort, boolean availableOnly, List<CatalogAttributeFilter> attributes) {
        validateRequest(search, requestedPage, requestedSize);
        var filters=CatalogAttributeFilters.validate(attributes);
        int page = requestedPage == null ? 1 : requestedPage;
        int size = requestedSize == null ? DEFAULT_PAGE_SIZE : requestedSize;
        String query = search == null ? "" : search.strip();
        String normalized = normalize(query);
        String category = categoryId == null ? "" : categoryId.strip();
        var categoryScope=category.isEmpty()?java.util.Set.<String>of():CatalogCategories.descendants(catalog.categories(),category);
        var context = catalog.items().stream()
            .filter(item -> category.isEmpty() || item.categoryIds().stream().anyMatch(categoryScope::contains))
            .filter(item -> normalized.isEmpty() || normalize(item.name()).contains(normalized)
                || normalize(item.description()).contains(normalized))
            .filter(item -> !availableOnly || item.available() && item.variants().stream().anyMatch(CatalogVariant::available)).toList();
        var stream=context.stream().filter(item -> CatalogAttributeFilters.matches(item,filters,availableOnly));
        Comparator<CatalogItem> order = switch (sort == null ? CatalogSort.CATALOG_ORDER : sort) {
            case NAME_ASC -> Comparator.comparing(item -> normalize(item.name()));
            case PRICE_ASC -> Comparator.comparingInt(CatalogNavigation::displayPrice);
            case PRICE_DESC -> Comparator.comparingInt(CatalogNavigation::displayPrice).reversed();
            case CATALOG_ORDER -> null;
        };
        if (order != null) stream = stream.sorted(order.thenComparing(CatalogItem::id));
        var matches = stream.toList();
        int total = matches.size();
        int totalPages = total == 0 ? 0 : (total - 1) / size + 1;
        long offset = (long) (page - 1) * size;
        var items = offset >= total ? List.<dev.lumio.core.domain.CatalogItem>of()
            : matches.subList((int) offset, (int) Math.min(offset + size, total));
        return new CatalogItemPage(items, total, page, size, totalPages,CatalogAttributeFilters.facets(context,filters,availableOnly));
    }

    private static String normalize(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT);
    }

    private static int displayPrice(CatalogItem item) {
        var available = item.available() ? item.variants().stream().filter(CatalogVariant::available).toList() : List.<CatalogVariant>of();
        long price = (available.isEmpty() ? item.variants() : available).stream().mapToInt(CatalogVariant::priceMinor).min().orElseThrow();
        for (var group : item.comboGroups()) {
            var choices = group.options().stream().filter(dev.lumio.core.domain.ComboOption::available).toList();
            price += (choices.isEmpty() ? group.options() : choices).stream().mapToInt(dev.lumio.core.domain.ComboOption::extraPriceMinor).min().orElse(0);
        }
        return Math.toIntExact(price);
    }

    /** Reject invalid navigation before performing any potentially remote catalog reads. */
    public static void validateRequest(String search, Integer page, Integer pageSize) {
        if (page != null && page < 1) throw new IllegalArgumentException("page must be at least 1");
        if (pageSize != null && (pageSize < 1 || pageSize > MAX_PAGE_SIZE))
            throw new IllegalArgumentException("pageSize must be between 1 and " + MAX_PAGE_SIZE);
        if (search != null && search.strip().length() > MAX_SEARCH_LENGTH)
            throw new IllegalArgumentException("search must not exceed " + MAX_SEARCH_LENGTH + " characters");
    }
}

