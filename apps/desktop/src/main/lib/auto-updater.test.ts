import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

// Minimal fake autoUpdater that behaves like electron-updater's
// instance for the code paths we exercise here.
class FakeAutoUpdater extends EventEmitter {
	autoDownload = false;
	autoInstallOnAppQuit = false;
	disableDifferentialDownload = false;
	allowDowngrade = false;
	setFeedURL = mock(() => {});
	checkForUpdates = mock(() => Promise.resolve(null));
	quitAndInstall = mock(() => {});
}

const fakeAutoUpdater = new FakeAutoUpdater();

mock.module("electron-updater", () => ({
	autoUpdater: fakeAutoUpdater,
}));

// The global test-setup's electron mock doesn't include app.isReady /
// app.whenReady; patch them here so setupAutoUpdater can run under bun:test.
mock.module("electron", () => ({
	app: {
		getPath: mock(() => ""),
		getName: mock(() => "test-app"),
		getVersion: mock(() => "1.0.0"),
		getAppPath: mock(() => ""),
		isPackaged: false,
		isReady: mock(() => true),
		whenReady: mock(() => Promise.resolve()),
	},
	dialog: {
		showMessageBox: mock(() => Promise.resolve({ response: 0 })),
	},
}));

mock.module("main/index", () => ({
	setSkipQuitConfirmation: mock(() => {}),
}));

const autoUpdater = await import("./auto-updater");
const { AUTO_UPDATE_STATUS } = await import("shared/auto-update");

describe("installUpdate", () => {
	beforeEach(() => {
		fakeAutoUpdater.removeAllListeners();
		fakeAutoUpdater.quitAndInstall.mockClear();
		fakeAutoUpdater.checkForUpdates.mockClear();
		fakeAutoUpdater.setFeedURL.mockClear();
	});

	test("ignores install requests when no update is ready", () => {
		autoUpdater.setupAutoUpdater();

		// No update-downloaded emitted, so status is not READY.
		expect(autoUpdater.getUpdateStatus().status).not.toBe(
			AUTO_UPDATE_STATUS.READY,
		);

		autoUpdater.installUpdate();

		// Calling quitAndInstall without a staged update leaves the user with
		// no feedback and nothing to install.
		expect(fakeAutoUpdater.quitAndInstall).not.toHaveBeenCalled();
	});

	test("does not invoke quitAndInstall multiple times when the install button is clicked repeatedly", () => {
		autoUpdater.setupAutoUpdater();

		// Simulate electron-updater announcing the update is downloaded so the
		// module transitions into READY and the UI would render an Install button.
		fakeAutoUpdater.emit("update-downloaded", { version: "9.9.9" });
		expect(autoUpdater.getUpdateStatus().status).toBe(AUTO_UPDATE_STATUS.READY);

		// User clicks "Install" several times before the app has actually
		// quit (Squirrel.Mac is still finalising the download in the
		// background, so quitAndInstall is a no-op until it finishes).
		autoUpdater.installUpdate();
		autoUpdater.installUpdate();
		autoUpdater.installUpdate();

		// BUG (pre-fix): each click drove another quitAndInstall() call. On
		// macOS each call re-registers a native-updater "update-downloaded"
		// listener, so when Squirrel finally finishes the download we fire N
		// concurrent quitAndInstall() calls against the native autoUpdater.
		// That is the root cause of
		// https://github.com/superset-sh/superset/issues/3507: the app
		// closes but the version doesn't change.
		expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
	});
});
