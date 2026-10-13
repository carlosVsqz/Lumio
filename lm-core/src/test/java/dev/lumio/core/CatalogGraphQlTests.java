package dev.lumio.core;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.graphql.test.tester.HttpGraphQlTester;
import org.springframework.test.web.reactive.server.WebTestClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "lumio.catalog.location=classpath:catalog/test.json")
class CatalogGraphQlTests {
    @Test void exposesAttributeFacetsAndFiltersBeforePaginationThroughGraphQl() {
        tester().document("query($filters:[CatalogAttributeFilterInput!]){itemPage(attributes:$filters,pageSize:1){totalCount facets{name values{value count}} items{id attributes{name value}}}}")
            .variable("filters",java.util.List.of(java.util.Map.of("name","size","values",java.util.List.of("M")))).execute()
            .path("itemPage.totalCount").entity(Integer.class).isEqualTo(1)
            .path("itemPage.items[0].id").entity(String.class).isEqualTo("product")
            .path("itemPage.facets[0].name").entity(String.class).isEqualTo("size")
            .path("itemPage.facets[0].values[0].count").entity(Integer.class).isEqualTo(1);
        tester().document("{itemPage(attributes:[{name:\"size\",values:[\"M\"]}],availableOnly:true){totalCount facets{name}}}").execute()
            .path("itemPage.totalCount").entity(Integer.class).isEqualTo(0);
    }
    @Test void oldJsonCatalogExposesAnEmptyCampaignFeed() {
        tester().document("{ campaigns { id title message actionLabel actionUrl } }").execute().path("campaigns").entityList(Object.class).hasSize(0);
    }
    private String catalogId() { return tester().document("{ catalog { id } }").execute().path("catalog.id").entity(String.class).get(); }
    private static final String LOOKUP = "query($ids:[ID!]!,$catalogId:ID!){itemsByIds(ids:$ids,catalogId:$catalogId){id item{id slug available variants{priceMinor available}}}}";

    @Test void batchLookupReturnsOnlyRequestedItemsInOrderAndExplicitMissingEntries() {
        tester().document(LOOKUP).variable("catalogId", catalogId()).variable("ids", java.util.List.of("service", "missing", "product")).execute()
            .path("itemsByIds").entityList(Object.class).hasSize(3)
            .path("itemsByIds[0].item.id").entity(String.class).isEqualTo("service")
            .path("itemsByIds[1].id").entity(String.class).isEqualTo("missing")
            .path("itemsByIds[1].item").valueIsNull()
            .path("itemsByIds[2].item.variants[0].available").entity(Boolean.class).isEqualTo(false)
            .path("itemsByIds[2].item.variants[0].priceMinor").entity(Integer.class).isEqualTo(123456);
    }
    @Test void validatesBatchSizeIdsAndCatalogIdentity() {
        String id = catalogId();
        for (var invalid : java.util.List.of(java.util.List.<String>of(), java.util.List.of("product", "product"),
            java.util.List.of("bad/id"), java.util.List.of("a".repeat(201)),
            java.util.stream.IntStream.range(0,101).mapToObj(i -> "id-"+i).toList())) {
            tester().document(LOOKUP).variable("catalogId", id).variable("ids", invalid).execute().errors()
                .satisfy(errors -> assertEquals("BAD_REQUEST", errors.getFirst().getExtensions().get("classification")));
        }
        tester().document(LOOKUP).variable("catalogId", "another-catalog").variable("ids",java.util.List.of("product")).execute().errors()
            .satisfy(errors -> assertTrue(errors.getFirst().getMessage().contains("catalogId")));
        tester().document(LOOKUP).variable("catalogId", id).variable("ids",java.util.stream.IntStream.range(0,100).mapToObj(i -> "missing-"+i).toList())
            .execute().path("itemsByIds").entityList(Object.class).hasSize(100);
    }
    @Test
    void exposesExplicitServiceTypeAndLegacyProductDefault() {
        tester().document("{ items { id type } }").execute()
            .path("items[0].type").entity(String.class).isEqualTo("PRODUCT")
            .path("items[1].type").entity(String.class).isEqualTo("SERVICE");
    }
    @LocalServerPort
    int port;

    @Test
    void exposesConfiguredJsonCatalogAndGenericVariantsOverHttp() {
        var client = WebTestClient.bindToServer().baseUrl("http://localhost:" + port + "/graphql").build();
        var tester = HttpGraphQlTester.create(client);
        tester.document("""
            { catalog {
                name description currency currencyDecimals whatsappNumber
                categories { id slug name description }
                items { id slug name description categoryIds images { url alt } available
                  variants { id slug name priceMinor available attributes { name value } }
                }
              }
              categories { id } items { id variants { priceMinor } }
            }
            """)
            .execute()
            .path("catalog.name").entity(String.class).isEqualTo("Test Business")
            .path("catalog.description").entity(String.class).isEqualTo("Catalog from a JSON file")
            .path("catalog.currency").entity(String.class).isEqualTo("KWD")
            .path("catalog.currencyDecimals").entity(Integer.class).isEqualTo(3)
            .path("catalog.whatsappNumber").entity(String.class).isEqualTo("")
            .path("catalog.categories[0].id").entity(String.class).isEqualTo("products")
            .path("catalog.categories[0].slug").entity(String.class).isEqualTo("products")
            .path("catalog.items[0].categoryIds").entityList(String.class).contains("products")
            .path("catalog.items[0].images[0].alt").entity(String.class).isEqualTo("Example product")
            .path("catalog.items[0].images[0].url").entity(String.class).isEqualTo("/images/example.svg")
            .path("catalog.items[0].variants[0].priceMinor").entity(Integer.class).isEqualTo(123456)
            .path("catalog.items[0].variants[0].attributes[0].name").entity(String.class).isEqualTo("size")
            .path("catalog.items[0].variants[0].attributes[0].value").entity(String.class).isEqualTo("M")
            .path("catalog.items[0].variants[0].available").entity(Boolean.class).isEqualTo(false)
            .path("catalog.items[0].available").entity(Boolean.class).isEqualTo(true)
            .path("catalog.items[1].variants[0].attributes").entityList(Object.class).hasSize(0)
            .path("categories[0].id").entity(String.class).isEqualTo("products")
            .path("items[0].variants[0].priceMinor").entity(Integer.class).isEqualTo(123456);
    }

