package dev.lumio.core.domain;
import java.util.List;
/** Exactly one component is chosen per group and per combo unit. */
public record ComboGroup(String id, String name, List<ComboOption> options) {
    public ComboGroup { options = List.copyOf(options); }
}
