package dev.lumio.core.infrastructure.providers;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.DefaultResourceLoader;
import static org.junit.jupiter.api.Assertions.*;

class JsonCampaignTests {
    @TempDir Path directory;
    private static final String BASE="{\"name\":\"Test\",\"description\":\"\",\"currency\":\"USD\",\"currencyDecimals\":2,\"whatsappNumber\":\"\",\"categories\":[],\"items\":[]";
    private static final String SLIDE="{\"id\":\"first\",\"title\":\"Campaña\",\"message\":\"Información\",\"actionLabel\":\"Ver catálogo\",\"actionUrl\":\"/?category=ropa\"}";
    private JsonCatalogProvider load(String suffix) throws Exception {
        var file=directory.resolve("catalog.json"); Files.writeString(file,BASE+suffix+"}");
        return new JsonCatalogProvider(new DefaultResourceLoader(),file.toUri().toString());
    }
    @Test void optionalCampaignsPreserveOldFilesAndDemoProvidesTypedContent() throws Exception {
        assertTrue(load("").campaigns().isEmpty());
        var demo=new JsonCatalogProvider(new DefaultResourceLoader(),"classpath:catalog/example.json");
        assertEquals(2,demo.campaigns().size());
        assertThrows(UnsupportedOperationException.class,()->demo.campaigns().clear());
        assertEquals("/?category=ropa",load(",\"campaigns\":["+SLIDE+"]").campaigns().getFirst().actionUrl());
    }
    @Test void rejectsDuplicateIdsUnsafeLinksUnpairedActionAndExcessSlides() throws Exception {
        assertThrows(IllegalArgumentException.class,()->load(",\"campaigns\":["+SLIDE+","+SLIDE+"]"));
        for (var url:java.util.List.of("javascript:alert(1)","//evil.example","https://user:secret@example.com","/\\\\evil.example"))
            assertThrows(IllegalArgumentException.class,()->load(",\"campaigns\":["+SLIDE.replace("/?category=ropa",url)+"]"));
        assertThrows(IllegalArgumentException.class,()->load(",\"campaigns\":["+SLIDE.replace("Ver catálogo","")+"]"));
        assertThrows(IllegalArgumentException.class,()->load(",\"campaigns\":["+SLIDE.replace("Campaña","A".repeat(121))+"]"));
        var rows=java.util.stream.IntStream.range(0,21).mapToObj(i->SLIDE.replace("first","slide-"+i)).toList();
        assertThrows(IllegalArgumentException.class,()->load(",\"campaigns\":["+String.join(",",rows)+"]"));
    }
}
