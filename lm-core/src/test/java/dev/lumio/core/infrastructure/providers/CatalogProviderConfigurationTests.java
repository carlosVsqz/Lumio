package dev.lumio.core.infrastructure.providers;

import dev.lumio.core.application.CatalogProvider;
import dev.lumio.core.infrastructure.providers.odoo.OdooCatalogProvider;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import static org.assertj.core.api.Assertions.*;

class CatalogProviderConfigurationTests {
    private final ApplicationContextRunner context=new ApplicationContextRunner().withUserConfiguration(CatalogProviderConfiguration.class);
    @Test void demoIgnoresExternalJsonLocation() {
        context.withPropertyValues("lumio.catalog.provider=demo","lumio.catalog.location=file:missing.json").run(c -> {
            assertThat(c).hasNotFailed(); assertThat(c.getBean(CatalogProvider.class).catalog().items()).isNotEmpty();
        });
    }
    @Test void jsonRetainsConfigurableLocation() {
        context.withPropertyValues("lumio.catalog.provider=json","lumio.catalog.location=classpath:catalog/test.json").run(c -> {
            assertThat(c).hasNotFailed(); assertThat(c.getBean(CatalogProvider.class).catalog().name()).isEqualTo("Test Business");
        });
    }
    @Test void unknownProviderFailsInsteadOfDemoFallback() { context.withPropertyValues("lumio.catalog.provider=unknown").run(c -> assertThat(c).hasFailed()); }
    @Test void appliesValidatedBrandingEnvironmentToDemo() {
        context.withPropertyValues("lumio.catalog.provider=demo","LUMIO_LOGO_URL=/images/logo.svg","LUMIO_PRIMARY_COLOR=#AA2200").run(c -> {
            assertThat(c).hasNotFailed(); assertThat(c.getBean(CatalogProvider.class).catalog().branding().primaryColor()).isEqualTo("#AA2200");
        });
        context.withPropertyValues("lumio.catalog.provider=demo","LUMIO_PRIMARY_COLOR=invalid").run(c -> assertThat(c).hasFailed());
    }
    @Test void odooRequiresCredentialsAtStartup() { context.withPropertyValues("lumio.catalog.provider=odoo").run(c -> assertThat(c).hasFailed()); }
    @Test void odooCanStartWithoutAnUpstreamConnectionAndWillNotFallBack() {
        context.withPropertyValues("lumio.catalog.provider=odoo","ODOO_URL=http://127.0.0.1:1","ODOO_DATABASE=fixture","ODOO_API_KEY=test-only-key",
            "ODOO_WEBSITE_ID=1","ODOO_PRICELIST_ID=2","ODOO_WAREHOUSE_ID=3").run(c -> {
                assertThat(c).hasNotFailed(); assertThat(c.getBean(CatalogProvider.class)).isInstanceOf(OdooCatalogProvider.class);
            });
    }
}
