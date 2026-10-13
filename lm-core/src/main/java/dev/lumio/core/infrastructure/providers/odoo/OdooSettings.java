package dev.lumio.core.infrastructure.providers.odoo;

import java.net.URI;
import org.springframework.core.env.Environment;

public record OdooSettings(String url, String database, String apiKey, int websiteId,
                           int pricelistId, int warehouseId, StockPolicy stockPolicy, String language,
                           String businessName, String businessDescription, String whatsappNumber,
                           int connectTimeoutMs, int requestTimeoutMs, int maxRecords, int maxImageBytes) {
    public enum StockPolicy { FREE_STOCK, WEBSITE }

    public OdooSettings {
        var uri = URI.create(url);
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null
            || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
            || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) throw new IllegalArgumentException("ODOO_URL must be an HTTP(S) origin without credentials");
        url = uri.getScheme() + "://" + uri.getRawAuthority();
        if (database == null || database.isBlank() || database.contains("\r") || database.contains("\n")) throw new IllegalArgumentException("ODOO_DATABASE is required");
        if (apiKey == null || apiKey.isBlank() || !apiKey.equals(apiKey.strip()) || apiKey.contains("\r") || apiKey.contains("\n")) throw new IllegalArgumentException("ODOO_API_KEY is required and must be configured only on the backend");
        if (websiteId <= 0 || pricelistId <= 0 || warehouseId <= 0) throw new IllegalArgumentException("ODOO_WEBSITE_ID, ODOO_PRICELIST_ID and ODOO_WAREHOUSE_ID must be positive IDs");
        if (stockPolicy == null || language == null || language.isBlank()) throw new IllegalArgumentException("Odoo stock policy and language are required");
        if (connectTimeoutMs < 1 || connectTimeoutMs > 60000 || requestTimeoutMs < 1 || requestTimeoutMs > 120000
            || maxRecords < 1 || maxRecords > 100000 || maxImageBytes < 1 || maxImageBytes > 16000000) throw new IllegalArgumentException("Invalid Odoo timeout or response limits");
        if (businessName == null || businessDescription == null || whatsappNumber == null || !(whatsappNumber.isEmpty() || whatsappNumber.matches("[1-9][0-9]{7,14}"))) throw new IllegalArgumentException("Invalid Odoo business configuration or WhatsApp number");
    }

    public static OdooSettings from(Environment env) {
        return new OdooSettings(env.getProperty("ODOO_URL", ""), env.getProperty("ODOO_DATABASE", ""), env.getProperty("ODOO_API_KEY", ""),
            integer(env,"ODOO_WEBSITE_ID",0), integer(env,"ODOO_PRICELIST_ID",0), integer(env,"ODOO_WAREHOUSE_ID",0),
            StockPolicy.valueOf(env.getProperty("ODOO_STOCK_POLICY", "FREE_STOCK")), env.getProperty("ODOO_LANGUAGE", "en_US"),
            env.getProperty("ODOO_BUSINESS_NAME", ""), env.getProperty("ODOO_BUSINESS_DESCRIPTION", ""), env.getProperty("ODOO_WHATSAPP_NUMBER", ""),
            integer(env,"ODOO_CONNECT_TIMEOUT_MS",3000), integer(env,"ODOO_REQUEST_TIMEOUT_MS",10000),
            integer(env,"ODOO_MAX_RECORDS",5000), integer(env,"ODOO_MAX_IMAGE_BYTES",4000000));
    }
    private static int integer(Environment env, String key, int fallback) {
        try { return Integer.parseInt(env.getProperty(key, Integer.toString(fallback))); }
        catch (NumberFormatException ex) { throw new IllegalArgumentException(key + " must be an integer"); }
    }
    @Override public String toString() { return "OdooSettings[credentials and connection details redacted]"; }
}
