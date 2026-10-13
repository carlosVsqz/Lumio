package dev.lumio.core.application;

/** Safe, provider-independent error that may be exposed through the API. */
public final class CatalogUnavailableException extends RuntimeException {
    private final String reason;
    public CatalogUnavailableException(String reason, String message) {
        super(message);
        this.reason = reason;
    }
    public String reason() { return reason; }
}
