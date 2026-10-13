package dev.lumio.core.infrastructure.providers;

import dev.lumio.core.application.CatalogProvider;
import dev.lumio.core.application.CatalogValidator;
import dev.lumio.core.domain.Catalog;
import dev.lumio.core.domain.CatalogBranding;
import java.util.List;
import dev.lumio.core.infrastructure.providers.odoo.OdooCatalogProvider;
import dev.lumio.core.infrastructure.providers.odoo.OdooJson2Client;
import dev.lumio.core.infrastructure.providers.odoo.OdooSettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ResourceLoader;

@Configuration(proxyBeanMethods = false)
public class CatalogProviderConfiguration {
    @Bean
    CatalogProvider catalogProvider(Environment environment, ResourceLoader resources) {
        String logo = environment.getProperty("LUMIO_LOGO_URL", "");
        String color = environment.getProperty("LUMIO_PRIMARY_COLOR", "");
        CatalogBranding branding = logo.isEmpty() && color.isEmpty() ? null : new CatalogBranding(logo, color.isEmpty() ? CatalogBranding.DEFAULT.primaryColor() : color);
        if (branding != null) CatalogValidator.validate(new Catalog("Branding", "", "USD", 2, "", List.of(), List.of(), branding));
        return switch (environment.getProperty("lumio.catalog.provider", "json")) {
            case "demo" -> new JsonCatalogProvider(resources, "classpath:catalog/example.json", branding);
            case "json" -> new JsonCatalogProvider(resources, environment.getRequiredProperty("lumio.catalog.location"), branding);
            case "odoo" -> {
                var settings = OdooSettings.from(environment);
                var enabled = environment.getProperty("ODOO_CAMPAIGNS_ENABLED", "false");
                if (!enabled.equals("true") && !enabled.equals("false")) throw new IllegalArgumentException("ODOO_CAMPAIGNS_ENABLED must be true or false");
                yield new OdooCatalogProvider(new OdooJson2Client(settings), settings, branding == null ? CatalogBranding.DEFAULT : branding, Boolean.parseBoolean(enabled));
            }
            default -> throw new IllegalArgumentException("CATALOG_PROVIDER must be demo, json or odoo");
        };
    }
}
