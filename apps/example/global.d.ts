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

// Augment the core package (@nitrofoundation/nitrocss) directly: the
// NitroCss*Props interfaces are declared there, and @nitrofoundation/nitrowind
// only re-exports/aliases them — augmenting the wrapper would not merge.
declare module "@nitrofoundation/nitrocss" {
	interface NitroCssViewProps {
		children?: ReactNode;
	}

	interface NitroCssTextProps {
		children?: ReactNode;
	}

	interface NitroCssScrollViewProps {
		children?: ReactNode;
	}
}
