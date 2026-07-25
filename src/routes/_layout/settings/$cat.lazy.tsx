import { createLazyFileRoute } from "@tanstack/react-router";
import {
	type CatKey,
	SETTINGS_CATEGORIES,
	UnifiedSettingsPage,
} from "@/pages/settings/unified/page";

export const Route = createLazyFileRoute("/_layout/settings/$cat")({
	component: SettingsCategoryComponent,
});

function SettingsCategoryComponent() {
	const { cat } = Route.useParams();
	const category: CatKey = (SETTINGS_CATEGORIES as string[]).includes(cat)
		? (cat as CatKey)
		: "general";
	return <UnifiedSettingsPage category={category} />;
}
