// Windows mounts this with the window controls; on macOS it is the spacer that keeps content
// clear of the native traffic lights (overlay titlebar), with no controls of our own. Tauri's
// injected drag script honours only elements that carry data-tauri-drag-region themselves, and
// already turns a double-click on the region into a toggle-maximize, so no handler here: it
// would race.

import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { cn } from "./ui/utils";

type GlyphKind = "minimize" | "maximize" | "restore" | "close";

const GLYPHS = {
	minimize: <path d="M0.5 5h9" />,
	maximize: <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />,
	restore: (
		<>
			<path d="M7.5 0.5H0.5V7.5" />
			<rect x="2.5" y="2.5" width="7" height="7" />
		</>
	),
	close: <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />,
} satisfies Record<GlyphKind, ReactNode>;

// Cursor is reset to the arrow: theme.css points every button, and a hand on window chrome
// reads as a webpage.
const BUTTON_BASE =
	"group relative grid h-8 w-[46px] cursor-default place-items-center focus-visible:outline-none";

const PILL_BASE =
	"absolute inset-x-1 inset-y-[3px] rounded-lg border border-transparent transition-all";

const PILL_VISIBLE =
	"group-hover:border-border group-hover:bg-primary/10 group-active:scale-[0.95]";

const PILL_DESTRUCTIVE = "group-hover:bg-destructive group-active:scale-[0.98]";

const PILL_FOCUS = "group-focus-visible:ring-2 group-focus-visible:ring-ring";

function CaptionButton({
	label,
	kind,
	destructive,
	onClick,
}: {
	label: string;
	kind: GlyphKind;
	destructive?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			className={BUTTON_BASE}
		>
			<span
				aria-hidden="true"
				className={cn(PILL_BASE, PILL_FOCUS, destructive ? PILL_DESTRUCTIVE : PILL_VISIBLE)}
			/>
			<svg
				width="10"
				height="10"
				viewBox="0 0 10 10"
				fill="none"
				stroke="currentColor"
				strokeWidth="1"
				aria-hidden="true"
				className={destructive ? "group-hover:text-destructive-foreground" : undefined}
			>
				{GLYPHS[kind]}
			</svg>
		</button>
	);
}

export function WindowTitleBar({
	controls,
	isMaximized = false,
	onMinimize = () => {},
	onToggleMaximize = () => {},
	onClose = () => {},
}: {
	controls: boolean;
	isMaximized?: boolean;
	onMinimize?: () => void;
	onToggleMaximize?: () => void;
	onClose?: () => void;
}) {
	const { t } = useLingui();
	return (
		<div className="flex h-8 shrink-0 items-stretch" data-tauri-drag-region>
			<div className="min-w-0 flex-1" data-tauri-drag-region />
			{controls && (
				<>
					<CaptionButton label={t`Minimize`} kind="minimize" onClick={onMinimize} />
					<CaptionButton
						label={isMaximized ? t`Restore` : t`Maximize`}
						kind={isMaximized ? "restore" : "maximize"}
						onClick={onToggleMaximize}
					/>
					<CaptionButton label={t`Close`} kind="close" destructive onClick={onClose} />
				</>
			)}
		</div>
	);
}
