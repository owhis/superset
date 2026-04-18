import { quote } from "shell-quote";

export function shellEscapePath(path: string): string {
	return quote([path]);
}
