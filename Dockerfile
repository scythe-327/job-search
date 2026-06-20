FROM node:22-slim

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm install

RUN npx playwright install --with-deps chromium

RUN npm install -g opencode-ai

COPY . .

EXPOSE 7860

CMD ["node", "server.mjs"]
