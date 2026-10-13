package dev.lumio.core.infrastructure.providers.odoo;

import dev.lumio.core.application.CatalogUnavailableException;
import dev.lumio.core.domain.CatalogBranding;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;

class OdooCampaignReaderTests {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-13T12:00:00Z"),ZoneOffset.UTC);
    private static OdooCampaignReader reader(OdooStub stub) { return new OdooCampaignReader(new OdooJson2Client(stub.settings(OdooSettings.StockPolicy.FREE_STOCK,3000)),1,CLOCK); }
    private static final Map<String,Object> CONTEXT = Map.of("company_id",7,"allowed_company_ids",List.of(7),"lang","es_GT");
    static String slide(int id, int sequence) {
        return "{\"id\":"+id+",\"title\":\"Campaña "+id+"\",\"message\":\"Contenido real\",\"action_label\":\"Explorar\",\"action_url\":\"/?category=ropa\",\"sequence\":"+sequence+",\"active\":true,\"is_published\":true,\"website_id\":1,\"company_id\":7,\"starts_at\":false,\"ends_at\":false}";
    }
    @Test void readsSortedWebsiteCampaignsWithUtcDomainAndNoInventoryOrWriteCalls() throws Exception {
        try (var stub=new OdooStub()) {
            stub.campaignRows="["+slide(2,20)+","+slide(1,10)+"]";
            var rows=reader(stub).read(CONTEXT);
            assertEquals(List.of("campaign-1","campaign-2"),rows.stream().map(dev.lumio.core.domain.CampaignSlide::id).toList());
            assertEquals("Contenido real",rows.getFirst().message());
            var request=stub.requests.getLast();
            assertEquals("search_read",request.method());
            assertEquals(21,request.body().path("limit").intValue());
            assertEquals("sequence asc, id asc",request.body().path("order").stringValue());
            assertTrue(request.body().path("domain").toString().contains("2026-10-13 12:00:00"));
            assertTrue(stub.requests.stream().allMatch(r -> r.model().equals("lumio.campaign.slide")));
            assertThrows(UnsupportedOperationException.class,rows::clear);
        }
    }
    @Test void excludesUnpublishedArchivedWrongWebsiteCompanyFutureAndExpiredRecords() throws Exception {
        try (var stub=new OdooStub()) {
            var base=slide(1,10);
            stub.campaignRows="["+String.join(",",base,
                base.replace("\"id\":1","\"id\":2").replace("\"is_published\":true","\"is_published\":false"),
                base.replace("\"id\":1","\"id\":3").replace("\"active\":true","\"active\":false"),
                base.replace("\"id\":1","\"id\":4").replace("\"website_id\":1","\"website_id\":2"),
                base.replace("\"id\":1","\"id\":5").replace("\"company_id\":7","\"company_id\":8"),
                base.replace("\"id\":1","\"id\":6").replace("\"starts_at\":false","\"starts_at\":\"2026-10-13 12:00:01\""),
                base.replace("\"id\":1","\"id\":7").replace("\"ends_at\":false","\"ends_at\":\"2026-10-13 12:00:00\""))+ "]";
            assertEquals(1,reader(stub).read(CONTEXT).size());
            stub.campaignRows="["+base.replace("\"starts_at\":false","\"starts_at\":\"2026-10-13 12:00:00\"")+ "]";
            assertEquals(1,reader(stub).read(CONTEXT).size());
        }
    }
    @Test void disabledFeatureMakesNoRequestsAndEnabledProviderOnlyReadsWebsiteAndCampaigns() throws Exception {
        try (var stub=new OdooStub()) {
            var settings=stub.settings(OdooSettings.StockPolicy.FREE_STOCK,3000);
            var client=new OdooJson2Client(settings);
            assertTrue(new OdooCatalogProvider(client,settings).campaigns().isEmpty());
            assertTrue(stub.requests.isEmpty());
            stub.campaignRows="["+slide(1,10)+"]";
            assertEquals(1,new OdooCatalogProvider(client,settings,CatalogBranding.DEFAULT,true).campaigns().size());
            assertTrue(stub.requests.stream().allMatch(r -> Set.of("website","lumio.campaign.slide").contains(r.model())));
        }
    }
    @Test void requiresAddonFieldsAndDoesNotTruncateOrExposeInvalidCampaignContent() throws Exception {
        try (var stub=new OdooStub()) {
            stub.campaignSchemaAvailable=false;
            assertEquals("COMPATIBILITY",assertThrows(CatalogUnavailableException.class,()->reader(stub).read(CONTEXT)).reason());
            stub.campaignSchemaAvailable=true;
            stub.campaignRows="["+String.join(",",java.util.stream.IntStream.range(1,22).mapToObj(i->slide(i,i)).toList())+"]";
            assertEquals("LIMIT",assertThrows(CatalogUnavailableException.class,()->reader(stub).read(CONTEXT)).reason());
            stub.campaignRows="["+slide(1,10).replace("/?category=ropa","javascript:alert(1)")+"]";
            assertEquals("VALIDATION",assertThrows(CatalogUnavailableException.class,()->reader(stub).read(CONTEXT)).reason());
            stub.campaignRows="["+slide(1,10).replace("\"starts_at\":false","\"starts_at\":\"2026-02-30 10:00:00\"")+"]";
            assertEquals("PROTOCOL",assertThrows(CatalogUnavailableException.class,()->reader(stub).read(CONTEXT)).reason());
        }
    }
    @ParameterizedTest @ValueSource(ints={401,403,404,500}) void errorsRemainExplicitWithoutDemoFallback(int status) throws Exception {
        try (var stub=new OdooStub()) {
            stub.status=status;
            var error=assertThrows(CatalogUnavailableException.class,()->reader(stub).read(CONTEXT));
            assertEquals(switch(status){case 401->"AUTHENTICATION";case 403->"ACCESS";case 404->"COMPATIBILITY";default->"UPSTREAM";},error.reason());
            assertFalse(error.getMessage().contains("server secret"));
        }
    }
    @Test void connectionFailureIsNotAnEmptyFeed() throws Exception {
        var stub=new OdooStub(); var reader=reader(stub); stub.close();
        assertEquals("CONNECTION",assertThrows(CatalogUnavailableException.class,()->reader.read(CONTEXT)).reason());
    }
}
