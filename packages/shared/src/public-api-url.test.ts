import { describe, expect, it } from "bun:test";
import { resolvePublicApiUrl } from "./public-api-url";

describe("resolvePublicApiUrl", () => {
	it("returns the override when one is provided", () => {
		expect(
			resolvePublicApiUrl({
				defaultApiUrl: "http://localhost:3001",
				overrideApiUrl: "https://linear-dev.ngrok.app",
			}),
		).toBe("https://linear-dev.ngrok.app");
	});

	it("falls back to the default API URL when no override is provided", () => {
		expect(
			resolvePublicApiUrl({
				defaultApiUrl: "http://localhost:3001",
			}),
		).toBe("http://localhost:3001");
	});

	it("normalizes trailing slashes", () => {
		expect(
			resolvePublicApiUrl({
				defaultApiUrl: "http://localhost:3001/",
				overrideApiUrl: "https://linear-dev.ngrok.app/",
			}),
		).toBe("https://linear-dev.ngrok.app");
	});
});
