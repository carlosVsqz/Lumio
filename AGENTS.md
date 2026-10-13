# Lumio: reglas para Codex

- Mantener `lm-core` y `lm-storefront` en la raíz del monorepo.
- Backend: Spring Boot 4.2.0-SNAPSHOT, Java 21, Gradle, WebFlux y GraphQL. No añadir backend Node.
- Frontend: Angular standalone y Signals; conservar outputMode static hasta decidir explícitamente SSR dinámico.
- Dominio independiente del proveedor. Integraciones detrás de CatalogProvider.
- Precios en unidades menores enteras; no usar float para dinero.
- No añadir persistencia, login o infraestructura adicional sin una necesidad concreta.
- Validar cambios con `./gradlew build` y Angular build según el módulo modificado.
- Nunca incluir números personales, credenciales o archivos .env en commits.
