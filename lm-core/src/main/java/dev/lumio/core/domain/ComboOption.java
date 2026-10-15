package dev.lumio.core.domain;
import java.util.List;
/** Concrete component and surcharge in the catalog currency's minor units. */
public record ComboOption(String id, String variantId, String name, List<VariantAttribute> attributes,
                          int extraPriceMinor, boolean available, Integer maxQuantity) {
    public ComboOption { attributes = List.copyOf(attributes); }
}
