import { describe, expect, it } from "vitest";

import {
    NODE_ACTION_META,
    nodeActionsForSelection,
    type SelectionCounts,
    type SelectionOptions,
} from "./node-actions";
import { NODE_TYPE_TO_ABI_FEATURE } from "./node-feature-registry";

function types(counts: SelectionCounts, options?: SelectionOptions): string[] {
    return nodeActionsForSelection(counts, options).map((c) => c.nodeType);
}

describe("action metadata", () => {
    // The drift guard. Before this existed, `remove_watermark`,
    // `subtitle_remove` and `text-audio-gen-speech` shipped with no way to
    // reach them from the canvas, and nothing failed.
    it("covers every ABI node type", () => {
        const missing = Object.keys(NODE_TYPE_TO_ABI_FEATURE).filter(
            (nodeType) => !NODE_ACTION_META[nodeType],
        );
        expect(missing).toEqual([]);
    });

    it("has no entry for a node type the registry doesn't know", () => {
        const unknown = Object.keys(NODE_ACTION_META).filter(
            (nodeType) => !NODE_TYPE_TO_ABI_FEATURE[nodeType],
        );
        expect(unknown).toEqual([]);
    });

    it("returns candidates in ascending order", () => {
        const orders = nodeActionsForSelection({
            imageNode: 1,
        }).map((c) => c.order);
        expect(orders).toEqual([...orders].sort((a, b) => a - b));
    });
});

describe("single modality selections", () => {
    it("offers the image transforms for one image", () => {
        expect(types({ imageNode: 1 })).toEqual([
            "imageGenTextNode",
            "imageGenVideoNode",
            "imageGenImageNode",
            "imageGenImageUpscaleNode",
            "imageGenModelNode",
            "imagePoseNode",
            "imageBodySegNode",
            "imageNormalNode",
            "imageMattingNode",
        ]);
    });

    it("offers the text transforms for one text", () => {
        const got = types({ textNode: 1 });
        expect(got).toContain("genTextNode");
        expect(got).toContain("textGenVideoNode");
        expect(got).toContain("textGenImageNode");
        // An image handle with nothing to fill it rules these out.
        expect(got).not.toContain("imageGenVideoNode");
        expect(got).not.toContain("imageGenImageNode");
    });

    it("offers document / link parsing", () => {
        expect(types({ fileNode: 1 })).toEqual(["fileGenTextNode"]);
        expect(types({ linkNode: 1 })).toEqual(["linkGenTextNode"]);
    });

    it("feeds a 3D model into the image handles", () => {
        expect(types({ modelNode: 1 })).toEqual([
            "imageGenTextNode",
            "imageGenVideoNode",
        ]);
    });
});

describe("compose vs single-node variants of one slot", () => {
    // image-gen-video has two node types: the plain one takes its prompt from
    // the form, the compose one from a text handle.
    it("picks the form-prompt variant for a lone image", () => {
        const got = types({ imageNode: 1 });
        expect(got).toContain("imageGenVideoNode");
        expect(got).not.toContain("imageGenVideoComposeNode");
    });

    it("picks the handle-prompt variant for image + text", () => {
        const got = types({ imageNode: 1, textNode: 1 });
        expect(got).toContain("imageGenVideoComposeNode");
        expect(got).not.toContain("imageGenVideoNode");
    });

    // This pairing used to be unreachable: an earlier branch in the hand-written
    // chain matched "one text + one media" first and only ever offered the
    // omni-reference node, so "generate video" / "edit image" never showed up.
    it("offers editing alongside generation for image + text", () => {
        expect(types({ imageNode: 1, textNode: 1 })).toEqual([
            "imageGenVideoComposeNode",
            "imageGenImageNode",
            "refsGenVideoNode",
        ]);
    });
});

describe("required handles", () => {
    it("needs both sides for lip sync", () => {
        expect(types({ videoNode: 1, audioNode: 1 })).toContain(
            "audioVideoLipSyncNode",
        );
        expect(types({ videoNode: 1 })).not.toContain("audioVideoLipSyncNode");
        expect(types({ audioNode: 1 })).not.toContain("audioVideoLipSyncNode");
    });

    it("needs audio for a music cover", () => {
        expect(types({ audioNode: 1 })).toContain("musicCoverNode");
        expect(types({ textNode: 1 })).not.toContain("musicCoverNode");
    });
});

describe("product caps", () => {
    it("allows first/last-frame video only with exactly two images", () => {
        expect(types({ imageNode: 2 })).toContain("imageImageGenVideoNode");
        expect(types({ imageNode: 3 })).not.toContain("imageImageGenVideoNode");
        expect(types({ imageNode: 1 })).not.toContain("imageImageGenVideoNode");
    });

    it("caps image fusion at 14 and images-to-video at 9", () => {
        expect(types({ imageNode: 9 })).toContain("imagesGenVideoNode");
        expect(types({ imageNode: 10 })).not.toContain("imagesGenVideoNode");
        expect(types({ imageNode: 14 })).toContain("imageFusionNode");
        expect(types({ imageNode: 15 })).not.toContain("imageFusionNode");
    });

    it("caps omni-reference at 9 images / 3 clips / 3 audio / 12 total", () => {
        expect(types({ imageNode: 2, videoNode: 3 })).toContain(
            "refsGenVideoNode",
        );
        expect(types({ videoNode: 4 })).not.toContain("refsGenVideoNode");
        expect(types({ audioNode: 4 })).not.toContain("refsGenVideoNode");
        expect(
            types({ imageNode: 9, videoNode: 3, audioNode: 3 }),
        ).not.toContain("refsGenVideoNode");
    });

    it("keeps omni-reference off a single node", () => {
        expect(types({ imageNode: 1 })).not.toContain("refsGenVideoNode");
        expect(types({ imageNode: 1, textNode: 1 })).toContain(
            "refsGenVideoNode",
        );
    });

    it("rewrites text only when there are several texts", () => {
        expect(types({ textNode: 1 })).not.toContain("textsGenTextNode");
        expect(types({ textNode: 2 })).toContain("textsGenTextNode");
    });
});

describe("group-scoped actions", () => {
    it("offers filter / arrange / concat only inside a grouped node", () => {
        const plain = types({ videoNode: 1 });
        expect(plain).not.toContain("dropVideoNode");
        expect(plain).not.toContain("arrangeNode");
        expect(plain).not.toContain("concatVideoNode");

        const grouped = types({ videoNode: 1 }, { group: true });
        expect(grouped).toContain("dropVideoNode");
        expect(grouped).toContain("arrangeNode");
        expect(grouped).toContain("concatVideoNode");
    });

    it("uses the compose variant of concat for several video nodes", () => {
        const got = types({ videoNode: 2 });
        expect(got).toContain("concatVideoComposeNode");
        expect(got).not.toContain("concatVideoNode");
    });
});

describe("slots that previously had no entry point", () => {
    it("reaches watermark and subtitle removal from a video", () => {
        const got = types({ videoNode: 1 });
        expect(got).toContain("removeWatermarkNode");
        expect(got).toContain("removeVideoSubtitleNode");
    });

    it("reaches styled speech from text + audio", () => {
        expect(types({ textNode: 1, audioNode: 1 })).toContain(
            "textAudioGenSpeechNode",
        );
    });
});
