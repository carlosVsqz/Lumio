package dev.lumio.core.application;

import dev.lumio.core.domain.Catalog;
import dev.lumio.core.domain.CatalogItem;
import dev.lumio.core.domain.CatalogVariant;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;

class CatalogNavigationTests {
    private final CatalogNavigation navigation = new CatalogNavigation(() -> new Catalog(
        "Test", "", "GTQ", 2, "", List.of(), IntStream.rangeClosed(1, 25).mapToObj(i -> new CatalogItem(
            "item-" + i, "item-" + i, i == 1 ? "Café especial" : "Artículo " + i,
            i == 2 ? "Asesoría personalizada" : "Descripción de ejemplo",
            List.of(i % 2 == 0 ? "services" : "products"), List.of(), true,
            List.of(new CatalogVariant("variant-" + i, "default", "Default", List.of(), i * 100, true))))
            .toList()));

    @Test
    void pagesInStableOrderAndCountsAllFilteredMatches() {
        var first = navigation.page(null, null, null, null);
        assertEquals(25, first.totalCount());
        assertEquals(3, first.totalPages());
        assertEquals(12, first.pageSize());
        assertEquals(12, first.items().size());
        assertEquals("item-1", first.items().getFirst().id());
        var last = navigation.page(null, null, 3, 12);
        assertEquals(1, last.items().size());
        assertEquals("item-25", last.items().getFirst().id());
        assertThrows(UnsupportedOperationException.class, () -> first.items().clear());
    }

    @Test
    void searchesNamesDescriptionsAndIgnoresCaseAccentsAndSurroundingWhitespace() {
        assertEquals("item-1", navigation.page("  CAFE  ", null, 1, 12).items().getFirst().id());
        assertEquals("item-2", navigation.page("ASESORIA", null, 1, 12).items().getFirst().id());
        assertEquals(25, navigation.page("DESCRIPCION", null, 1, 12).totalCount() + 1);
    }

    @Test
    void combinesCategoryAndSearchBeforePagination() {
        var result = navigation.page("articulo", " services ", 2, 5);
        assertEquals(12, result.totalCount());
        assertEquals(3, result.totalPages());
        assertEquals("item-12", result.items().getFirst().id());
        assertTrue(result.items().stream().allMatch(item -> item.categoryIds().contains("services")));
        assertEquals(0, navigation.page("cafe", "services", 1, 12).totalCount());
    }

    @Test
    void handlesEmptyResultsUnknownCategoriesAndHugePagesWithoutOverflow() {
        assertEquals(0, navigation.page("missing", null, 1, 12).totalPages());
        assertTrue(navigation.page(null, "unknown", 1, 12).items().isEmpty());
        var huge = navigation.page(null, null, Integer.MAX_VALUE, 50);
        assertTrue(huge.items().isEmpty());
        assertEquals(25, huge.totalCount());
        assertEquals(Integer.MAX_VALUE, huge.page());
        assertEquals(25, navigation.page("  ", "  ", 1, 50).items().size());
    }

    @ParameterizedTest
    @ValueSource(ints = {0, -1, 51, Integer.MAX_VALUE})
    void rejectsInvalidPageSizes(int size) {
        assertThrows(IllegalArgumentException.class, () -> navigation.page(null, null, 1, size));
    }

    @Test
    void rejectsInvalidPagesAndExcessiveSearchLength() {
        assertThrows(IllegalArgumentException.class, () -> navigation.page(null, null, 0, 12));
        assertThrows(IllegalArgumentException.class, () -> navigation.page(null, null, -1, 12));
        assertThrows(IllegalArgumentException.class, () -> navigation.page("x".repeat(201), null, 1, 12));
        assertDoesNotThrow(() -> navigation.page("x".repeat(200), null, 1, 50));
    }
}
