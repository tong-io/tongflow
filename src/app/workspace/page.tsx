import Workspace from "@/components/workspace/workspace";

export const metadata = {
    title: "Workspace — TongFlow",
    description:
        "Build and run generative AI workflows on the TongFlow canvas.",
};

export default async function WorkspacePage() {
    return <Workspace />;
}
