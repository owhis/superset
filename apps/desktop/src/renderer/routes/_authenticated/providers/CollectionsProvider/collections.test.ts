import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Reproduction test for GitHub issue #3049:
 * Renderer process memory leak → V8 GC death spiral (130%+ CPU after ~60 min)
 *
 * Root cause: The `collectionsCache` Map in collections.ts grows unboundedly.
 * Each organization creates ~20 Electric SQL shape subscriptions via
 * `createOrgCollections()`. When switching orgs, old collections (and their
 * active sync connections) are never cleaned up. Over time, this accumulates
 * hundreds of active subscriptions that buffer data and grow memory linearly.
 *
 * Even with a single org, the lack of a cleanup mechanism means stale
 * collections can never be evicted during a long-running session.
 */

// Track all created collections so we can verify cleanup behavior
const createdCollections: Array<{
	id: string;
	cleanedUp: boolean;
	preloaded: boolean;
}> = [];

// Mock @tanstack/react-db to track collection lifecycle
mock.module("@tanstack/react-db", () => ({
	createCollection: (opts: { id: string }) => {
		const entry = { id: opts.id, cleanedUp: false, preloaded: false };
		createdCollections.push(entry);
		return {
			id: opts.id,
			preload: async () => {
				entry.preloaded = true;
			},
			cleanup: async () => {
				entry.cleanedUp = true;
			},
		};
	},
	localStorageCollectionOptions: (opts: { id: string }) => ({
		id: opts.id,
	}),
}));

mock.module("@tanstack/electric-db-collection", () => ({
	electricCollectionOptions: (opts: { id: string }) => ({
		id: opts.id,
	}),
}));

mock.module("@electric-sql/client", () => ({
	snakeCamelMapper: () => (row: Record<string, unknown>) => row,
}));

mock.module("@trpc/client", () => ({
	createTRPCProxyClient: () => ({}),
	httpBatchLink: () => ({}),
}));

mock.module("renderer/env.renderer", () => ({
	env: {
		NEXT_PUBLIC_ELECTRIC_URL: "http://localhost:3000",
		NEXT_PUBLIC_API_URL: "http://localhost:4000",
		SKIP_ENV_VALIDATION: "1",
	},
}));

mock.module("renderer/lib/auth-client", () => ({
	getAuthToken: () => "mock-token",
	getJwt: () => "mock-jwt",
}));

mock.module("superjson", () => ({
	default: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v },
}));

// Import after mocks are set up
const { getCollections, preloadCollections, cleanupCollections } = await import(
	"./collections"
);

describe("collections cache memory leak (#3049)", () => {
	beforeEach(() => {
		createdCollections.length = 0;
	});

	afterEach(() => {
		// Clean up all orgs between tests
		cleanupCollections();
	});

	test("getCollections caches collections per organization", () => {
		const org1a = getCollections("org-1");
		const org1b = getCollections("org-1");

		// Same reference — cached
		expect(org1a.tasks).toBe(org1b.tasks);
	});

	test("switching orgs accumulates collections without cleanup", () => {
		// Simulate what happens when a user switches between organizations
		getCollections("org-1");
		const collectionsAfterOrg1 = createdCollections.length;

		getCollections("org-2");
		const collectionsAfterOrg2 = createdCollections.length;

		getCollections("org-3");
		const collectionsAfterOrg3 = createdCollections.length;

		// Each org creates ~20 new collections (Electric subscriptions)
		const perOrg = collectionsAfterOrg1;
		expect(perOrg).toBeGreaterThan(15); // sanity: many collections per org
		expect(collectionsAfterOrg2).toBe(perOrg * 2);
		expect(collectionsAfterOrg3).toBe(perOrg * 3);

		// Before the fix: none of the old org's collections would ever be cleaned up.
		// All subscriptions remain active, buffering data and consuming memory.
		// After the fix: cleanupCollections() can be called to tear them down.
	});

	test("cleanupCollections evicts a specific org from the cache", () => {
		getCollections("org-1");
		getCollections("org-2");

		const beforeCleanup = createdCollections.filter((c) => c.cleanedUp).length;
		expect(beforeCleanup).toBe(0);

		// Clean up org-1 while keeping org-2
		cleanupCollections("org-1");

		// org-1's collections should have cleanup() called
		const org1Cleaned = createdCollections.filter(
			(c) => c.id.includes("org-1") && c.cleanedUp,
		);
		expect(org1Cleaned.length).toBeGreaterThan(0);

		// org-2's collections should be untouched
		const org2Cleaned = createdCollections.filter(
			(c) => c.id.includes("org-2") && c.cleanedUp,
		);
		expect(org2Cleaned.length).toBe(0);

		// Getting org-1 again should create fresh collections
		const freshCollections = getCollections("org-1");
		expect(freshCollections).toBeDefined();
	});

	test("cleanupCollections with no arg evicts all orgs", () => {
		getCollections("org-1");
		getCollections("org-2");
		getCollections("org-3");

		cleanupCollections();

		const allCleaned = createdCollections.filter((c) => c.cleanedUp);
		expect(allCleaned.length).toBe(createdCollections.length);
	});

	test("preloadCollections followed by cleanup releases resources", async () => {
		await preloadCollections("org-preload");

		const preloaded = createdCollections.filter((c) => c.preloaded);
		expect(preloaded.length).toBeGreaterThan(0);

		cleanupCollections("org-preload");

		const cleaned = createdCollections.filter(
			(c) => c.id.includes("org-preload") && c.cleanedUp,
		);
		expect(cleaned.length).toBeGreaterThan(0);
	});
});
