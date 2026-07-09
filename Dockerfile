FROM node:20-alpine AS base
# python3/make/g++ are needed to compile better-sqlite3's native addon from
# source — no prebuilt binary is available for this musl/arch combination.
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

ENV NODE_ENV=production
EXPOSE 3000
CMD [ "yarn", "start:prod" ]
