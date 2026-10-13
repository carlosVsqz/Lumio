package dev.lumio.core.application;

import dev.lumio.core.domain.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class CatalogAttributeFiltersTests {
    private VariantAttribute attribute(String name,String value) {return new VariantAttribute(name,value);}
    private CatalogVariant variant(String id,boolean available,String size,String color) {
        return new CatalogVariant(id,id,id,List.of(attribute("Talla",size),attribute("Color",color)),1000,available);
    }
    private CatalogItem clothing(String id,String material,List<CatalogVariant> variants) {
        var attributes=new ArrayList<VariantAttribute>();attributes.add(attribute("Material",material));
        variants.forEach(variant -> attributes.addAll(variant.attributes()));
        return new CatalogItem(id,id,id,"",List.of("ropa"),List.of(),true,variants,CatalogItemType.PRODUCT,attributes.stream().distinct().toList());
    }
    private Catalog catalog() {
        return new Catalog("Tienda","","GTQ",2,"",List.of(new Category("ropa","ropa","Ropa","")),List.of(
            clothing("camiseta","Algodón",List.of(variant("m-azul",true,"M","Azul"),variant("l-natural",false,"L","Natural"))),
            clothing("blusa","Lino",List.of(variant("s-natural",true,"S","Natural")))));
    }
    private CatalogAttributeFilter filter(String name,String...values) {return new CatalogAttributeFilter(name,List.of(values));}
    private CatalogItemPage page(boolean available,CatalogAttributeFilter...filters) {
        return new CatalogNavigation(() -> catalog()).page(catalog(),"","ropa",1,12,CatalogSort.CATALOG_ORDER,available,List.of(filters));
    }
    @Test void supportsClassificationAndOrValuesWithinAnAttributeAndAndBetweenAttributes() {
        assertThat(page(false,filter("Material","Algodón","Lino")).totalCount()).isEqualTo(2);
        assertThat(page(false,filter("Material","Algodón"),filter("Color","Azul")).items()).extracting(CatalogItem::id).containsExactly("camiseta");
        assertThat(page(false,filter("Material","Lino"),filter("Talla","M")).totalCount()).isZero();
    }
    @Test void requiresOneCompatibleVariantAndItsAvailabilityRatherThanUnrelatedValuesOrStock() {
        assertThat(page(false,filter("Talla","L"),filter("Color","Azul")).totalCount()).isZero();
        assertThat(page(false,filter("Talla","L"),filter("Color","Natural")).totalCount()).isEqualTo(1);
        assertThat(page(true,filter("Talla","L"),filter("Color","Natural")).totalCount()).isZero();
    }
    @Test void facetsCountDistinctProductsAndRetainAlternativesForTheSameAttribute() {
        var page=page(false,filter("Talla","L"));
        var colors=page.facets().stream().filter(facet -> facet.name().equals("Color")).findFirst().orElseThrow();
        assertThat(colors.values()).containsExactly(new CatalogAttributeFacet.Value("Azul",0),new CatalogAttributeFacet.Value("Natural",1));
        var sizes=page.facets().stream().filter(facet -> facet.name().equals("Talla")).findFirst().orElseThrow();
        assertThat(sizes.values()).contains(new CatalogAttributeFacet.Value("M",1),new CatalogAttributeFacet.Value("L",1),new CatalogAttributeFacet.Value("S",1));
        assertThat(page(false).facets().stream().filter(f -> f.name().equals("Material")).findFirst().orElseThrow().values())
            .contains(new CatalogAttributeFacet.Value("Algodón",1));
    }
    @Test void unknownSelectionsProduceEmptyResultsWithRemovableZeroCountFacets() {
        var page=page(false,filter("Marca","Desconocida"));assertThat(page.totalCount()).isZero();
        assertThat(page.facets().stream().filter(f -> f.name().equals("Marca")).findFirst().orElseThrow().values())
            .containsExactly(new CatalogAttributeFacet.Value("Desconocida",0));
    }
    @Test void filteringAndFacetCountsPrecedePagingAndRemainScopedToCategoryAndSearch() {
        var navigation=new CatalogNavigation(this::catalog);
        var page=navigation.page(catalog(),"","ropa",2,1,CatalogSort.NAME_ASC,false,List.of(filter("Material","Algodón","Lino")));
        assertThat(page.items()).extracting(CatalogItem::id).containsExactly("camiseta");assertThat(page.totalCount()).isEqualTo(2);
        assertThat(navigation.page(catalog(),"blusa","ropa",1,1,CatalogSort.CATALOG_ORDER,false,List.of()).facets().stream().map(CatalogAttributeFacet::name)).contains("Material");
        assertThat(navigation.page(catalog(),"","missing",1,1,CatalogSort.CATALOG_ORDER,false,List.of()).facets()).isEmpty();
    }
    @Test void rejectsMalformedDuplicateAndOversizedFilterRequests() {
        for(var invalid:List.of(List.of(filter("","M")),List.of(filter("Color")),List.of(filter("Color","Azul","Azul")),List.of(filter("Color","Azul"),filter("Color","Natural")),
                List.of(filter("a".repeat(121),"x")),List.of(filter("Color","a".repeat(201))),List.of(new CatalogAttributeFilter("Color",Collections.nCopies(33,"x"))),
                java.util.stream.IntStream.range(0,17).mapToObj(i -> filter("A"+i,"x")).toList()))
            assertThatThrownBy(() -> CatalogAttributeFilters.validate(invalid)).isInstanceOf(IllegalArgumentException.class);
    }
}
