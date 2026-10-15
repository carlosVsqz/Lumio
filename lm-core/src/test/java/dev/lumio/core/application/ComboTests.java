package dev.lumio.core.application;

import dev.lumio.core.domain.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.DefaultResourceLoader;
import dev.lumio.core.infrastructure.providers.JsonCatalogProvider;
import static org.junit.jupiter.api.Assertions.*;

class ComboTests {
    private ComboOption option(String id,String reference,int stock) {
        return new ComboOption(id,reference,id,List.of(),0,true,stock);
    }
    @Test void sharedStockMustAllowOneChoiceInEachGroupAndCanBeReassigned() {
        var a=option("a","shared",1);var b=option("b","other",1);
        assertFalse(ComboAvailability.canConfigure(List.of(new ComboGroup("one","One",List.of(a)),new ComboGroup("two","Two",List.of(a)))));
        assertTrue(ComboAvailability.canConfigure(List.of(new ComboGroup("one","One",List.of(a,b)),new ComboGroup("two","Two",List.of(a)))));
        assertFalse(ComboAvailability.canConfigure(List.of(new ComboGroup("empty","Empty",List.of()))));
    }
    @Test void priceSortingIncludesMandatoryComponentExtras() {
        var catalog=new JsonCatalogProvider(new DefaultResourceLoader(),"classpath:catalog/combos.json").catalog();
        var navigation=new CatalogNavigation(()->catalog);
        var page=navigation.page(catalog,null,null,1,12,CatalogSort.PRICE_ASC,false);
        assertEquals(List.of("asesoria","combo-ejemplo","camiseta"),page.items().stream().map(CatalogItem::id).toList());
        var combo=catalog.items().getLast();
        var groups=combo.comboGroups().stream().map(group -> new ComboGroup(group.id(),group.name(),group.options().stream()
            .map(option -> new ComboOption(option.id(),option.variantId(),option.name(),option.attributes(),10000,option.available(),option.maxQuantity())).toList())).toList();
        var expensive=new CatalogItem(combo.id(),combo.slug(),combo.name(),combo.description(),combo.categoryIds(),combo.images(),
            combo.available(),combo.variants(),combo.type(),combo.attributes(),groups);
        var changed=new Catalog(catalog.name(),catalog.description(),catalog.currency(),catalog.currencyDecimals(),catalog.whatsappNumber(),catalog.categories(),
            List.of(catalog.items().getFirst(),catalog.items().get(1),expensive));
        assertEquals("combo-ejemplo",navigation.page(changed,null,null,1,12,CatalogSort.PRICE_ASC,false).items().getLast().id());
    }
}
