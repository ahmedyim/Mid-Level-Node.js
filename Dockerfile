FROM oven/bun:latest

WORKDIR /app

COPY package.json /app

RUN bun install

COPY bun.lock /app

COPY . .
ENV PORT 3000

EXPOSE $PORT 

CMD ["bun","run","--watch","index.ts"]


