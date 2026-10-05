FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/api ./apps/api

FROM alpine:3.24
RUN apk add --no-cache ca-certificates tzdata wget \
    && adduser -D -u 65532 app
COPY --from=build /out/api /api
USER app
EXPOSE 8080
ENTRYPOINT ["/api"]
