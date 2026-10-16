package dev.lumio.core.infrastructure.providers.odoo;

import dev.lumio.core.application.CatalogUnavailableException;
import dev.lumio.core.domain.CatalogItemType;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import static org.assertj.core.api.Assertions.*;

class OdooCatalogProviderTests {
    @Test void attributeLogosAcceptSafeSvgWhileKeepingPublicationAndActiveContentGuards() {
        stub.classification=true;stub.attributeImages=true;
        stub.image=java.util.Base64.getEncoder().encodeToString("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 70 70'><path d='M0 0h70v70H0z'/></svg>".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(provider().catalog().attributeImages().getFirst().image().url()).isEqualTo("/catalog-media/attribute/33");
        assertThat(provider().image("attribute",33).contentType()).isEqualTo("image/svg+xml");
        // Product photography still uses the raster-only path.
        assertFailure(()->provider().image("template",10),"PROTOCOL");
        stub.published=false;
        assertThatThrownBy(()->provider().image("attribute",33)).isInstanceOf(OdooCatalogProvider.ImageNotFoundException.class);
        stub.published=true;
        for(var svg:java.util.List.of("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>",
                "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
                "<svg xmlns='http://www.w3.org/2000/svg'><image href='https://example.com/image.png'/></svg>",
                "<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><svg xmlns='http://www.w3.org/2000/svg'>&x;</svg>")) {
            stub.image=java.util.Base64.getEncoder().encodeToString(svg.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            assertFailure(()->provider().image("attribute",33),"PROTOCOL");
        }
    }
    @Test void adaptsNativeAttributeImagesWithoutPublishingHiddenOrUnusedValues() {
        stub.classification=true;stub.attributeImages=true;
        var catalog=provider().catalog();
        assertThat(catalog.attributeImages()).hasSize(1);
        assertThat(new dev.lumio.core.application.CatalogBrands("Material").facet(catalog).values().getFirst().image().url()).isEqualTo("/catalog-media/attribute/33");
        stub.classificationHidden=true;
        assertThat(provider().catalog().attributeImages()).isEmpty();
        stub.classificationHidden=false;stub.attributeValueActive=false;
        assertThat(provider().catalog().attributeImages()).isEmpty();
        stub.attributeValueActive=true;stub.attributeImageSchemaAvailable=false;
        assertThat(provider().catalog().attributeImages()).isEmpty();
    }
    @Test void attributeImageProxyChecksPublicationVisibilityActivityAndImageFormat() {
        stub.classification=true;stub.attributeImages=true;
        assertThat(provider().image("attribute",33).contentType()).isEqualTo("image/png");
        assertThat(stub.requests.stream().filter(request -> request.model().equals("product.template.attribute.value") && request.method().equals("read")))
            .anySatisfy(request -> assertThat(request.body().path("context").path("bin_size").asBoolean()).isFalse());
        stub.published=false;
        assertThatThrownBy(()->provider().image("attribute",33)).isInstanceOf(OdooCatalogProvider.ImageNotFoundException.class);
        stub.published=true;stub.classificationHidden=true;
        assertThatThrownBy(()->provider().image("attribute",33)).isInstanceOf(OdooCatalogProvider.ImageNotFoundException.class);
        stub.classificationHidden=false;stub.attributeValueActive=false;
        assertThatThrownBy(()->provider().image("attribute",33)).isInstanceOf(OdooCatalogProvider.ImageNotFoundException.class);
        stub.attributeValueActive=true;stub.image="!invalid";
        assertFailure(()->provider().image("attribute",33),"PROTOCOL");
        stub.status=401;assertFailure(()->provider().image("attribute",33),"AUTHENTICATION");
    }
    @Test void keepsVariantImagesSeparateAndInheritsTemplateImagesOnlyWhenThereIsNoOverride() {
        stub.ownVariantImage=true;stub.extraImage=true;stub.sharedImage=true;
        var item=provider().catalog().items().getFirst();
        assertThat(item.variants().getFirst().images()).extracting(image -> image.url())
            .containsExactly("/catalog-media/template/10","/catalog-media/extra/41","/catalog-media/extra/42");
        assertThat(item.variants().get(1).images()).extracting(image -> image.url())
            .containsExactly("/catalog-media/variant/12","/catalog-media/extra/42");
        assertThat(item.images()).extracting(image -> image.url()).contains("/catalog-media/variant/12","/catalog-media/extra/41");
    }
    OdooStub stub;
    @BeforeEach void start() throws Exception { stub=new OdooStub(); }
    @AfterEach void stop() { stub.close(); }
    private OdooCatalogProvider provider() { return provider(OdooSettings.StockPolicy.FREE_STOCK,3000); }
    private OdooCatalogProvider provider(OdooSettings.StockPolicy policy,int timeout) { var settings=stub.settings(policy,timeout); return new OdooCatalogProvider(new OdooJson2Client(settings),settings); }
    @Test void adaptsVariantsPricelistCurrencyCategoriesImagesAndServices() {
        var catalog=provider().catalog();
        assertThat(catalog.name()).isEqualTo("Tienda de prueba");
        assertThat(catalog.currency()).isEqualTo("USD"); assertThat(catalog.currencyDecimals()).isEqualTo(2);
        assertThat(catalog.whatsappNumber()).isEmpty();
        assertThat(catalog.categories().getFirst().id()).isEqualTo("category-5");
        var item=catalog.items().getFirst();
        assertThat(item.id()).isEqualTo("item-10"); assertThat(item.slug()).isEqualTo("camiseta-10");
        assertThat(item.description()).isEqualTo("Descripción real");
        assertThat(item.images().getFirst().url()).isEqualTo("/catalog-media/template/10");
        assertThat(item.variants()).hasSize(2);
        assertThat(item.variants().getFirst().attributes().getFirst().name()).isEqualTo("Talla");
        assertThat(item.variants().getFirst().attributes().getFirst().value()).isEqualTo("S");
        assertThat(item.variants().getFirst().priceMinor()).isEqualTo(1235);
        assertThat(item.variants().get(1).priceMinor()).isEqualTo(2250);
        assertThat(item.variants().getFirst().available()).isFalse(); // Physical/forecast 999 are deliberately irrelevant.
        assertThat(item.variants().get(1).available()).isTrue();
        assertThat(catalog.items().get(1).type()).isEqualTo(CatalogItemType.SERVICE);
        assertThat(catalog.items().get(1).available()).isTrue();
        assertThat(stub.requests).allSatisfy(r -> { assertThat(r.authorization()).isEqualTo("Bearer test-only-api-key"); assertThat(r.database()).isEqualTo("fixture-db"); assertThat(r.method()).isIn("fields_get","read","search_read","get_contextual_price"); });
        var priceRequest=stub.requests.stream().filter(r -> r.method().equals("get_contextual_price")).findFirst().orElseThrow();
        assertThat(priceRequest.body().path("context").path("pricelist").intValue()).isEqualTo(2);
        assertThat(priceRequest.body().path("context").path("uom").intValue()).isEqualTo(6);
        var stockRequest=stub.requests.stream().filter(r -> r.model().equals("product.product") && r.method().equals("search_read")).findFirst().orElseThrow();
        assertThat(stockRequest.body().path("context").path("warehouse_id").intValue()).isEqualTo(3);
        assertThat(stockRequest.body().path("fields").toString()).doesNotContain("list_price","qty_available","virtual_available");
        var templates=stub.requests.stream().filter(r -> r.model().equals("product.template") && r.method().equals("search_read")).findFirst().orElseThrow();
        assertThat(templates.body().path("domain").toString()).contains("is_published","website_id","company_id","sale_ok");
    }
    @Test void websitePolicyExplicitlyAllowsBackordersButFreeStockDoesNot() {
        stub.backorder=true;
        assertThat(provider().catalog().items().getFirst().variants().getFirst().available()).isFalse();
        assertThat(provider(OdooSettings.StockPolicy.WEBSITE,3000).catalog().items().getFirst().variants().getFirst().available()).isTrue();
    }
    @Test void adaptsPublishedCombosWithConcreteVariantsStockAndPricelistBasePrice() {
        stub.comboProducts=true;
        var catalog=provider().catalog();
        assertThat(catalog.items()).extracting(item -> item.id()).containsExactly("item-100","item-10","item-20");
        var combo=catalog.items().getFirst();
        assertThat(combo.type()).isEqualTo(CatalogItemType.COMBO);
        assertThat(combo.available()).isTrue();
        assertThat(combo.variants().getFirst().priceMinor()).isEqualTo(10000);
        assertThat(combo.comboGroups()).hasSize(2);
        var choices=combo.comboGroups().getFirst().options();
        assertThat(choices.getFirst().available()).isFalse();
        assertThat(choices.get(1).variantId()).isEqualTo("variant-12");
        assertThat(choices.get(1).extraPriceMinor()).isEqualTo(500);
        assertThat(choices.get(1).maxQuantity()).isEqualTo(3);
        assertThat(choices.get(1).attributes().getFirst().value()).isEqualTo("M");
        assertThat(combo.comboGroups().getLast().options().getFirst().maxQuantity()).isNull();
        assertThat(stub.requests.stream().filter(r -> r.model().equals("product.template") && r.method().equals("search_read")))
            .allSatisfy(r -> assertThat(r.body().path("domain").toString()).doesNotContain("combo"));
    }
    @Test void supportsComboOnlyCatalogAndUnpublishedComponents() {
        stub.onlyCombos=true;
        var combo=provider().catalog().items().getFirst();
        assertThat(combo.available()).isTrue();
        assertThat(combo.comboGroups().getFirst().options()).hasSize(2);
        assertThat(stub.requests.stream().filter(r -> r.model().equals("product.product") && r.method().equals("search_read")))
            .anySatisfy(r -> assertThat(r.body().path("context").path("active_test").asBoolean(true)).isFalse());
    }
    @Test void convertsSignedComboExtrasIntoPricelistCurrencyWithoutUsingComponentListPrice() {
        stub.onlyCombos=true; stub.comboCurrency=8; stub.comboExtra="5.01";
        assertThat(provider().catalog().items().getFirst().comboGroups().getFirst().options().get(1).extraPriceMinor()).isEqualTo(251);
        stub.comboExtra="-5.01";
        assertThat(provider().catalog().items().getFirst().comboGroups().getFirst().options().get(1).extraPriceMinor()).isEqualTo(-251);
        stub.sourceRate="0"; assertFailure(provider()::catalog,"PRICE");
    }
    @Test void comboStockUsesFreeStockAndExplicitBackorderPolicy() {
        stub.onlyCombos=true; stub.componentStock=0;
        assertThat(provider().catalog().items().getFirst().available()).isFalse();
        stub.backorder=true;
        assertThat(provider().catalog().items().getFirst().available()).isFalse();
        assertThat(provider(OdooSettings.StockPolicy.WEBSITE,3000).catalog().items().getFirst().available()).isTrue();
    }
    @Test void rejectsCrossCompanyComponentsAndNeverReplacesFailedCombosWithDemo() {
        stub.onlyCombos=true; stub.componentCompany=8; assertFailure(provider()::catalog,"CONFIGURATION");
        stub.componentCompany=7; stub.status=401; assertFailure(provider()::catalog,"AUTHENTICATION");
    }
    @Test void usesCurrencyPrecisionAndRoundingQuantum() {
        stub.currency="KWD"; stub.currencyDecimals=3; stub.rounding="0.001"; stub.price="1.2345";
        assertThat(provider().catalog().items().getFirst().variants().getFirst().priceMinor()).isEqualTo(1235);
        stub.currency="USD"; stub.currencyDecimals=2; stub.rounding="0.05"; stub.price="1.23";
        assertThat(provider().catalog().items().getFirst().variants().getFirst().priceMinor()).isEqualTo(125);
    }
    @ParameterizedTest @CsvSource({"-1,PRICE","21474836.48,PRICE","\"not money\",PROTOCOL"})
    void rejectsInvalidOrOverflowPrices(String price,String reason) { stub.price=price; assertFailure(provider()::catalog,reason); }
    @ParameterizedTest @CsvSource({"401,AUTHENTICATION","403,ACCESS","404,COMPATIBILITY","429,RATE_LIMIT","500,UPSTREAM"})
    void surfacesSafeHttpErrorsWithoutFallback(int status,String reason) { stub.status=status; assertFailure(provider()::catalog,reason); }
    @Test void failsOnTimeout() { stub.delayMs=250; assertFailure(provider(OdooSettings.StockPolicy.FREE_STOCK,50)::catalog,"CONNECTION"); }
    @Test void failsOnRefusedConnection() { var provider=provider(); stub.close(); assertFailure(provider::catalog,"CONNECTION"); }
    @Test void rejectsInvalidJson() { stub.malformed=true; assertFailure(provider()::catalog,"PROTOCOL"); }
    @Test void detectsMissingFieldsBeforeReadingProducts() { stub.missingFreeQty=true; assertFailure(provider()::catalog,"COMPATIBILITY"); }
    @Test void rejectsCrossCompanyWarehouse() { stub.company=8; assertFailure(provider()::catalog,"CONFIGURATION"); }
    @Test void fetchesAuthenticatedImagesOnlyForPublishedItems() {
        var provider=provider();
        assertThat(provider.image("template",10).contentType()).isEqualTo("image/png");
        var request=stub.requests.getLast();
        assertThat(request.body().path("context").path("bin_size").asBoolean()).isFalse();
        stub.published=false;
        assertThatThrownBy(() -> provider.image("template",10)).isInstanceOf(OdooCatalogProvider.ImageNotFoundException.class);
        assertThatThrownBy(() -> provider.image("res.users",10)).isInstanceOf(OdooCatalogProvider.ImageNotFoundException.class);
    }
    @Test void rejectsActiveContentImagesAndMalformedBase64() {
        stub.image=java.util.Base64.getEncoder().encodeToString("<svg onload='alert(1)'/>".getBytes());
        assertFailure(() -> provider().image("template",10),"PROTOCOL");
        stub.image="!invalid"; assertFailure(() -> provider().image("template",10),"PROTOCOL");
    }
    @Test void credentialsAndUrlAreNeverPrintableInSettings() { assertThat(stub.settings(OdooSettings.StockPolicy.FREE_STOCK,1000).toString()).doesNotContain(stub.url(),"test-only-api-key","fixture-db"); }
    @Test void mapsConfiguredWebsiteLogoAndProxiesOnlyThatWebsite() {
        stub.logo=stub.image;
        var provider=provider();
        assertThat(provider.catalog().branding().logoUrl()).isEqualTo("/catalog-media/logo/1");
        assertThat(provider.image("logo",1).contentType()).isEqualTo("image/png");
        assertThat(stub.requests.getLast().body().path("context").path("bin_size").asBoolean()).isFalse();
        stub.requests.clear();
        assertThatThrownBy(() -> provider.image("logo",2)).isInstanceOf(OdooCatalogProvider.ImageNotFoundException.class);
        assertThat(stub.requests).isEmpty();
        stub.logo="";
        assertThatThrownBy(() -> provider.image("logo",1)).isInstanceOf(OdooCatalogProvider.ImageNotFoundException.class);
    }
    @Test void siteLogoTakesPrecedenceAndAbsentLogosKeepProviderIndependentFallbacks() {
        var settings=stub.settings(OdooSettings.StockPolicy.FREE_STOCK,3000);
        var branding=new dev.lumio.core.domain.CatalogBranding("/fallback.png","#456789");
        var provider=new OdooCatalogProvider(new OdooJson2Client(settings),settings,branding);
        assertThat(provider.catalog().branding()).isEqualTo(branding);
        stub.logo=stub.image;
        assertThat(provider.catalog().branding()).isEqualTo(new dev.lumio.core.domain.CatalogBranding("/catalog-media/logo/1","#456789"));
        stub.logoSchemaAvailable=false;
        assertThat(new OdooCatalogProvider(new OdooJson2Client(settings),settings,branding).catalog().branding()).isEqualTo(branding);
    }
    @Test void supportsSafeOdooSvgLogosAndRejectsActiveOrExternalContent() {
        stub.logo=java.util.Base64.getEncoder().encodeToString("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M0 0h20v20H0z'/></svg>".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(provider().image("logo",1).contentType()).isEqualTo("image/svg+xml");
        for(var svg:java.util.List.of("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>",
                "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
                "<svg xmlns='http://www.w3.org/2000/svg'><image href='https://example.com/image.png'/></svg>",
                "<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><svg xmlns='http://www.w3.org/2000/svg'>&x;</svg>")) {
            stub.logo=java.util.Base64.getEncoder().encodeToString(svg.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            assertFailure(() -> provider().image("logo",1),"PROTOCOL");
        }
        stub.logo="!invalid"; assertFailure(() -> provider().image("logo",1),"PROTOCOL");
        stub.status=401; assertFailure(() -> provider().image("logo",1),"AUTHENTICATION");
    }
    @Test void includesVariantGalleryImagesWithoutTemplateRelation() {
        stub.extraImage=true; var provider=provider();
        assertThat(provider.catalog().items().getFirst().images()).extracting(i -> i.url()).contains("/catalog-media/extra/41");
        assertThat(provider.image("extra",41).contentType()).isEqualTo("image/png");
        stub.published=false;
        assertThatThrownBy(() -> provider.image("extra",41)).isInstanceOf(OdooCatalogProvider.ImageNotFoundException.class);
    }
    @Test void rejectsDuplicateVariantCombinations() { stub.duplicateCombination=true; assertFailure(provider()::catalog,"MAPPING"); }
    @Test void mapsClassificationWithoutVariantsAndRespectsOdooFilterVisibility() {
        stub.classification=true;
        var item=provider().catalog().items().getFirst();
        assertThat(item.attributes()).contains(new dev.lumio.core.domain.VariantAttribute("Material","Algodón"));
        assertThat(item.variants()).hasSize(2);
        assertThat(item.variants().getFirst().attributes()).noneMatch(attribute -> attribute.name().equals("Material"));
        assertThat(new dev.lumio.core.application.CatalogBrands("Material").facet(provider().catalog()).values())
            .containsExactly(new dev.lumio.core.application.CatalogAttributeFacet.Value("Algodón",1));
        stub.classificationHidden=true;
        assertThat(provider().catalog().items().getFirst().attributes()).noneMatch(attribute -> attribute.name().equals("Material"));
        assertThat(new dev.lumio.core.application.CatalogBrands("Material").facet(provider().catalog()).values()).isEmpty();
    }
    @Test void recordLimitsFailInsteadOfSilentlyTruncating() {
        var s=stub.settings(OdooSettings.StockPolicy.FREE_STOCK,3000);
        var limited=new OdooSettings(s.url(),s.database(),s.apiKey(),s.websiteId(),s.pricelistId(),s.warehouseId(),s.stockPolicy(),s.language(),s.businessName(),s.businessDescription(),s.whatsappNumber(),s.connectTimeoutMs(),s.requestTimeoutMs(),1,s.maxImageBytes());
        assertFailure(new OdooCatalogProvider(new OdooJson2Client(limited),limited)::catalog,"LIMIT");
    }
    @Test void enforcesDecodedImageLimit() {
        var s=stub.settings(OdooSettings.StockPolicy.FREE_STOCK,3000);
        var limited=new OdooSettings(s.url(),s.database(),s.apiKey(),s.websiteId(),s.pricelistId(),s.warehouseId(),s.stockPolicy(),s.language(),s.businessName(),s.businessDescription(),s.whatsappNumber(),s.connectTimeoutMs(),s.requestTimeoutMs(),s.maxRecords(),7);
        assertFailure(() -> new OdooCatalogProvider(new OdooJson2Client(limited),limited).image("template",10),"LIMIT");
    }
    private static void assertFailure(Runnable action,String reason) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(CatalogUnavailableException.class,ex -> {
            assertThat(ex.reason()).isEqualTo(reason); assertThat(ex.getMessage()).doesNotContain("server secret","test-only-api-key");
        });
    }
}
