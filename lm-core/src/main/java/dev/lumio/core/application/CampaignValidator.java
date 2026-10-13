package dev.lumio.core.application;

import dev.lumio.core.domain.CampaignSlide;
import java.net.URI;
import java.util.HashSet;
import java.util.List;

public final class CampaignValidator {
    public static final int MAX_SLIDES = 20;
    private CampaignValidator() {}

    public static List<CampaignSlide> validate(List<CampaignSlide> slides) {
        if (slides == null || slides.size() > MAX_SLIDES) throw invalid("maximum is 20 slides");
        var ids = new HashSet<String>();
        for (var slide : slides) {
            if (slide == null || slide.id() == null || !slide.id().matches("[A-Za-z0-9_-]{1,200}") || !ids.add(slide.id()))
                throw invalid("identifiers must be valid and unique");
            text(slide.title(), 120, false, "title");
            text(slide.message(), 500, true, "message");
            text(slide.actionLabel(), 80, true, "actionLabel");
            text(slide.actionUrl(), 2048, true, "actionUrl");
            if (slide.actionLabel().isEmpty() != slide.actionUrl().isEmpty()) throw invalid("actionLabel and actionUrl must be provided together");
            if (!slide.actionUrl().isEmpty() && !safeUrl(slide.actionUrl())) throw invalid("actionUrl must be a public HTTP(S) URL without credentials or a path from /");
        }
        return List.copyOf(slides);
    }

    private static void text(String value, int max, boolean empty, String field) {
        if (value == null || value.length() > max || (!empty && value.isBlank()) || (!value.isEmpty() && value.isBlank())
            || value.codePoints().anyMatch(c -> Character.isISOControl(c) && c != '\n')) throw invalid(field + " is invalid or too long");
    }

    private static boolean safeUrl(String value) {
        if (value.contains("\\") || value.codePoints().anyMatch(c -> Character.isWhitespace(c) || Character.isISOControl(c))) return false;
        try {
            var url = new URI(value);
            if (value.startsWith("/") && !value.startsWith("//")) return !url.isAbsolute() && url.getRawAuthority() == null;
            return ("http".equalsIgnoreCase(url.getScheme()) || "https".equalsIgnoreCase(url.getScheme()))
                && url.getHost() != null && url.getRawUserInfo() == null;
        } catch (Exception ex) { return false; }
    }
    private static IllegalArgumentException invalid(String message) { return new IllegalArgumentException("campaigns: " + message); }
}
