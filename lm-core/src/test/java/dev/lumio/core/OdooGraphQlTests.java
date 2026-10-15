package dev.lumio.core;

import dev.lumio.core.infrastructure.providers.odoo.OdooStub;
import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.graphql.test.tester.HttpGraphQlTester;
import static org.assertj.core.api.Assertions.*;
import java.time.Duration;
import java.util.Map;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties="lumio.catalog.provider=odoo")
class OdooGraphQlTests {
    @Test void campaignQueryUsesLumioContractAndErrorsDoNotLookLikeEmptyCampaigns() {
        stub.campaignRows="[{\"id\":9,\"title\":\"Nueva colección\",\"message\":\"Consulta las opciones publicadas\",\"action_label\":\"Explorar\",\"action_url\":\"/\",\"sequence\":10,\"active\":true,\"is_published\":true,\"website_id\":1,\"company_id\":7,\"starts_at\":false,\"ends_at\":false}]";
        String query="{ campaigns { id title message actionLabel actionUrl } }";
        var response=client().post().uri("/graphql").bodyValue(Map.of("query",query)).exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.errors").doesNotExist().jsonPath("$.data.campaigns[0].id").isEqualTo("campaign-9")
            .jsonPath("$.data.campaigns[0].actionUrl").isEqualTo("/").returnResult();
        assertThat(new String(response.getResponseBody(),java.nio.charset.StandardCharsets.UTF_8)).doesNotContain("test-only-api-key","lumio.campaign.slide","website_id");
        assertThat(stub.requests.stream().noneMatch(r->r.model().startsWith("product."))).isTrue();
        stub.status=401;
        client().post().uri("/graphql").bodyValue(Map.of("query",query)).exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.errors[0].extensions.reason").isEqualTo("AUTHENTICATION");
    }
    @org.springframework.beans.factory.annotation.Autowired dev.lumio.core.application.CatalogIdentity identity;

