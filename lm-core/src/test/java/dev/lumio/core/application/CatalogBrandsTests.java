package dev.lumio.core.application;

import dev.lumio.core.domain.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class CatalogBrandsTests {
    private CatalogItem item(String id,boolean available,String...brands) {
        var attributes=java.util.Arrays.stream(brands).map(value -> new VariantAttribute("Marca",value)).toList();
        return new CatalogItem(id,id,id,"",List.of(),List.of(),available,
            List.of(new CatalogVariant(id+"-v",id,id,List.of(),100,available)),CatalogItemType.PRODUCT,attributes);
    }
    private Catalog catalog() {return new Catalog("Test","","USD",2,"",List.of(),List.of(item("one",true,"A & B","A & B"),item("two",false,"A & B"),item("three",true,"Álamo"),item("unbranded",true)));}
    @Test void countsProductsOnceAndKeepsAllPublishedBrandsIndependentOfAvailabilityAndPaging() {
        var facet=new CatalogBrands("Marca").facet(catalog());
        assertThat(facet.name()).isEqualTo("Marca");
        assertThat(facet.values()).containsExactly(new CatalogAttributeFacet.Value("A & B",2),new CatalogAttributeFacet.Value("Álamo",1));
        var page=new CatalogNavigation(this::catalog).page(catalog(),"","",1,1,CatalogSort.NAME_ASC,false,List.of(new CatalogAttributeFilter("Marca",List.of("A & B"))));
        assertThat(page.totalCount()).isEqualTo(2);assertThat(page.items()).hasSize(1);
        assertThat(page.facets().getFirst().values()).contains(new CatalogAttributeFacet.Value("Álamo",1));
        assertThat(new CatalogBrands("Marca").facet(catalog()).values()).hasSize(2);
    }
    @Test void attributeNameIsExplicitAndMissingBrandsAreAnEmptyIndexWithoutInventedValues() {
        assertThat(new CatalogBrands("Brand").facet(catalog()).values()).isEmpty();
        for(var name:List.of(""," Marca","Brand ","a".repeat(121)))assertThatThrownBy(()->new CatalogBrands(name)).isInstanceOf(IllegalArgumentException.class);
    }
}
