package dev.lumio.core.infrastructure.providers.odoo;

import java.io.ByteArrayInputStream;
import java.util.Set;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Element;
import org.xml.sax.helpers.DefaultHandler;

/** Website logos may be SVG; never accept active content, entities or remote resources. */
final class OdooLogoSvg {
    private OdooLogoSvg() {}
    static boolean isSafe(byte[] bytes) {
        try {
            var factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            var parser = factory.newDocumentBuilder();
            parser.setErrorHandler(new DefaultHandler());
            var root = parser.parse(new ByteArrayInputStream(bytes)).getDocumentElement();
            if (!"svg".equals(root.getLocalName()) || !"http://www.w3.org/2000/svg".equals(root.getNamespaceURI())) return false;
            var elements = root.getElementsByTagName("*");
            if (!safeElement(root)) return false;
            for (int i=0; i<elements.getLength(); i++) if (!safeElement((Element)elements.item(i))) return false;
            return true;
        } catch (Exception ex) { return false; }
    }
    private static boolean safeElement(Element element) {
        if (Set.of("script","foreignobject","iframe","object","embed","audio","video","animate","set","animatemotion","animatetransform")
                .contains(element.getLocalName().toLowerCase(java.util.Locale.ROOT))) return false;
        var attributes = element.getAttributes();
        for (int i=0; i<attributes.getLength(); i++) {
            var attribute = attributes.item(i);
            var name = attribute.getLocalName().toLowerCase(java.util.Locale.ROOT);
            var value = attribute.getNodeValue().strip();
            if (name.startsWith("on") || name.equals("href") && !value.startsWith("#")) return false;
        }
        return true;
    }
}
