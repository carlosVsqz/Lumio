FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
COPY lm-core/build.gradle ./lm-core/build.gradle
COPY lm-core/src ./lm-core/src
RUN chmod +x gradlew && ./gradlew :lm-core:build --no-daemon
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system lumio && useradd --system --gid lumio lumio
COPY --from=build /app/lm-core/build/libs/lm-core-0.0.1-SNAPSHOT.jar app.jar
COPY scripts/core-entrypoint.sh /app/core-entrypoint.sh
RUN chmod +x /app/core-entrypoint.sh
USER lumio
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD curl --fail --silent --max-time 4 http://127.0.0.1:8080/actuator/health > /dev/null || exit 1
ENTRYPOINT ["/app/core-entrypoint.sh"]
