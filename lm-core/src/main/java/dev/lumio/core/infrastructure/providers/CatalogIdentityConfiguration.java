package dev.lumio.core.infrastructure.providers;

import dev.lumio.core.application.CatalogIdentity;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
public class CatalogIdentityConfiguration {
    @Bean
    CatalogIdentity catalogIdentity(Environment env) {
        String provider = env.getProperty("lumio.catalog.provider", "json");
        String configured = env.getProperty("LUMIO_CATALOG_ID", "");
        if (!configured.isEmpty() && !configured.matches("[A-Za-z0-9_-]{1,100}")) {
            throw new IllegalArgumentException("LUMIO_CATALOG_ID must have 1 to 100 letters, digits, hyphens or underscores");
        }
        String source = configured.isEmpty() ? switch (provider) {
            case "demo" -> "lumio-example";
            case "json" -> env.getProperty("lumio.catalog.location", "classpath:catalog/example.json");
            case "odoo" -> env.getProperty("ODOO_URL", "").replaceAll("/+$", "") + "\0"
                + env.getProperty("ODOO_DATABASE", "") + "\0" + env.getProperty("ODOO_WEBSITE_ID", "0");
            default -> throw new IllegalArgumentException("CATALOG_PROVIDER must be demo, json or odoo");
        } : "configured\0" + configured;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest((provider + "\0" + source).getBytes(StandardCharsets.UTF_8));
            return new CatalogIdentity("catalog-" + HexFormat.of().formatHex(digest));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
