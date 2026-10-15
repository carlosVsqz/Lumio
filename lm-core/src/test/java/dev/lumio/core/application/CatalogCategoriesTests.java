package dev.lumio.core.application;

import dev.lumio.core.domain.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CatalogCategoriesTests {
    private final List<Category> categories=List.of(new Category("root","root","Root",""),new Category("child","child","Child","","root"),
        new Category("deep","deep","Deep","","child"),new Category("other","other","Other",""));
    private CatalogItem item(String id,List<String> categories,boolean available) {
        return new CatalogItem(id,id,id,"Searchable",categories,List.of(),available,List.of(new CatalogVariant(id+"-v",id,id,List.of(),100,available)));
    }
    @Test void categoryFiltersIncludeDescendantsBeforeSearchStockCountsAndPagingWithoutDuplicates() {
        var catalog=new Catalog("Test","","USD",2,"",categories,List.of(item("a",List.of("child"),true),item("b",List.of("root","deep"),false),item("c",List.of("other"),true)));
        var navigation=new CatalogNavigation(()->catalog);
        assertEquals(2,navigation.page(null,"root",1,1).totalCount());
        assertEquals("b",navigation.page(null,"root",2,1).items().getFirst().id());
        assertEquals(2,navigation.page(null,"child",1,12).totalCount());
        assertEquals(1,navigation.page(null,"deep",1,12).totalCount());
        assertEquals(1,navigation.page(catalog,"Searchable","root",1,12,CatalogSort.CATALOG_ORDER,true).totalCount());
        assertEquals(0,navigation.page("unknown","root",1,12).totalCount());
        assertEquals(0,navigation.page(null,"missing",1,12).totalCount());
    }
    @Test void rejectsMissingParentsSelfReferencesAndCyclesButAcceptsDeepAndFlatCatalogs() {
        assertDoesNotThrow(()->CatalogCategories.validate(categories));
        for(var invalid:List.of(
            List.of(new Category("a","a","A","","missing")),
            List.of(new Category("a","a","A","","a")),
            List.of(new Category("a","a","A","","b"),new Category("b","b","B","","a"))))
            assertThrows(IllegalArgumentException.class,()->CatalogCategories.validate(invalid));
    }
}
