import { createLazyFileRoute } from "@tanstack/react-router";
import { UnifiedSettingsPage } from "@/pages/settings/unified/page";

export const Route = createLazyFileRoute("/_layout/settings/")({
	component: UnifiedSettingsIndexComponent,
});

function UnifiedSettingsIndexComponent() {
	return <UnifiedSettingsPage category="general" />;
}
