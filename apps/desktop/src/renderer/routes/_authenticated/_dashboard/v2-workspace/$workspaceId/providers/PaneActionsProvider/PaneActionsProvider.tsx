import { createContext, type ReactNode, useContext } from "react";

export interface PaneActions {
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onRevealPath: (path: string) => void;
	onOpenExternal: (
		path: string,
		opts?: { line?: number; column?: number },
	) => void;
}

const PaneActionsContext = createContext<PaneActions | null>(null);

export function PaneActionsProvider({
	value,
	children,
}: {
	value: PaneActions;
	children: ReactNode;
}) {
	return (
		<PaneActionsContext.Provider value={value}>
			{children}
		</PaneActionsContext.Provider>
	);
}

export function usePaneActions(): PaneActions {
	const value = useContext(PaneActionsContext);
	if (!value) {
		throw new Error("usePaneActions must be used inside PaneActionsProvider");
	}
	return value;
}
