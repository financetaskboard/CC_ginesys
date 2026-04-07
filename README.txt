# CC→Odoo Statement Importer — Web Server

Works exactly like the TDS app — runs on a web server, accessible from any browser on the network.

## Setup (One Time)

1. Install Node.js from https://nodejs.org  (LTS version)

2. Put these 3 files in one folder:
   - server.js
   - package.json
   - cc-odoo-app-v2.html

3. Open Command Prompt in that folder and run:
   ```
   npm install
   ```

4. Start the server:
   ```
   node server.js
   ```

5. Open your browser: http://localhost:3004

## Daily Use

Just run `node server.js` and open http://localhost:3004
All Odoo calls go through the server — no CORS, no Python needed.

## Deploy on Company Server / VPS

Upload the 3 files + node_modules to your server.
Run `node server.js` or use PM2 to keep it running:
```
npm install -g pm2
pm2 start server.js --name cc-odoo
pm2 save
```
Then access from any PC on the network: http://YOUR-SERVER-IP:3004

## Data Storage

All your settings, partner mappings, and transaction history are saved in
`cc-state.json` in the same folder. Back this file up periodically.
