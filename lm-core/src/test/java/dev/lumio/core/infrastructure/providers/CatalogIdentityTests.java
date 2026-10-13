package dev.lumio.core.infrastructure.providers;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;

class CatalogIdentityTests {
    private final CatalogIdentityConfiguration configuration = new CatalogIdentityConfiguration();
    private MockEnvironment env(String provider) { return new MockEnvironment().withProperty("lumio.catalog.provider", provider); }
    @Test void explicitBusinessIdentitySurvivesJsonMovesAndRemainsProviderScoped() {
        var first = env("json").withProperty("LUMIO_CATALOG_ID", "shop-a").withProperty("lumio.catalog.location", "file:/one.json");
        var moved = env("json").withProperty("LUMIO_CATALOG_ID", "shop-a").withProperty("lumio.catalog.location", "file:/two.json");
        assertThat(configuration.catalogIdentity(first)).isEqualTo(configuration.catalogIdentity(moved));
        assertThat(configuration.catalogIdentity(first)).isNotEqualTo(configuration.catalogIdentity(env("demo").withProperty("LUMIO_CATALOG_ID", "shop-a")));
        assertThat(configuration.catalogIdentity(first)).isNotEqualTo(configuration.catalogIdentity(env("json").withProperty("LUMIO_CATALOG_ID", "shop-b")));
    }
    @Test void automaticIdentitySeparatesSourcesAndWebsitesWithoutExposingConnectionDetails() {
        assertThat(configuration.catalogIdentity(env("json").withProperty("lumio.catalog.location", "file:/one.json")))
            .isNotEqualTo(configuration.catalogIdentity(env("json").withProperty("lumio.catalog.location", "file:/two.json")));
        var odoo = env("odoo").withProperty("ODOO_URL", "https://odoo.example/").withProperty("ODOO_DATABASE", "private-db")
            .withProperty("ODOO_WEBSITE_ID", "1").withProperty("ODOO_API_KEY", "test-secret-not-used");
        var identity = configuration.catalogIdentity(odoo);
        assertThat(identity.id()).matches("catalog-[a-f0-9]{64}").doesNotContain("private-db", "odoo.example", "test-secret");
        odoo.withProperty("ODOO_API_KEY", "rotated-test-secret");
        assertThat(configuration.catalogIdentity(odoo)).isEqualTo(identity);
        odoo.withProperty("ODOO_WEBSITE_ID", "2");
        assertThat(configuration.catalogIdentity(odoo)).isNotEqualTo(identity);
    }
    @Test void rejectsMalformedExplicitIdentities() {
        for (String id : new String[]{" ", "shop/a", "https://shop.example", "a".repeat(101)}) {
            assertThatThrownBy(() -> configuration.catalogIdentity(env("json").withProperty("LUMIO_CATALOG_ID", id)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("LUMIO_CATALOG_ID");
        }
    }
}
