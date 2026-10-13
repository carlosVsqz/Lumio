package dev.lumio.core.domain;

/** Public campaign content, independent of its authoring system. */
public record CampaignSlide(String id, String title, String message, String actionLabel, String actionUrl) {}
