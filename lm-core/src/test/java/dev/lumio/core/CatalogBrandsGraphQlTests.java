package dev.lumio.core;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.graphql.test.tester.HttpGraphQlTester;
import org.springframework.test.web.reactive.server.WebTestClient;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"lumio.catalog.location=classpath:catalog/brands.json","lumio.catalog.brand-attribute=Brand"})
class CatalogBrandsGraphQlTests {
    @LocalServerPort int port;
    private HttpGraphQlTester tester() {return HttpGraphQlTester.create(WebTestClient.bindToServer().baseUrl("http://localhost:"+port+"/graphql").build());}
    @Test void menuAndFacetsUseTheSameBrandAttributeWithoutDownloadingProductsForTheMenu() {
        tester().document("{catalog{brandFacet{name values{value count image{url alt}}}}itemPage(attributes:[{name:\"Brand\",values:[\"A & B\"]}],pageSize:1){totalCount items{id}facets{name values{value count}}}}")
            .execute().path("catalog.brandFacet.name").entity(String.class).isEqualTo("Brand")
            .path("catalog.brandFacet.values[0].value").entity(String.class).isEqualTo("A & B")
            .path("catalog.brandFacet.values[0].count").entity(Integer.class).isEqualTo(2)
            .path("catalog.brandFacet.values[0].image.url").entity(String.class).isEqualTo("/images/brand-a.png")
            .path("catalog.brandFacet.values[0].image.alt").entity(String.class).isEqualTo("A & B")
            .path("catalog.brandFacet.values[1].image").valueIsNull()
            .path("catalog.brandFacet.values").entityList(Object.class).hasSize(2)
            .path("catalog.brandFacet.values[1].value").entity(String.class).isEqualTo("Álamo")
            .path("itemPage.totalCount").entity(Integer.class).isEqualTo(2)
            .path("itemPage.items").entityList(Object.class).hasSize(1)
            .path("itemPage.facets[0].values[1].count").entity(Integer.class).isEqualTo(1);
    }
    @Test void brandFiltersCombineWithCategoryAvailabilityAndOtherBrandsAndKeepMetadataGlobal() {
        tester().document("{catalog{brandFacet{values{value count}}} itemPage(categoryId:\"clothing\",availableOnly:true,attributes:[{name:\"Brand\",values:[\"A & B\",\"Álamo\"]}]){totalCount} }")
            .execute().path("itemPage.totalCount").entity(Integer.class).isEqualTo(2)
            .path("catalog.brandFacet.values[0].count").entity(Integer.class).isEqualTo(2);
        tester().document("{itemPage(attributes:[{name:\"Brand\",values:[\"removed\"]}]){totalCount facets{name values{value count}}}}")
            .execute().path("itemPage.totalCount").entity(Integer.class).isEqualTo(0);
    }
}
