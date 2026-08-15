import type { ReactNode } from "react";
import "react-native";

declare module "react-native" {
	interface ViewProps {
		className?: string;
	}

	interface TextProps {
		className?: string;
	}

	interface PressableProps {
		className?: string;
	}

	interface ScrollViewProps {
		contentContainerClassName?: string;
	}
}

// Augment the core package (nitrocss) directly: the
// NitroCss*Props interfaces are declared there, and nitrowind
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
