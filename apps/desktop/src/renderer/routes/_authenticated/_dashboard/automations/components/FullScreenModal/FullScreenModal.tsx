import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@superset/ui/utils";
import type * as React from "react";

/**
 * Full-bleed modal variant. shadcn's Dialog centers a small card; the
 * automations create/edit flow needs a nearly-full-screen sheet that sits
 * above the app shell, matching the reference mocks.
 *
 * Composition mirrors Dialog (Root / Trigger / Content / Header / Footer)
 * so callers can swap primitives without rewiring behavior.
 */

export const FullScreenModal = DialogPrimitive.Root;
export const FullScreenModalTrigger = DialogPrimitive.Trigger;
export const FullScreenModalClose = DialogPrimitive.Close;

export function FullScreenModalContent({
	className,
	children,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
	return (
		<DialogPrimitive.Portal>
			<DialogPrimitive.Overlay
				className={cn(
					"fixed inset-0 z-50 bg-black/55 backdrop-blur-sm",
					"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
				)}
			/>
			<DialogPrimitive.Content
				{...props}
				className={cn(
					"fixed z-50 inset-4 md:inset-8 lg:inset-12",
					"bg-card text-foreground rounded-2xl border shadow-2xl",
					"flex flex-col overflow-hidden",
					"data-[state=open]:animate-in data-[state=closed]:animate-out",
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
					"data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]",
					className,
				)}
			>
				{children}
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	);
}

export function FullScreenModalHeader({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex items-center justify-end gap-2 px-6 pt-5 pb-2",
				className,
			)}
			{...props}
		/>
	);
}

export function FullScreenModalBody({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-1 min-h-0 flex-col gap-4 px-8 pt-4 pb-6 overflow-y-auto",
				className,
			)}
			{...props}
		/>
	);
}

export function FullScreenModalFooter({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("flex items-center gap-2 border-t px-6 py-3", className)}
			{...props}
		/>
	);
}

export function FullScreenModalTitle({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			className={cn("text-2xl font-semibold leading-none", className)}
			{...props}
		/>
	);
}
