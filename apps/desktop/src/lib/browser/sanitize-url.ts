/**
 * Normalise raw address-bar input into a loadable URL.
 *
 * Recognition order:
 *  1. Full URLs with a known scheme (http, https, file, about)
 *  2. localhost / 127.0.0.1 → prefix with http://
 *  3. Anything containing a dot → prefix with https://
 *  4. Everything else → Google search
 */
export function sanitizeUrl(url: string): string {
	if (
		/^https?:\/\//i.test(url) ||
		url.startsWith("file://") ||
		url.startsWith("about:")
	) {
		return url;
	}
	if (url.startsWith("localhost") || url.startsWith("127.0.0.1")) {
		return `http://${url}`;
	}
	if (url.includes(".")) {
		return `https://${url}`;
	}
	return `https://www.google.com/search?q=${encodeURIComponent(url)}`;
}
