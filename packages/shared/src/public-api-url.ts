interface ResolvePublicApiUrlOptions {
	defaultApiUrl: string;
	overrideApiUrl?: string | null;
}

function trimTrailingSlash(url: string): string {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function resolvePublicApiUrl({
	defaultApiUrl,
	overrideApiUrl,
}: ResolvePublicApiUrlOptions): string {
	const normalizedOverride = overrideApiUrl?.trim();

	if (normalizedOverride) {
		return trimTrailingSlash(normalizedOverride);
	}

	return trimTrailingSlash(defaultApiUrl);
}