    @Test
    void priceContractUsesIntInsteadOfFloat() {
        var client = WebTestClient.bindToServer().baseUrl("http://localhost:" + port + "/graphql").build();
        HttpGraphQlTester.create(client)
            .document("{ __type(name: \"CatalogVariant\") { fields { name type { kind name ofType { name } } } } }")
            .execute().path("__type.fields[?(@.name == 'priceMinor')].type.ofType.name")
            .entityList(String.class).contains("Int");
    }

    @Test
    void filtersAndPaginatesOverHttpWithGraphQlVariables() {
        tester().document("""
            query($search: String, $category: ID, $page: Int!, $size: Int!) {
              itemPage(search: $search, categoryId: $category, page: $page, pageSize: $size) {
                totalCount totalPages page pageSize items { id variants { priceMinor } }
              }
            }
            """).variable("search", "example").variable("category", "products")
            .variable("page", 1).variable("size", 1).execute()
            .path("itemPage.totalCount").entity(Integer.class).isEqualTo(1)
            .path("itemPage.totalPages").entity(Integer.class).isEqualTo(1)
            .path("itemPage.pageSize").entity(Integer.class).isEqualTo(1)
            .path("itemPage.items[0].id").entity(String.class).isEqualTo("product")
            .path("itemPage.items[0].variants[0].priceMinor").entity(Integer.class).isEqualTo(123456);
        tester().document("{ itemPage(page: 2, pageSize: 1) { totalCount totalPages page items { id } } }")
            .execute().path("itemPage.totalCount").entity(Integer.class).isEqualTo(2)
            .path("itemPage.totalPages").entity(Integer.class).isEqualTo(2)
            .path("itemPage.page").entity(Integer.class).isEqualTo(2)
            .path("itemPage.items[0].id").entity(String.class).isEqualTo("service");
    }

    @ParameterizedTest
    @ValueSource(ints = {0, -1, 51, 2147483647})
    void rejectsPageSizesOverHttpAsBadRequest(int size) {
        tester().document("query($size: Int!) { itemPage(pageSize: $size) { totalCount } }")
            .variable("size", size).execute().errors().satisfy(errors -> {
                assertEquals(1, errors.size());
                assertEquals("BAD_REQUEST", errors.getFirst().getExtensions().get("classification"));
                assertTrue(errors.getFirst().getMessage().contains("pageSize"));
            });
    }

    @Test
    void exposesDefaultsEmptyResultsAndPageValidation() {
        tester().document("{ itemPage { page pageSize totalPages totalCount } }").execute()
            .path("itemPage.page").entity(Integer.class).isEqualTo(1)
            .path("itemPage.pageSize").entity(Integer.class).isEqualTo(12);
        tester().document("{ itemPage(search: \"missing\") { totalPages totalCount items { id } } }").execute()
            .path("itemPage.totalPages").entity(Integer.class).isEqualTo(0)
            .path("itemPage.items").entityList(Object.class).hasSize(0);
        tester().document("{ itemPage(page: 0) { totalCount } }").execute().errors()
            .satisfy(errors -> assertTrue(errors.getFirst().getMessage().contains("page")));
    }

    private HttpGraphQlTester tester() {
        return HttpGraphQlTester.create(WebTestClient.bindToServer()
            .baseUrl("http://localhost:" + port + "/graphql").build());
    }

    @Test
    void findsAnItemByExactSlugIncludingUnavailableVariants() {
        tester().document("""
            query($slug: String!) {
              itemBySlug(slug: $slug) {
                id slug categoryIds images { url alt }
                variants { id priceMinor available attributes { name value } }
              }
            }
            """).variable("slug", "product").execute()
            .path("itemBySlug.id").entity(String.class).isEqualTo("product")
            .path("itemBySlug.categoryIds").entityList(String.class).contains("products")
            .path("itemBySlug.images[0].alt").entity(String.class).isEqualTo("Example product")
            .path("itemBySlug.variants[0].priceMinor").entity(Integer.class).isEqualTo(123456)
            .path("itemBySlug.variants[0].available").entity(Boolean.class).isEqualTo(false);
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "Product", "", " product "})
    void unknownSlugReturnsNullWithoutGraphQlErrors(String slug) {
        tester().document("query($slug: String!) { itemBySlug(slug: $slug) { id } }")
            .variable("slug", slug).execute().path("itemBySlug").valueIsNull();
    }
}
