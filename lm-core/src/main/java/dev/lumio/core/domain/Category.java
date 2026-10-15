package dev.lumio.core.domain;

public record Category(String id, String slug, String name, String description, String parentId) {
    public Category(String id,String slug,String name,String description) { this(id,slug,name,description,null); }
}
