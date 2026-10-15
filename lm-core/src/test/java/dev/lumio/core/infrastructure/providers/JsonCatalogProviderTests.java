package dev.lumio.core.infrastructure.providers;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.core.io.DefaultResourceLoader;
import static org.junit.jupiter.api.Assertions.*;

class JsonCatalogProviderTests {
    @Test void readsAndValidatesOptionalAttributeImagesWithoutChangingVariantIdentity() throws IOException {
        var mapper=tools.jackson.databind.json.JsonMapper.builder().build();
        var root=(tools.jackson.databind.node.ObjectNode)mapper.readTree(example());
        var visuals=root.putArray("attributeImages");var visual=visuals.addObject().put("name","Marca").put("value","Real");
        var image=visual.putObject("image").put("url","/images/brand.png").put("alt","Real");
        var file=directory.resolve("brand-images.json");Files.writeString(file,mapper.writeValueAsString(root));
        var catalog=load(file).catalog();assertEquals("/images/brand.png",catalog.attributeImages().getFirst().image().url());
        assertThrows(UnsupportedOperationException.class,()->catalog.attributeImages().clear());
        for(var url:java.util.List.of("javascript:alert(1)","https://user:secret@example.test/logo.png","//example.test/logo.png")) {
            image.put("url",url);Files.writeString(file,mapper.writeValueAsString(root));assertThrows(IllegalArgumentException.class,()->load(file));
        }
        image.put("url","/images/brand.png");visuals.add(visual.deepCopy());
        Files.writeString(file,mapper.writeValueAsString(root));assertThrows(IllegalArgumentException.class,()->load(file));
    }
    @Test void variantImagesCanOverrideInheritOrExplicitlyRemoveSharedImages() throws IOException {
        var mapper=tools.jackson.databind.json.JsonMapper.builder().build();
        var root=mapper.readTree(example());
        var variant=(tools.jackson.databind.node.ObjectNode)root.path("items").get(0).path("variants").get(0);
        var file=directory.resolve("variant-images.json");Files.writeString(file,mapper.writeValueAsString(root));
        assertEquals(load(file).catalog().items().getFirst().images(),load(file).catalog().items().getFirst().variants().getFirst().images());
        variant.putArray("images").addObject().put("url","/images/variant.jpg").put("alt","Variante concreta");
        Files.writeString(file,mapper.writeValueAsString(root));
        assertEquals("/images/variant.jpg",load(file).catalog().items().getFirst().variants().getFirst().images().getFirst().url());
        for(var url:java.util.List.of("javascript:alert(1)","https://user:secret@example.test/image.jpg","//example.test/image.jpg")) {
            ((tools.jackson.databind.node.ObjectNode)variant.path("images").get(0)).put("url",url);
            Files.writeString(file,mapper.writeValueAsString(root));assertThrows(IllegalArgumentException.class,()->load(file));
        }
        variant.putArray("images");Files.writeString(file,mapper.writeValueAsString(root));
        assertTrue(load(file).catalog().items().getFirst().variants().getFirst().images().isEmpty());
        variant.putNull("images");Files.writeString(file,mapper.writeValueAsString(root));assertThrows(IllegalArgumentException.class,()->load(file));
    }
    @Test void mapsOptionalCategoryParentsAndValidatesTheirReferences() throws IOException {
        var mapper=tools.jackson.databind.json.JsonMapper.builder().build();
        var root=mapper.readTree(example());
        var parent=(tools.jackson.databind.node.ObjectNode)root.path("categories").get(0);
        var child=(tools.jackson.databind.node.ObjectNode)root.path("categories").get(1);
        child.put("parentId",parent.path("id").stringValue());
        var file=directory.resolve("hierarchy.json");Files.writeString(file,mapper.writeValueAsString(root));
        assertEquals("ropa",load(file).catalog().categories().get(1).parentId());
        child.put("parentId","missing");Files.writeString(file,mapper.writeValueAsString(root));
        assertThrows(IllegalArgumentException.class,()->load(file));
        child.put("parentId",parent.path("id").stringValue());parent.put("parentId",child.path("id").stringValue());
        Files.writeString(file,mapper.writeValueAsString(root));assertThrows(IllegalArgumentException.class,()->load(file));
    }
    @Test void readsGenericComboGroupsAndRejectsInvalidPricesOrReferences() throws IOException {
        var resource="classpath:catalog/combos.json";
        var combo=new JsonCatalogProvider(new DefaultResourceLoader(),resource).catalog().items().getLast();
        assertEquals(dev.lumio.core.domain.CatalogItemType.COMBO,combo.type());
        assertEquals(2,combo.comboGroups().size());
        assertEquals(500,combo.comboGroups().getFirst().options().getFirst().extraPriceMinor());
        String json=new String(new DefaultResourceLoader().getResource(resource).getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
        for (var mutation:java.util.List.of(json.replace("\"extraPriceMinor\": 500","\"extraPriceMinor\": 1.5"),
            json.replace("\"extraPriceMinor\": 500","\"extraPriceMinor\": -10001"),
            json.replace("\"variantId\": \"componente-azul\"","\"variantId\": \"invalid id\""),
            json.replace("\"maxQuantity\": 3","\"maxQuantity\": 0"),
            json.replace("\"id\": \"natural\"","\"id\": \"azul\""))) {
            var file=directory.resolve("combo-invalid.json");Files.writeString(file,mutation);
            assertThrows(IllegalArgumentException.class,()->load(file));
        }
    }
    @Test void readsOptionalClassificationAndKeepsVariantsUnchanged() throws IOException {
        var mapper=tools.jackson.databind.json.JsonMapper.builder().build();
        var root=mapper.readTree(example());
        var item=(tools.jackson.databind.node.ObjectNode)root.path("items").get(0);
        item.putArray("attributes").addObject().put("name","Material").put("value","Algodón");
        var file=directory.resolve("classification.json");Files.writeString(file,mapper.writeValueAsString(root));
        var catalog=load(file).catalog();
        assertTrue(catalog.items().getFirst().attributes().contains(new dev.lumio.core.domain.VariantAttribute("Material","Algodón")));
        assertEquals(2,catalog.items().getFirst().variants().size());
        item.withArray("attributes").addObject().put("name","Material").put("value","Algodón");
        Files.writeString(file,mapper.writeValueAsString(root));
        assertThrows(IllegalArgumentException.class,() -> load(file));
    }
    @TempDir
    Path directory;

    @Test
    void loadsPackagedProductsServicesAndImmutableSnapshot() {
        var catalog = new JsonCatalogProvider(new DefaultResourceLoader(), "classpath:catalog/example.json").catalog();
        assertFalse(catalog.name().isBlank());
        assertEquals(2, catalog.currencyDecimals());
        assertEquals(2, catalog.categories().size());
        assertEquals(2, catalog.items().size());
        assertEquals(dev.lumio.core.domain.CatalogItemType.PRODUCT, catalog.items().getFirst().type());
        assertEquals(dev.lumio.core.domain.CatalogItemType.SERVICE, catalog.items().getLast().type());
        assertEquals(12500, catalog.items().getFirst().variants().getFirst().priceMinor());
        assertFalse(catalog.items().getFirst().variants().getLast().available());
        assertEquals("Azul", catalog.items().getFirst().variants().getFirst().attributes().getLast().value());
        assertTrue(catalog.items().getLast().images().isEmpty());
        assertTrue(catalog.items().getLast().variants().getFirst().attributes().isEmpty());
        assertThrows(UnsupportedOperationException.class, () -> catalog.items().clear());
        assertThrows(UnsupportedOperationException.class, () -> catalog.items().getFirst().variants().clear());
    }

    @ParameterizedTest
    @MethodSource("invalidDocuments")
    void rejectsInvalidFilesWithLocationAndField(String from, String to, String field) throws IOException {
        var json = example();
        assertTrue(json.contains(from), "Test mutation must match the fixture");
        var file = directory.resolve("invalid.json");
        Files.writeString(file, json.replace(from, to));
        var exception = assertThrows(IllegalArgumentException.class, () -> load(file));
        assertTrue(exception.getMessage().contains(file.toUri().toString()), exception.getMessage());
        assertTrue(exception.getMessage().contains(field), exception.getMessage());
    }

    static Stream<Arguments> invalidDocuments() {
        return Stream.of(
            Arguments.of("\"type\": \"PRODUCT\"", "\"type\": \"UNKNOWN\"", "items[0].type"),
            Arguments.of("\"type\": \"PRODUCT\"", "\"type\": null", "items[0].type"),
            Arguments.of("\"id\": \"ropa\"", "\"id\": \"bad id\"", "categories[0].id"),
            Arguments.of("\"id\": \"servicios\"", "\"id\": \"ropa\"", "categories[1].id"),
            Arguments.of("\"slug\": \"servicios\"", "\"slug\": \"ropa\"", "categories[1].slug"),
            Arguments.of("\"id\": \"asesoria\"", "\"id\": \"camiseta\"", "items[1].id"),
            Arguments.of("\"slug\": \"asesoria-personalizada\"", "\"slug\": \"camiseta-algodon\"", "items[1].slug"),
            Arguments.of("\"slug\": \"camiseta-algodon\"", "\"slug\": \"Bad Slug\"", "items[0].slug"),
            Arguments.of("\"categoryIds\": [\"ropa\"]", "\"categoryIds\": [\"unknown\"]", "items[0].categoryIds"),
            Arguments.of("\"categoryIds\": [\"ropa\"]", "\"categoryIds\": [\"ropa\", \"ropa\"]", "items[0].categoryIds"),
            Arguments.of("\"priceMinor\": 12500", "\"priceMinor\": -1", "items[0].variants[0].priceMinor"),
            Arguments.of("\"priceMinor\": 12500", "\"priceMinor\": 12500.5", "items[0].variants[0].priceMinor"),
            Arguments.of("\"priceMinor\": 12500", "\"priceMinor\": 12500.0", "items[0].variants[0].priceMinor"),
            Arguments.of("\"priceMinor\": 12500", "\"priceMinor\": 2147483648", "items[0].variants[0].priceMinor"),
            Arguments.of("\"priceMinor\": 12500", "\"priceMinor\": \"12500\"", "items[0].variants[0].priceMinor"),
            Arguments.of("\"priceMinor\": 12500,", "", "items[0].variants[0].priceMinor"),
            Arguments.of("\"id\": \"asesoria-sesion\"", "\"id\": \"camiseta-m-azul\"", "items[1].variants[0].id"),
            Arguments.of("\"slug\": \"l-natural\"", "\"slug\": \"m-azul\"", "items[0].variants[1].slug"),
            Arguments.of("\"slug\": \"m-azul\"", "\"slug\": \"M AZUL\"", "items[0].variants[0].slug"),
            Arguments.of("\"name\": \"color\"", "\"name\": \"talla\"", "items[0].variants[0].attributes"),
            Arguments.of("[{ \"name\": \"talla\", \"value\": \"L\" }, { \"name\": \"color\", \"value\": \"Natural\" }]",
                "[{ \"name\": \"color\", \"value\": \"Azul\" }, { \"name\": \"talla\", \"value\": \"M\" }]", "items[0].variants[1].attributes"),
            Arguments.of("\"attributes\": []", "\"attributes\": null", "items[1].variants[0].attributes"),
            Arguments.of("\"value\": \"M\"", "\"value\": \"\"", "items[0].variants[0].attributes.value"),
            Arguments.of("\"currencyDecimals\": 2", "\"currencyDecimals\": -1", "currencyDecimals"),
            Arguments.of("\"currencyDecimals\": 2", "\"currencyDecimals\": 7", "currencyDecimals"),
            Arguments.of("\"currencyDecimals\": 2", "\"currencyDecimals\": 2.5", "currencyDecimals"),
            Arguments.of("\"currencyDecimals\": 2,", "", "currencyDecimals"),
            Arguments.of("\"currency\": \"GTQ\"", "\"currency\": \"ABC\"", "currency"),
            Arguments.of("\"whatsappNumber\": \"\"", "\"whatsappNumber\": \"+invalid\"", "whatsappNumber"),
            Arguments.of("\"available\": true", "\"available\": \"true\"", "items[0].available"),
            Arguments.of("\"available\": true", "\"available\": null", "items[0].available"),
            Arguments.of("\"url\": \"/images/camiseta.svg\"", "\"url\": \"javascript:alert(1)\"", "items[0].images[0].url"),
            Arguments.of("\"name\": \"Lumio Demo\"", "\"name\": \" \"", "name"),
            Arguments.of("\"description\": \"Productos y servicios de ejemplo para tu negocio.\"", "\"description\": null", "catalog.description")
        );
    }

    @Test
    void rejectsEmptyVariants() throws IOException {
        var file = directory.resolve("empty-variants.json");
        Files.writeString(file, """
            {"name":"Test","description":"","currency":"GTQ","currencyDecimals":2,"whatsappNumber":"",
             "categories":[],"items":[{"id":"a","slug":"a","name":"A","description":"","categoryIds":[],
             "images":[],"available":true,"variants":[]}]}
            """);
        var exception = assertThrows(IllegalArgumentException.class, () -> load(file));
        assertTrue(exception.getMessage().contains("items[0].variants"));
    }

    @ParameterizedTest
    @MethodSource("validMoney")
    void preservesIntegerPricesAndExplicitDecimalScale(int decimals, int price) throws IOException {
        var file = directory.resolve("valid.json");
        Files.writeString(file, example().replace("\"currencyDecimals\": 2", "\"currencyDecimals\": " + decimals)
            .replace("\"priceMinor\": 12500", "\"priceMinor\": " + price));
        var provider = load(file);
        assertEquals(decimals, provider.catalog().currencyDecimals());
        assertEquals(price, provider.catalog().items().getFirst().variants().getFirst().priceMinor());
        Files.writeString(file, "{}");
        assertEquals(price, provider.catalog().items().getFirst().variants().getFirst().priceMinor());
    }

    static Stream<Arguments> validMoney() {
        return Stream.of(Arguments.of(0, 0), Arguments.of(2, 12500), Arguments.of(3, 123456), Arguments.of(6, Integer.MAX_VALUE));
    }

    @Test
    void rejectsMissingFileMalformedJsonAndDuplicateJsonKeys() throws IOException {
        assertThrows(IllegalArgumentException.class, () -> load(directory.resolve("missing.json")));
        var file = directory.resolve("broken.json");
        Files.writeString(file, "{");
        assertThrows(IllegalArgumentException.class, () -> load(file));
        Files.writeString(file, example() + "{}");
        assertThrows(IllegalArgumentException.class, () -> load(file));
        Files.writeString(file, example().replace("\"currencyDecimals\": 2", "\"currencyDecimals\": 2, \"currencyDecimals\": 3"));
        assertThrows(IllegalArgumentException.class, () -> load(file));
        assertThrows(IllegalArgumentException.class,
            () -> new JsonCatalogProvider(new DefaultResourceLoader(), "https://example.com/catalog.json"));
    }

    private JsonCatalogProvider load(Path file) {
        return new JsonCatalogProvider(new DefaultResourceLoader(), file.toUri().toString());
    }

    private String example() throws IOException {
        try (var input = new DefaultResourceLoader().getResource("classpath:catalog/example.json").getInputStream()) {
            // Keep mutations deterministic when the example business name is customized.
            return new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8)
                .replaceFirst("\"name\"\\s*:\\s*\"[^\"]*\"", "\"name\": \"Lumio Demo\"");
        }
    }

