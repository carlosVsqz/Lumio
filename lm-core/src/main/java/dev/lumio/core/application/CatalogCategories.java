package dev.lumio.core.application;

import dev.lumio.core.domain.Category;
import java.util.*;

/** Generic category hierarchy shared by provider validation and catalog filtering. */
public final class CatalogCategories {
    private CatalogCategories() {}
    public static void validate(List<Category> categories) {
        var parents=new HashMap<String,String>();categories.forEach(category->parents.put(category.id(),category.parentId()));
        for(var category:categories) {
            var visited=new HashSet<String>();String current=category.id();
            while(current!=null) {
                if(!parents.containsKey(current))throw new IllegalArgumentException("categories.parentId: unknown category reference");
                if(!visited.add(current))throw new IllegalArgumentException("categories.parentId: cycle in category hierarchy");
                current=parents.get(current);
            }
        }
    }
    public static Set<String> descendants(List<Category> categories,String parentId) {
        var result=new HashSet<String>();result.add(parentId);
        var children=new HashMap<String,List<String>>();
        for(var category:categories) if(category.parentId()!=null)
            children.computeIfAbsent(category.parentId(),key->new ArrayList<>()).add(category.id());
        var pending=new ArrayDeque<String>();pending.add(parentId);
        while(!pending.isEmpty())for(var child:children.getOrDefault(pending.removeFirst(),List.of()))if(result.add(child))pending.addLast(child);
        return result;
    }
}
