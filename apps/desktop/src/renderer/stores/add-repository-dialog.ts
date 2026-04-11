import { create } from "zustand";

interface AddRepositoryDialogState {
	isOpen: boolean;
	openDialog: () => void;
	closeDialog: () => void;
}

export const useAddRepositoryDialogStore = create<AddRepositoryDialogState>()(
	(set) => ({
		isOpen: false,
		openDialog: () => set({ isOpen: true }),
		closeDialog: () => set({ isOpen: false }),
	}),
);

export const useAddRepositoryDialogOpen = () =>
	useAddRepositoryDialogStore((state) => state.isOpen);
export const useOpenAddRepositoryDialog = () =>
	useAddRepositoryDialogStore((state) => state.openDialog);
export const useCloseAddRepositoryDialog = () =>
	useAddRepositoryDialogStore((state) => state.closeDialog);
