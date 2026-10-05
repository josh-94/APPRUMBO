FROM node:22-alpine AS build
WORKDIR /repo
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
WORKDIR /repo/apps/web
RUN npm ci
WORKDIR /repo
COPY apps/web ./apps/web
COPY docs/marca/tokens.css ./docs/marca/tokens.css
WORKDIR /repo/apps/web
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
