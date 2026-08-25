import { createLazyFileRoute } from "@tanstack/react-router";
import { AnnotateLabPage } from "@/pages/annotateLab/page";

export const Route = createLazyFileRoute("/_layout/annotateLab")({
	component: AnnotateLabPage,
});
