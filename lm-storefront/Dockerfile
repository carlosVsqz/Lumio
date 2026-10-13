FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/lm-storefront/browser /usr/share/nginx/html
RUN test -s /usr/share/nginx/html/static-build.json
EXPOSE 80
