package dev.lumio.core.graphql;

import dev.lumio.core.application.*;
import dev.lumio.core.domain.*;
import org.springframework.graphql.data.method.annotation.*;
import org.springframework.graphql.execution.ErrorType;
import graphql.GraphQLError;
import graphql.GraphqlErrorBuilder;
import graphql.schema.DataFetchingEnvironment;
import org.springframework.stereotype.Controller;
import java.util.*;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

@Controller
public class CatalogController {
    private final CatalogProvider provider;
    private final CatalogNavigation navigation;
    private final CatalogIdentity identity;
    private static final String SNAPSHOT = CatalogController.class.getName()+".snapshot";
    public CatalogController(CatalogProvider provider, CatalogNavigation navigation, CatalogIdentity identity) { this.provider=provider; this.navigation=navigation; this.identity=identity; }
    private Mono<Catalog> snapshot(DataFetchingEnvironment environment) {
        var context=environment.getGraphQlContext();
        synchronized(context) {
            Mono<Catalog> result=context.get(SNAPSHOT);
            if(result==null) { result=Mono.fromCallable(provider::catalog).subscribeOn(Schedulers.boundedElastic()).cache(); context.put(SNAPSHOT,result); }
            return result;
        }
    }
    @QueryMapping public Mono<Catalog> catalog(DataFetchingEnvironment environment) { return snapshot(environment); }
    @QueryMapping public Mono<List<CampaignSlide>> campaigns() {
        return Mono.fromCallable(() -> CampaignValidator.validate(provider.campaigns())).subscribeOn(Schedulers.boundedElastic());
    }
    @SchemaMapping(typeName = "Catalog", field = "id") public String catalogId(Catalog catalog) { return identity.id(); }
    @QueryMapping public Mono<List<CatalogItemLookup>> itemsByIds(@Argument List<String> ids, @Argument String catalogId, DataFetchingEnvironment environment) {
        CatalogLookup.validate(ids);
        if (!identity.id().equals(catalogId)) throw new IllegalArgumentException("catalogId does not match the active catalog");
        return snapshot(environment).map(c -> CatalogLookup.find(c, ids));
    }
    @QueryMapping public Mono<List<CatalogItem>> items(DataFetchingEnvironment environment) { return snapshot(environment).map(Catalog::items); }
    @QueryMapping public Mono<List<Category>> categories(DataFetchingEnvironment environment) { return snapshot(environment).map(Catalog::categories); }
    @QueryMapping public Mono<CatalogItem> itemBySlug(@Argument String slug, DataFetchingEnvironment environment) {
        return snapshot(environment).flatMap(c -> Mono.justOrEmpty(c.items().stream().filter(i -> i.slug().equals(slug)).findFirst()));
    }
    @QueryMapping public Mono<CatalogItemPage> itemPage(@Argument String search, @Argument String categoryId, @Argument Integer page, @Argument Integer pageSize, @Argument CatalogSort sort, @Argument Boolean availableOnly, @Argument List<CatalogAttributeFilter> attributes, DataFetchingEnvironment environment) {
        CatalogNavigation.validateRequest(search,page,pageSize);
        var filters=CatalogAttributeFilters.validate(attributes);
        return snapshot(environment).map(c -> navigation.page(c,search,categoryId,page,pageSize,sort,Boolean.TRUE.equals(availableOnly),filters));
    }
    @GraphQlExceptionHandler public GraphQLError unavailable(CatalogUnavailableException exception, DataFetchingEnvironment environment) {
        return GraphqlErrorBuilder.newError(environment).errorType(ErrorType.INTERNAL_ERROR).message(exception.getMessage())
            .extensions(Map.of("code","CATALOG_UNAVAILABLE","reason",exception.reason())).build();
    }
    @GraphQlExceptionHandler public GraphQLError invalidArguments(IllegalArgumentException exception, DataFetchingEnvironment environment) {
        return GraphqlErrorBuilder.newError(environment).errorType(ErrorType.BAD_REQUEST).message(exception.getMessage()).build();
    }
}