    @Test void acceptsOptionalBusinessBrandingWithoutBreakingLegacyCatalogs() throws IOException {
        var file=directory.resolve("branding.json");
        Files.writeString(file,example().replaceFirst("\\{","{\"branding\":{\"logoUrl\":\"/images/logo.svg\",\"primaryColor\":\"#164A3C\"},"));
        assertEquals("/images/logo.svg",load(file).catalog().branding().logoUrl());
        assertEquals("#164A3C",load(file).catalog().branding().primaryColor());
        assertEquals("",new JsonCatalogProvider(new DefaultResourceLoader(),"classpath:catalog/test.json").catalog().branding().logoUrl());
    }
    @ParameterizedTest @org.junit.jupiter.params.provider.ValueSource(strings={"{\"primaryColor\":\"red\"}","{\"primaryColor\":null}","{\"logoUrl\":\"javascript:alert(1)\"}","{\"logoUrl\":\"https://user:secret@example.invalid/logo\"}","{\"logoUrl\":\"//example.invalid/logo\"}"})
    void rejectsInvalidBranding(String branding) throws IOException {
        var file=directory.resolve("branding-invalid.json"); Files.writeString(file,example().replaceFirst("\\{","{\"branding\":"+branding+","));
        assertTrue(assertThrows(IllegalArgumentException.class,()->load(file)).getMessage().contains("branding"));
    }
}
