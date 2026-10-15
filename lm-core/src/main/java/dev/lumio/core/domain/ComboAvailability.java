package dev.lumio.core.domain;

import java.util.*;

/** One unit per group; shared component stock must cover all chosen groups. */
public final class ComboAvailability {
    private ComboAvailability() {}

    public static boolean canConfigure(List<ComboGroup> groups) {
        var capacities = new HashMap<String,Integer>();
        for (var group:groups) for (var option:group.options()) if (option.available()) {
            capacities.merge(option.variantId(), option.maxQuantity()==null ? groups.size() : option.maxQuantity(), Math::min);
        }
        var assigned = new HashMap<String,List<Integer>>();
        for (int index=0; index<groups.size(); index++)
            if (!assign(index,groups,capacities,assigned,new HashSet<>())) return false;
        return true;
    }

    private static boolean assign(int index,List<ComboGroup> groups,Map<String,Integer> capacities,
                                  Map<String,List<Integer>> assigned,Set<String> visited) {
        for (var option:groups.get(index).options()) {
            var reference=option.variantId();
            if (!option.available() || !visited.add(reference)) continue;
            var owners=assigned.computeIfAbsent(reference,key -> new ArrayList<>());
            if (owners.size()<capacities.get(reference)) { owners.add(index); return true; }
            for (int position=0; position<owners.size(); position++) {
                if (assign(owners.get(position),groups,capacities,assigned,visited)) {
                    owners.set(position,index); return true;
                }
            }
        }
        return false;
    }
}
