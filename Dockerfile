# Hi, here is a Docker build file for your convenience in building a private Docker image.
# Please make sure to configure runtime env vars (for example through docker compose env_file).

# Please follow the steps below:
# 1. Install Docker
# 2. Configure .env file
# 3. Build Docker image

# > Step 1 build NextJs
FROM node:alpine AS builder
ARG TARGETARCH
WORKDIR /app
ENV NODE_OPTIONS=--max_old_space_size=2048
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./

# Build prerequisites for native dependencies (e.g., bufferutil) + npm retry/mirror setup
RUN apk add --no-cache python3 make g++ \
    && apk add --no-cache py3-pip curl unzip ffmpeg \
    && pip3 install --no-cache-dir --break-system-packages --upgrade yt-dlp \
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

# removing sentry. If you want to use sentry, please set IS_USED_SENTRY=1
ARG IS_USED_SENTRY=0
RUN if [ "$IS_USED_SENTRY" -eq 0 ]; then \
      sed -i 's/const { withSentryConfig }/\/\/ const { withSentryConfig }/' ./next.config.js && \
      sed -i 's/module.exports = withSentryConfig/\/\/ module.exports = withSentryConfig/' ./next.config.js ; \
    fi
# building Nextjs
RUN npm run build


# > Step 2 Build docker image
FROM node:alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV PORT 3000

RUN addgroup -g 1001 -S nodejs &&\
    adduser -S nextjs -u 1001

RUN apk add --no-cache python3 py3-pip ffmpeg libc6-compat gcompat \
    && pip3 install --no-cache-dir --break-system-packages --upgrade yt-dlp

COPY --from=builder /usr/local/bin/BBDown /usr/local/bin/BBDown

COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/README.md ./README.md
COPY --from=builder /app/LICENSE.txt ./LICENSE.txt

USER nextjs
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
