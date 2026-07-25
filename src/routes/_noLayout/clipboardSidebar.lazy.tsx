import { createLazyFileRoute } from "@tanstack/react-router";
import { ClipboardSidebarPage } from "@/pages/clipboardSidebar/page";

export const Route = createLazyFileRoute("/_noLayout/clipboardSidebar")({
	component: RouteComponent,
});

function RouteComponent() {
	return <ClipboardSidebarPage />;
}
