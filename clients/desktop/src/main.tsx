import {
	App,
	LocaleGate,
	OptionsApp,
	type OptionsScreen,
	type Platform,
	PlatformProvider,
	WindowTitleBar,
} from "@core/index";
import { invoke } from "@tauri-apps/api/core";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import "./styles/desktop.css";
import { desktopAutofill } from "./adapters/autofill";
import { desktopBackupCreds } from "./adapters/backup-creds";
import { desktopClipboard } from "./adapters/clipboard";
import { desktopCrypto } from "./adapters/crypto";
import { desktopFiles, startOpenedCopySweeps } from "./adapters/files";
import { desktopHttp } from "./adapters/http";
import { desktopPairing } from "./adapters/pairing";
import { desktopShell, registerOpenSetup, resolveAppVersion } from "./adapters/shell";
import { desktopStorage } from "./adapters/storage";
import { onVaultStateChange } from "./adapters/vault-session";
import { startBackupSchedule } from "./backup";
import { forwardConsoleToLog } from "./log-forward";
import { initRosterSync } from "./sync/roster";
import { listenForMenuUpdateCheck, promptForUpdateOnLaunch } from "./updates-prompt";
import { installWindowShortcuts, syncTrayTheme } from "./window-chrome";

// Decrypted attachment copies (opened in another app) are deleted at startup and on every lock,
// so none outlives the session it was opened in. See ./adapters/files.ts.
startOpenedCopySweeps();

const platform: Platform = {
	target: "desktop",
	storage: desktopStorage,
	crypto: desktopCrypto,
	autofill: desktopAutofill,
	shell: desktopShell,
	clipboard: desktopClipboard,
	pairing: desktopPairing,
	backupCreds: desktopBackupCreds,
	http: desktopHttp,
	files: desktopFiles,
	// biometric: Touch ID / Windows Hello is phase 1; nothing on Linux.
	// exchange: iOS only.
};

const isWindows = navigator.userAgent.includes("Windows");
const isMac = navigator.userAgent.includes("Macintosh");

// Module scope, not Root state, so the maximized listener keys on one stable Window reference.
const mainWindow = isWindows ? getCurrentWindow() : null;

// Snap layouts, Win+arrow and edge-drag all change maximize without toggleMaximize firing.
function useMaximized(win: Window | null): boolean {
	const [maximized, setMaximized] = useState(false);
	useEffect(() => {
		if (!win) return;
		let alive = true;
		const sync = () => {
			void win.isMaximized().then(
				(value) => {
					if (alive) setMaximized(value);
				},
				() => {},
			);
		};
		sync();
		const unlisten = listen(TauriEvent.WINDOW_RESIZED, sync).catch(() => null);
		return () => {
			alive = false;
			void unlisten.then((off) => {
				off?.();
			});
		};
	}, [win]);
	return maximized;
}

function Root() {
	// "app" = vault/unlock UI; the rest render OptionsApp and dismiss back to "app".
	// One window, so these are views rather than the extension's separate options page.
	const [view, setView] = useState<"app" | "setup" | "import" | "restore">("app");
	const maximized = useMaximized(mainWindow);

	useEffect(
		() =>
			registerOpenSetup((screen?: OptionsScreen) =>
				setView(screen === "import" ? "import" : screen === "restore" ? "restore" : "setup"),
			),
		[],
	);

	// Ongoing sync follows the lock state from here on: it starts on unlock and stops on lock.
	useEffect(() => initRosterSync(), []);

	// Scheduled backups, driven by the shell's tick. Deliberately not gated on the lock state:
	// a sealed blob needs no key to copy and the credentials are the OS's, so a vault's schedule
	// is kept whether or not it is unlocked. See ./backup.
	useEffect(() => startBackupSchedule(), []);

	// The one nudge about a new version. Nothing else tells anyone: this app is distributed as a
	// GitHub release, so without it a fix reaches only the people who open Settings and look.
	useEffect(() => promptForUpdateOnLaunch(), []);

	// The menu's "Check for Updates…", which is where people look for it rather than in Settings.
	useEffect(() => listenForMenuUpdateCheck(), []);

	// Locking clears the search index, so a panel left open would go on accepting typing and
	// answering "No matches" to everything the vault still holds. Dismiss it instead: the hotkey
	// already routes to this window while locked, so there is a way back.
	useEffect(
		() =>
			onVaultStateChange((locked) => {
				if (locked) void invoke("spotlight_hide");
			}),
		[],
	);

	const content =
		view === "app" ? (
			<App />
		) : (
			<OptionsApp
				onComplete={() => setView("app")}
				screen={view === "import" ? "import" : view === "restore" ? "restore" : undefined}
			/>
		);
	if (!isWindows && !isMac) return content;
	// The caption sits outside the gates App and OptionsApp activate for themselves, so one
	// gate is raised here; an already-active LocaleGate is a no-op.
	return (
		<LocaleGate>
			<div className="flex h-screen flex-col">
				<WindowTitleBar
					controls={isWindows}
					isMaximized={maximized}
					onMinimize={() => void mainWindow?.minimize()}
					onToggleMaximize={() => void mainWindow?.toggleMaximize()}
					onClose={() => void mainWindow?.close()}
				/>
				<div className="app-frame min-h-0 flex-1">{content}</div>
			</div>
		</LocaleGate>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

void (async () => {
	// First, and before any await: a failure during boot is exactly the kind this is here to
	// capture, and a release build has no devtools to read it from.
	forwardConsoleToLog();
	// Settings' "About" row reads this synchronously, so resolve it before the first render.
	await resolveAppVersion();
	// Ctrl-W / Ctrl-Q, and a tray icon that stays visible against the panel. Both are no-ops on
	// macOS, where the menu and the template icon already do the job. See ./window-chrome.
	installWindowShortcuts();
	createRoot(root).render(
		<PlatformProvider platform={platform}>
			<Root />
		</PlatformProvider>,
	);
	syncTrayTheme();
})();
