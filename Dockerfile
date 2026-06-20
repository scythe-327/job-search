FROM node:22-slim
WORKDIR /app

RUN npm install -g opencode-ai

COPY package*.json ./
RUN npm install

# Install Playwright browser for scan/scrape endpoints
RUN npx playwright install --with-deps chromium

COPY . .

ENV PORT=7860
EXPOSE 7860

CMD ["node", "server.mjs"]
