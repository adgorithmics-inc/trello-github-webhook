FROM node:11.13.0

WORKDIR /app
COPY package.json /app
COPY server.js /app
RUN npm install
CMD node server.js
EXPOSE 2224
