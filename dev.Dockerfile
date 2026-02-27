# This is a dockerfile for a development environment, 
# so you don't have to worry about missing environment variables during the build.

FROM node:alpine
ARG TARGETARCH

WORKDIR /app
COPY package.json package-lock.json ./

ENV NODE_ENV development
ENV PORT 3000

# build prerequisites for native deps (e.g., bufferutil) + npm 网络重试/镜像
RUN apk add --no-cache python3 make g++ \
    && apk add --no-cache curl unzip ffmpeg yt-dlp \
    && apk add --no-cache gcompat \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-factor 2 \
    && npm config set fetch-timeout 120000 \
    && npm config set registry https://registry.npmmirror.com

RUN if [ "$TARGETARCH" = "arm64" ]; then BB_ARCH="arm64"; else BB_ARCH="x64"; fi \
    && curl -L "https://nightly.link/nilaoda/BBDown/workflows/build_latest/master/BBDown_linux-${BB_ARCH}.zip" -o /tmp/bbdown.zip \
    && unzip -o /tmp/bbdown.zip -d /tmp/bbdown \
    && inner_zip="$(find /tmp/bbdown -type f -name '*.zip' | head -n 1)" \
    && unzip -o "$inner_zip" -d /tmp/bbdown \
    && bbdown_path="$(find /tmp/bbdown -type f -name 'BBDown' | head -n 1)" \
    && cp "$bbdown_path" /usr/local/bin/BBDown \
    && chmod +x /usr/local/bin/BBDown \
    && rm -rf /tmp/bbdown /tmp/bbdown.zip

RUN npm ci --legacy-peer-deps

COPY . .
RUN rm -f .env

EXPOSE 3000
CMD ["node_modules/.bin/next", "dev"]
