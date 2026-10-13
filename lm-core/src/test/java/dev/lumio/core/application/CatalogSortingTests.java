package dev.lumio.core.application;
import dev.lumio.core.domain.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class CatalogSortingTests {
    private CatalogItem item(String id,String name,boolean available,CatalogVariant... variants) { return new CatalogItem(id,id,name,"",List.of("cat"),List.of(),available,List.of(variants)); }
    private CatalogVariant variant(String id,int price,boolean available) { return new CatalogVariant(id,id,id,List.of(),price,available); }
    private final CatalogNavigation navigation=new CatalogNavigation(() -> {throw new AssertionError("Use supplied snapshot");});
    private Catalog catalog() { return new Catalog("Test","","USD",2,"",List.of(),List.of(
        item("z","Zeta",true,variant("z1",1,false),variant("z2",500,true)),
        item("b","Árbol",true,variant("b1",300,true)),
        item("a","árbol",true,variant("a1",300,true)),
        item("c","Café",false,variant("c1",400,true)))); }
    @Test void sortsBeforePagingWithStableTiesAndDisplayedVariantPrices() {
        var first=navigation.page(catalog(),null,null,1,2,CatalogSort.PRICE_ASC,false);
        assertThat(first.totalCount()).isEqualTo(4); assertThat(first.items()).extracting(CatalogItem::id).containsExactly("a","b");
        assertThat(navigation.page(catalog(),null,null,2,2,CatalogSort.PRICE_ASC,false).items()).extracting(CatalogItem::id).containsExactly("c","z");
        assertThat(navigation.page(catalog(),null,null,1,12,CatalogSort.PRICE_DESC,false).items()).extracting(CatalogItem::id).containsExactly("z","c","a","b");
        assertThat(navigation.page(catalog(),null,null,1,12,CatalogSort.NAME_ASC,false).items()).extracting(CatalogItem::id).containsExactly("a","b","c","z");
        assertThat(navigation.page(catalog(),null,null,1,12,CatalogSort.CATALOG_ORDER,false).items()).extracting(CatalogItem::id).containsExactly("z","b","a","c");
    }
    @Test void availabilityCombinesItemVariantCategoryAndSearchBeforeCounting() {
        assertThat(navigation.page(catalog(),null,"cat",1,12,CatalogSort.PRICE_ASC,true).items()).extracting(CatalogItem::id).containsExactly("a","b","z");
        assertThat(navigation.page(catalog(),"cafe",null,1,12,CatalogSort.CATALOG_ORDER,true).totalCount()).isZero();
    }
}
