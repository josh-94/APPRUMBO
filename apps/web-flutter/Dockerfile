FROM ghcr.io/cirruslabs/flutter:stable AS build
WORKDIR /src
COPY pubspec.yaml ./
RUN flutter config --enable-web \
    && flutter pub get
COPY . .
RUN flutter pub get \
    && flutter build web --release --pwa-strategy=none \
    && cp web/sw.js build/web/sw.js

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/build/web /usr/share/nginx/html
