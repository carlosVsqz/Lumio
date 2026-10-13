FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
COPY lm-core/build.gradle ./lm-core/build.gradle
COPY lm-core/src ./lm-core/src
RUN chmod +x gradlew && ./gradlew :lm-core:bootJar --no-daemon
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system lumio && useradd --system --gid lumio lumio
COPY --from=build /app/lm-core/build/libs/lm-core-0.0.1-SNAPSHOT.jar app.jar
USER lumio
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
