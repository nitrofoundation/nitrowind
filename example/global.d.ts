import type { ReactNode } from "react";
import "react-native";

declare module "react-native" {
	interface ViewProps {
		className?: string;
		children?: ReactNode;
	}

	interface TextProps {
		className?: string;
		children?: ReactNode;
	}

	interface PressableProps {
		className?: string;
		children?: ReactNode;
	}

	interface ScrollViewProps {
		contentContainerClassName?: string;
		children?: ReactNode;
	}
}

declare module "nitrowind" {
	interface NitrowindViewProps {
		children?: ReactNode;
	}

	interface NitrowindTextProps {
		children?: ReactNode;
	}

	interface NitrowindScrollViewProps {
		children?: ReactNode;
	}
}
