import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env";
import { registerProxyRoutes } from "./proxy";
import { registerTunnelRoute, TunnelManager } from "./tunnel";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
const tunnelManager = new TunnelManager(env.REQUEST_TIMEOUT_MS);

app.use("*", logger());
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

registerTunnelRoute({
	app,
	upgradeWebSocket,
	tunnelManager,
	authUrl: env.NEXT_PUBLIC_API_URL,
});

registerProxyRoutes({
	app,
	upgradeWebSocket,
	tunnelManager,
	authUrl: env.NEXT_PUBLIC_API_URL,
});

const server = serve({ fetch: app.fetch, port: env.RELAY_PORT }, (info) => {
	console.log(`[relay] listening on http://localhost:${info.port}`);
});
injectWebSocket(server);