    @Test void favoriteLookupSharesOneSnapshotAndAuthenticationFailureIsNotAMissingItem() {
        stub.requests.clear();
        var query = "query($id:ID!){catalog{id name} itemsByIds(catalogId:$id,ids:[\"item-10\",\"missing\"]){id item{id variants{priceMinor}}}}";
        client().post().uri("/graphql").bodyValue(Map.of("query",query,"variables",Map.of("id",identity.id())))
            .exchange().expectStatus().isOk().expectBody().jsonPath("$.errors").doesNotExist()
            .jsonPath("$.data.itemsByIds[0].item.id").isEqualTo("item-10")
            .jsonPath("$.data.itemsByIds[0].item.variants[0].priceMinor").isEqualTo(1235)
            .jsonPath("$.data.itemsByIds[1].item").isEmpty();
        assertThat(stub.requests.stream().filter(r -> r.model().equals("product.template") && r.method().equals("search_read")).count()).isEqualTo(1);
        stub.status=401;
        client().post().uri("/graphql").bodyValue(Map.of("query",query,"variables",Map.of("id",identity.id())))
            .exchange().expectStatus().isOk().expectBody().jsonPath("$.errors[0].extensions.code").isEqualTo("CATALOG_UNAVAILABLE")
            .jsonPath("$.errors[0].extensions.reason").isEqualTo("AUTHENTICATION");
    }
    private static final OdooStub stub=startStub();
    private static OdooStub startStub() { try { return new OdooStub(); } catch(Exception ex) { throw new ExceptionInInitializerError(ex); } }
    @DynamicPropertySource static void settings(DynamicPropertyRegistry properties) {
        properties.add("ODOO_CAMPAIGNS_ENABLED",() -> "true");
        properties.add("ODOO_URL",stub::url); properties.add("ODOO_DATABASE",() -> "fixture-db"); properties.add("ODOO_API_KEY",() -> "test-only-api-key");
        properties.add("ODOO_WEBSITE_ID",() -> "1"); properties.add("ODOO_PRICELIST_ID",() -> "2"); properties.add("ODOO_WAREHOUSE_ID",() -> "3");
    }
    @LocalServerPort int port;
    @BeforeEach void reset() { stub.status=200; stub.published=true; stub.campaignRows="[]"; stub.comboProducts=false; stub.onlyCombos=false; stub.requests.clear(); }
    @AfterAll static void stop() { stub.close(); }
    private WebTestClient client() { return WebTestClient.bindToServer().baseUrl("http://localhost:"+port).responseTimeout(Duration.ofSeconds(15)).build(); }
    @Test void sharesSnapshotAcrossRootFieldsAndExposesOnlyLumioData() {
        var response=client().post().uri("/graphql").bodyValue(Map.of("query","""
            { catalog { name currency currencyDecimals items { id images { url } variants { priceMinor attributes { name value } } } }
              items { id } categories { id } itemBySlug(slug: "camiseta-10") { name }
              itemPage(page: 1, pageSize: 1) { totalCount items { slug } } }
            """)).exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.errors").doesNotExist().jsonPath("$.data.catalog.items[0].variants[0].priceMinor").isEqualTo(1235)
            .jsonPath("$.data.catalog.items[0].images[0].url").isEqualTo("/catalog-media/template/10")
            .jsonPath("$.data.itemPage.totalCount").isEqualTo(2).returnResult();
        assertThat(new String(response.getResponseBody(),java.nio.charset.StandardCharsets.UTF_8)).doesNotContain("test-only-api-key",stub.url(),"fixture-db","free_qty","product_tmpl_id");
        assertThat(stub.requests.stream().filter(r -> r.model().equals("product.template") && r.method().equals("search_read")).count()).isEqualTo(1);
    }
    @Test void upstreamAuthenticationErrorIsExplicitAndDoesNotReturnDemo() {
        stub.status=401;
        var response=client().post().uri("/graphql").bodyValue(Map.of("query","{ catalog { name } }"))
            .exchange().expectStatus().isOk().expectBody().jsonPath("$.errors[0].extensions.code").isEqualTo("CATALOG_UNAVAILABLE")
            .jsonPath("$.errors[0].extensions.reason").isEqualTo("AUTHENTICATION").returnResult();
        assertThat(new String(response.getResponseBody(),java.nio.charset.StandardCharsets.UTF_8)).doesNotContain("test-only-api-key","server secret","Demo");
    }
    @Test void publishedCombosDoNotBreakCatalogPagingOrFavoriteLookup() {
        stub.comboProducts=true;
        var query="""
            query($id:ID!) {
              catalog { items { id } }
              itemPage(pageSize:12) { totalCount items { id } }
              itemBySlug(slug:"combo-de-prueba-100") { id type available variants { priceMinor } comboGroups { id options { variantId extraPriceMinor available maxQuantity attributes { name value } } } }
              itemsByIds(catalogId:$id,ids:["item-100","item-10"]) { id item { id } }
            }
            """;
        client().post().uri("/graphql").bodyValue(Map.of("query",query,"variables",Map.of("id",identity.id())))
            .exchange().expectStatus().isOk().expectBody().jsonPath("$.errors").doesNotExist()
            .jsonPath("$.data.catalog.items.length()").isEqualTo(3)
            .jsonPath("$.data.itemPage.totalCount").isEqualTo(3)
            .jsonPath("$.data.itemBySlug.type").isEqualTo("COMBO")
            .jsonPath("$.data.itemBySlug.available").isEqualTo(true)
            .jsonPath("$.data.itemBySlug.variants[0].priceMinor").isEqualTo(10000)
            .jsonPath("$.data.itemBySlug.comboGroups[0].options[1].extraPriceMinor").isEqualTo(500)
            .jsonPath("$.data.itemBySlug.comboGroups[0].options[1].maxQuantity").isEqualTo(3)
            .jsonPath("$.data.itemsByIds[0].item.id").isEqualTo("item-100")
            .jsonPath("$.data.itemsByIds[1].item.id").isEqualTo("item-10");
        assertThat(stub.requests.stream().filter(r -> r.model().equals("product.template") && r.method().equals("search_read")).count()).isEqualTo(1);
    }
    @Test void comboOnlyCatalogRemainsBrowsable() {
        stub.onlyCombos=true;
        client().post().uri("/graphql").bodyValue(Map.of("query","{catalog{name items{id}} itemPage{totalCount items{id}}}"))
            .exchange().expectStatus().isOk().expectBody().jsonPath("$.errors").doesNotExist()
            .jsonPath("$.data.catalog.name").isEqualTo("Tienda de prueba")
            .jsonPath("$.data.catalog.items[0].id").isEqualTo("item-100")
            .jsonPath("$.data.itemPage.totalCount").isEqualTo(1)
            .jsonPath("$.data.itemPage.items[0].id").isEqualTo("item-100");
    }
    @Test void servesSafeImagesAndRefusesUnpublishedOnes() {
        client().get().uri("/catalog-media/template/10").exchange().expectStatus().isOk().expectHeader().contentType("image/png")
            .expectHeader().valueEquals("X-Content-Type-Options","nosniff").expectHeader().valueEquals("Cache-Control","no-store");
        stub.published=false;
        client().get().uri("/catalog-media/template/10").exchange().expectStatus().isNotFound();
        client().get().uri("/catalog-media/arbitrary/10").exchange().expectStatus().isNotFound();
    }
    @Test void imageFailuresReturnSafeGatewayError() {
        stub.status=403;
        client().get().uri("/catalog-media/template/10").exchange().expectStatus().isEqualTo(502).expectBody().jsonPath("$.reason").isEqualTo("ACCESS");
    }
    @Test void logoContractUsesSafeBackendUrlAndConstrainedImageProxy() {
        stub.logo=stub.image;
        try {
            client().post().uri("/graphql").bodyValue(Map.of("query","{ catalog { branding { logoUrl } } }"))
                .exchange().expectStatus().isOk().expectBody().jsonPath("$.data.catalog.branding.logoUrl").isEqualTo("/catalog-media/logo/1");
            client().get().uri("/catalog-media/logo/1").exchange().expectStatus().isOk()
                .expectHeader().contentType("image/png").expectHeader().valueEquals("X-Content-Type-Options","nosniff")
                .expectHeader().valueEquals("Content-Security-Policy","sandbox; default-src 'none'; style-src 'unsafe-inline'");
            client().get().uri("/catalog-media/logo/2").exchange().expectStatus().isNotFound();
        } finally { stub.logo=""; }
    }
    @Test void missingSlugStillReturnsNullAndPagingRemainsValidated() {
        var tester=HttpGraphQlTester.create(client().mutate().baseUrl("http://localhost:"+port+"/graphql").build());
        tester.document("{ itemBySlug(slug: \"missing\") { id } }").execute().path("itemBySlug").valueIsNull();
        stub.requests.clear();
        tester.document("{ itemPage(pageSize: 51) { totalCount } }").execute().errors().satisfy(errors -> assertThat(errors.getFirst().getMessage()).contains("pageSize"));
        assertThat(stub.requests).isEmpty();
    }
    @Test void invalidAttributeFiltersAreRejectedBeforeContactingOdoo() {
        stub.requests.clear();
        client().post().uri("/graphql").bodyValue(Map.of("query","{itemPage(attributes:[{name:\"Color\",values:[]}]){totalCount}}"))
            .exchange().expectStatus().isOk().expectBody().jsonPath("$.errors[0].extensions.classification").isEqualTo("BAD_REQUEST");
        assertThat(stub.requests).isEmpty();
    }
    @Test void exposesProviderIndependentBrandingAndSupportsSortingOdooSnapshot() {
        var tester=HttpGraphQlTester.create(client().mutate().baseUrl("http://localhost:"+port+"/graphql").build());
        tester.document("{ catalog { branding { logoUrl primaryColor } } itemPage(sort: PRICE_DESC, availableOnly: true, pageSize: 1) { totalCount items { id } } }").execute()
            .path("catalog.branding.logoUrl").entity(String.class).isEqualTo("")
            .path("catalog.branding.primaryColor").entity(String.class).isEqualTo("#234d46")
            .path("itemPage.totalCount").entity(Integer.class).isEqualTo(2)
            .path("itemPage.items[0].id").entity(String.class).isEqualTo("item-10");
        tester.document("{ itemPage(sort: POPULAR) { totalCount } }").execute().errors().satisfy(errors -> assertThat(errors).isNotEmpty());
    }
}
