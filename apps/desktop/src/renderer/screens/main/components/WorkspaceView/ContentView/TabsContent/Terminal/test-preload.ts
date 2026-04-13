// Preload: provide minimal browser globals for xterm addons that access
// `window` during module evaluation (e.g. @xterm/addon-webgl).

if (typeof globalThis.window === "undefined") {
	const win = globalThis as Record<string, unknown>;
	win.window = globalThis;
	win.self = globalThis;
	const stubElement = () => ({
		style: {},
		getContext: () => null,
		toDataURL: () => "",
		addEventListener: () => {},
		removeEventListener: () => {},
		appendChild: () => {},
		removeChild: () => {},
		setAttribute: () => {},
		getAttribute: () => null,
		insertBefore: () => {},
		width: 0,
		height: 0,
		childNodes: [],
		firstChild: null,
		parentNode: null,
		textContent: "",
		innerHTML: "",
	});
	win.document = {
		createElement: () => stubElement(),
		createElementNS: () => stubElement(),
		createTextNode: () => stubElement(),
		addEventListener: () => {},
		removeEventListener: () => {},
		getElementsByTagName: () => [],
		getElementById: () => null,
		querySelector: () => null,
		querySelectorAll: () => [],
		head: stubElement(),
		body: stubElement(),
		documentElement: stubElement(),
	};
	win.HTMLCanvasElement = class {};
	win.WebGL2RenderingContext = class {};
	win.WebGLRenderingContext = class {};
	win.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
	win.cancelAnimationFrame = (id: number) => clearTimeout(id);
	win.matchMedia = () => ({
		matches: false,
		addEventListener: () => {},
		removeEventListener: () => {},
	});
	win.localStorage = {
		getItem: () => null,
		setItem: () => {},
		removeItem: () => {},
	};
	// trpc-electron expects this global from Electron's preload script
	win.electronTRPC = {
		sendMessage: () => {},
		onMessage: () => () => {},
	};
}
