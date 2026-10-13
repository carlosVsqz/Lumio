package dev.lumio.core.infrastructure.providers.odoo;

import dev.lumio.core.application.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import java.util.Map;

@RestController
public final class OdooImageController {
    private final CatalogProvider provider;
    public OdooImageController(CatalogProvider provider) { this.provider=provider; }
    @GetMapping("/catalog-media/{kind}/{id}")
    public Mono<ResponseEntity<?>> image(@PathVariable String kind,@PathVariable int id) {
        return Mono.<ResponseEntity<?>>fromCallable(() -> {
            if (!(provider instanceof OdooCatalogProvider odoo)) return ResponseEntity.notFound().build();
            var image=odoo.image(kind,id);
            return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.contentType())).cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options","nosniff")
                .header("Content-Security-Policy","sandbox; default-src 'none'; style-src 'unsafe-inline'").body(image.bytes());
        }).subscribeOn(Schedulers.boundedElastic())
            .onErrorResume(OdooCatalogProvider.ImageNotFoundException.class, ex -> Mono.just(ResponseEntity.notFound().build()))
            .onErrorResume(CatalogUnavailableException.class, ex -> Mono.just(ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .cacheControl(CacheControl.noStore()).body(Map.of("code","CATALOG_UNAVAILABLE","reason",ex.reason(),"message",ex.getMessage()))));
    }
}
