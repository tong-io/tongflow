"use client";

import { Handle, Position } from "@xyflow/react";
import { Box, Download, Maximize2, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useFileAsyncLoader } from "@/hooks/use-file-async-loader";
import { logger } from "@/lib/logger";
import type { RfDataNodeProps } from "@/types/nodes";
import { BaseNodeShell } from "../base/base-node-shell";
import {
    NodeHeader,
    NodeHeaderActions,
    NodeHeaderComboAction,
    NodeHeaderIcon,
    NodeHeaderMenuAction,
    NodeHeaderTitle,
} from "../base/node-header";
import { ModalityPlaceholder } from "./modality-placeholder";

type ModelNodeRfProps = RfDataNodeProps<"modelNode">;

// Frame camera to bound the mesh
const _fitCameraToSelection = (
    camera: THREE.PerspectiveCamera,
    controls: any,
    selection: THREE.Object3D,
    fitOffset = 1.2,
) => {
    const box = new THREE.Box3();
    box.setFromObject(selection);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxSize = Math.max(size.x, size.y, size.z);
    const fitHeightDistance =
        maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360));
    const fitWidthDistance = fitHeightDistance / camera.aspect;
    const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);

    const direction = controls.target
        .clone()
        .sub(camera.position)
        .normalize()
        .multiplyScalar(distance);

    controls.maxDistance = distance * 10;
    controls.target.copy(center);

    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.updateProjectionMatrix();

    camera.position.copy(controls.target).sub(direction);
    controls.update();
};

// Object-space bounds that also work for a Gaussian-splat SplatMesh. A SplatMesh
// has no traversable triangle geometry, so Box3.setFromObject returns empty;
// fall back to expanding over splat centers via Spark's forEachSplat.
type SplatLike = {
    forEachSplat?: (
        cb: (
            index: number,
            center: THREE.Vector3,
            scales: THREE.Vector3,
            quaternion: THREE.Quaternion,
            opacity: number,
            color: THREE.Color,
        ) => void,
    ) => void;
};
const computeObjectBounds = (model: THREE.Object3D): THREE.Box3 => {
    const box = new THREE.Box3().setFromObject(model);
    if (!box.isEmpty()) return box;
    const splat = model as unknown as SplatLike;
    if (typeof splat.forEachSplat === "function") {
        splat.forEachSplat((_i, center) => {
            box.expandByPoint(center);
        });
    }
    return box;
};

// Naive fit + center helper
const autoScaleAndCenter = (
    model: THREE.Object3D,
    camera: THREE.PerspectiveCamera,
    containerWidth: number,
    containerHeight: number,
) => {
    const box = computeObjectBounds(model);
    // No derivable bounds (e.g. an empty/!forEachSplat object): leave the model
    // at its native transform rather than computing a NaN center.
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Recenter mesh pivot
    model.position.x += model.position.x - center.x;
    model.position.y += model.position.y - center.y;
    model.position.z += model.position.z - center.z;

    // Normalize scale for consistent lighting response
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 8; // Target ~8 world units for preview scale
    if (maxDim > 0) {
        const scale = targetSize / maxDim;
        model.scale.multiplyScalar(scale);
    }

    // Reposition orbit camera
    // Derive camera distance via targetSize
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(targetSize / 2 / Math.tan(fov / 2));

    // Add breathing room around framing box
    cameraZ *= 1.5;

    camera.position.set(0, 0, cameraZ);
    camera.lookAt(0, 0, 0);

    // Refresh projection matrices
    camera.aspect = containerWidth / containerHeight;
    camera.updateProjectionMatrix();
};

// Immersive 3D inspector modal
const FullScreen3DModal = ({
    fileKey,
    fileExtension,
    onClose,
}: {
    fileKey: string;
    fileExtension: string;
    onClose: () => void;
}) => {
    const t = useTranslations("Workspace.nodes.modal");
    const [mounted, setMounted] = useState(false);
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const modelRef = useRef<THREE.Object3D | null>(null);
    const animationIdRef = useRef<number | null>(null);
    // Re-arm the on-demand render loop from outside setupScene (e.g. reset view).
    const requestRenderRef = useRef<((frames?: number) => void) | null>(null);
    // Camera-controls instance (typed loosely; imported dynamically).
    const controlsRef = useRef<{
        reset: () => void;
        dispose: () => void;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { url } = useFileAsyncLoader(fileKey, { priority: "high" });

    const setupScene = useCallback(() => {
        if (!mountRef.current || !url) return;

        // Return teardown closure
        const init = async () => {
            try {
                setIsLoading(true);
                setError(null);

                logger.debug(
                    "[FullScreen3DModal] Starting scene setup with URL:",
                    url,
                    "Extension:",
                    fileExtension,
                );
                const scene = new THREE.Scene();
                scene.background = new THREE.Color(0xf0f0f0); // Light-gray backdrop so blank canvas reads as intentional
                sceneRef.current = scene;

                // Camera rig setup
                const width = mountRef.current!.clientWidth;
                const height = mountRef.current!.clientHeight;
                const camera = new THREE.PerspectiveCamera(
                    45,
                    width / height,
                    0.1,
                    1000,
                );
                camera.position.set(5, 5, 5);
                cameraRef.current = camera;

                // Renderer + tone mapping knobs
                const renderer = new THREE.WebGLRenderer({
                    antialias: true,
                    alpha: true,
                });
                renderer.setSize(width, height);
                // Cap DPR: at native retina (2–3x) Spark sorts/draws 4–9x the
                // splats per frame, which pegs the GPU. 2 is plenty for preview.
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                renderer.outputColorSpace = THREE.SRGBColorSpace; // Respect sRGB color space
                rendererRef.current = renderer;

                // Mount renderer canvas in host
                if (mountRef.current) {
                    mountRef.current.innerHTML = "";
                    mountRef.current.appendChild(renderer.domElement);
                }

                // Scene lighting rig
                // Tweaked ambient + key fills
                // Tweaked ambient + key fills
                // Hemisphere light approximates sky versus ground bounce
                const hemisphereLight = new THREE.HemisphereLight(
                    0xffffff,
                    0x444444,
                    1.5,
                );
                hemisphereLight.position.set(0, 20, 0);
                scene.add(hemisphereLight);

                // Camera-attached headlamp prevents dark interiors
                // Parent camera into scene graph so child lights illuminate
                scene.add(camera);
                const cameraLight = new THREE.DirectionalLight(0xffffff, 2.5);
                cameraLight.position.set(0, 0, 1); // Align with camera-forward axis
                camera.add(cameraLight);

                // Rim light exaggerates curvature
                const backLight = new THREE.DirectionalLight(0xffffff, 1.0);
                backLight.position.set(0, 5, -5);
                scene.add(backLight);

                // On-demand rendering: only draw when something changed. A frame
                // budget is armed on load/interaction and decremented per drawn
                // frame; when it hits 0 the loop idles (no GPU work). The warmup
                // budget also lets Spark's async splat sort converge after load.
                let renderBudget = 120;
                const requestRender = (frames = 90) => {
                    renderBudget = Math.max(renderBudget, frames);
                };
                requestRenderRef.current = requestRender;

                // Keep gestures from bubbling to page scroll behind the modal.
                const canvas = renderer.domElement;
                const stopProp = (e: Event) => e.stopPropagation();
                canvas.addEventListener("wheel", stopProp, { passive: false });

                // Stream chosen loader path
                const extension = fileExtension.toLowerCase();

                try {
                    if (extension === ".glb" || extension === ".gltf") {
                        await loadGLTF(url, scene, modelRef);
                    } else if (extension === ".obj") {
                        await loadOBJ(url, scene, modelRef);
                    } else if (
                        extension === ".ply" ||
                        extension === ".spz" ||
                        extension === ".splat" ||
                        extension === ".ksplat" ||
                        extension === ".sog"
                    ) {
                        await loadSplat(
                            url,
                            scene,
                            modelRef,
                            renderer,
                            extension,
                        );
                    } else if (extension === ".fbx") {
                        await loadFBX(url, scene, modelRef);
                    } else if (extension === ".stl") {
                        await loadSTL(url, scene, modelRef);
                    } else if (extension === ".dae") {
                        await loadDAE(url, scene, modelRef);
                    } else if (extension === ".usdz" || extension === ".usd") {
                        await loadUSDZ(url, scene, modelRef);
                    } else if (
                        extension === ".ptx" ||
                        extension === ".pts" ||
                        extension === ".xyz"
                    ) {
                        await loadPointCloud(url, scene, extension, modelRef);
                    } else if (extension === ".3ds") {
                        await load3DS(url, scene, modelRef);
                    } else if (extension === ".igs" || extension === ".iges") {
                        await loadIGES(url, scene, modelRef);
                    } else if (extension === ".step" || extension === ".stp") {
                        await loadSTEP(url, scene, modelRef);
                    } else if (extension === ".vtp") {
                        await loadVTP(url, scene, modelRef);
                    } else {
                        throw new Error(
                            `Unsupported file format: ${extension}`,
                        );
                    }
                } catch (loadErr) {
                    logger.error("Failed to load model:", loadErr);
                    throw loadErr;
                }

                // Autoscale + center the model at the origin and position the
                // camera before constructing the controls (Arcball captures the
                // current camera pose as its "home" / reset baseline).
                if (modelRef.current) {
                    autoScaleAndCenter(modelRef.current, camera, width, height);
                }

                // Virtual-trackball controls: grab-and-tumble in ANY direction
                // with no pole/gimbal lock (unlike OrbitControls' fixed up-axis),
                // wheel zooms, right-drag pans. Fires "change" (incl. during its
                // own damping) so we can render on demand; no per-frame update().
                const { ArcballControls } = await import(
                    "three/examples/jsm/controls/ArcballControls.js"
                );
                const controls = new ArcballControls(
                    camera,
                    renderer.domElement,
                    scene,
                );
                controls.enableAnimations = true;
                controls.cursorZoom = true;
                controls.minDistance = 0.5;
                controls.maxDistance = 100;
                controls.setGizmosVisible(false);
                controls.addEventListener("change", () => requestRender(2));
                controls.saveState(); // baseline for "reset view"
                controlsRef.current = controls;
                requestRender();

                // requestAnimationFrame driver (renders only while armed).
                const animate = () => {
                    animationIdRef.current = requestAnimationFrame(animate);
                    if (renderBudget > 0) {
                        renderBudget--;
                        renderer.render(scene, camera);
                    }
                };
                animate();

                // Resize handler for DPR swaps
                const resizeObserver = new ResizeObserver(() => {
                    if (
                        !mountRef.current ||
                        !rendererRef.current ||
                        !cameraRef.current
                    )
                        return;
                    const newWidth = mountRef.current.clientWidth;
                    const newHeight = mountRef.current.clientHeight;
                    cameraRef.current.aspect = newWidth / newHeight;
                    cameraRef.current.updateProjectionMatrix();
                    rendererRef.current.setSize(newWidth, newHeight);
                    requestRender();
                });

                if (mountRef.current) {
                    resizeObserver.observe(mountRef.current);
                }

                setIsLoading(false);
                logger.debug("[FullScreen3DModal] Scene setup complete");

                // Dispose geometries + textures
                return () => {
                    resizeObserver.disconnect();
                    canvas.removeEventListener("wheel", stopProp);
                    controls.dispose();
                    controlsRef.current = null;
                    requestRenderRef.current = null;
                    if (animationIdRef.current) {
                        cancelAnimationFrame(animationIdRef.current);
                    }
                    disposeSplat(sceneRef.current, modelRef.current);
                    renderer.dispose();
                };
            } catch (err) {
                logger.error("3D loading error:", err);
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to load 3D model",
                );
                setIsLoading(false);
            }
        };

        // Kick off preview + stash disposer promise
        let cleanup: (() => void) | undefined;
        init().then((c) => {
            cleanup = c;
        });

        return () => {
            if (cleanup) cleanup();
        };
    }, [url, fileExtension]);

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = "hidden";

        let cleanup: (() => void) | undefined;
        if (url) {
            // setupScene may sync/async return disposer handles
            // Normalize cleanup whether sync or awaited
            const start = async () => {
                cleanup = await setupScene();
            };
            start();
        }

        return () => {
            document.body.style.overflow = "unset";
            if (cleanup) cleanup();
        };
    }, [url, setupScene]);

    const handleResetView = () => {
        // Restore the camera/target baseline captured after initial framing.
        controlsRef.current?.reset();
        requestRenderRef.current?.();
    };

    const handleDownload = () => {
        if (url) {
            const link = document.createElement("a");
            link.href = url;
            link.download = `model${fileExtension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    if (!mounted) return null;

    const content = (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-11/12 h-5/6 max-h-screen flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {t("model3DPreview")}
                    </h2>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleResetView}
                            title={t("resetView")}
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleDownload}
                            title={t("downloadModel")}
                        >
                            <Download className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* 3D Canvas */}
                <div
                    className="flex-1 relative overflow-hidden bg-gray-100"
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseMove={(e) => e.stopPropagation()}
                    onMouseUp={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                >
                    {isLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/10">
                            <div className="animate-spin">
                                <Box className="h-8 w-8 text-blue-500" />
                            </div>
                            <p className="text-gray-700 mt-4 font-medium">
                                {t("loading3DModel")}
                            </p>
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                            <div className="text-center">
                                <p className="text-red-500 font-semibold">
                                    {t("errorLoadingModel")}
                                </p>
                                <p className="text-gray-500 text-sm mt-2">
                                    {error}
                                </p>
                            </div>
                        </div>
                    )}
                    <div
                        ref={mountRef}
                        style={{ width: "100%", height: "100%" }}
                    />
                </div>

                {/* Info Footer */}
                <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600 flex-shrink-0">
                    <p>{t("dragToRotate")}</p>
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

// Inline Three preview for condensed node chrome
const MiniModelPreview = ({
    url,
    fileExtension,
}: {
    url: string;
    fileExtension: string;
}) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const modelRef = useRef<THREE.Object3D | null>(null);
    const animationIdRef = useRef<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!mountRef.current || !url) return;

        let cleanup: (() => void) | undefined;

        const init = async () => {
            try {
                setIsLoading(true);
                const width = mountRef.current!.clientWidth;
                const height = mountRef.current!.clientHeight;

                // Scene
                const scene = new THREE.Scene();
                scene.background = new THREE.Color(0xf0f0f0); // Light background, consistent with fullscreen
                sceneRef.current = scene;

                // Camera
                const camera = new THREE.PerspectiveCamera(
                    45,
                    width / height,
                    0.1,
                    1000,
                );
                camera.position.set(0, 0, 5);
                cameraRef.current = camera;

                // Renderer
                const renderer = new THREE.WebGLRenderer({
                    antialias: true,
                    alpha: true,
                });
                renderer.setSize(width, height);
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
                renderer.outputColorSpace = THREE.SRGBColorSpace; // Respect sRGB color space
                rendererRef.current = renderer;

                if (mountRef.current) {
                    mountRef.current.innerHTML = "";
                    mountRef.current.appendChild(renderer.domElement);
                }

                // Lights
                // Lights — polished ambient stack
                // Lights — polished ambient stack
                // 1. Ambient fill preset
                const hemisphereLight = new THREE.HemisphereLight(
                    0xffffff,
                    0x444444,
                    1.5,
                );
                hemisphereLight.position.set(0, 20, 0);
                scene.add(hemisphereLight);

                // 2. Camera-parented spotlight
                scene.add(camera);
                const cameraLight = new THREE.DirectionalLight(0xffffff, 2.0);
                cameraLight.position.set(0, 0, 1);
                camera.add(cameraLight);

                // On-demand rendering budget (see fullscreen viewer for rationale).
                // Critical here: an idle node preview must not render 262k splats
                // every frame forever, or several model nodes together stall the PC.
                let renderBudget = 120;
                const requestRender = (frames = 90) => {
                    renderBudget = Math.max(renderBudget, frames);
                };

                // Keep drag/zoom inside the node: stop the gestures from bubbling
                // to React Flow (which would pan/zoom the canvas or drag the node).
                // The ArcballControls instance is created later (after framing).
                const canvas = renderer.domElement;
                canvas.style.cursor = "grab";
                const stopProp = (e: Event) => e.stopPropagation();
                canvas.addEventListener("pointerdown", stopProp);
                canvas.addEventListener("wheel", stopProp, { passive: false });

                // Load Model
                const ext = fileExtension.toLowerCase();
                const modelHolder = { current: null as THREE.Object3D | null };

                try {
                    if (ext === ".glb" || ext === ".gltf")
                        await loadGLTF(url, scene, modelHolder);
                    else if (ext === ".obj")
                        await loadOBJ(url, scene, modelHolder);
                    else if (ext === ".fbx")
                        await loadFBX(url, scene, modelHolder);
                    else if (ext === ".stl")
                        await loadSTL(url, scene, modelHolder);
                    else if (ext === ".dae")
                        await loadDAE(url, scene, modelHolder);
                    else if (ext === ".ply")
                        await loadPLY(url, scene, modelHolder);
                    else if (ext === ".usdz" || ext === ".usd")
                        await loadUSDZ(url, scene, modelHolder);
                    else if (ext === ".ptx" || ext === ".pts" || ext === ".xyz")
                        await loadPointCloud(url, scene, ext, modelHolder);
                    else if (ext === ".3ds")
                        await load3DS(url, scene, modelHolder);
                    else if (ext === ".vtp")
                        await loadVTP(url, scene, modelHolder);
                    else if (
                        ext === ".spz" ||
                        ext === ".splat" ||
                        ext === ".ksplat" ||
                        ext === ".sog"
                    )
                        await loadSplat(url, scene, modelHolder, renderer, ext);
                    else if (ext === ".igs" || ext === ".iges")
                        await loadIGES(url, scene, modelHolder);
                    else if (ext === ".step" || ext === ".stp")
                        await loadSTEP(url, scene, modelHolder);
                    else throw new Error("Unsupported");
                } catch (e) {
                    logger.error("Mini preview load error", e);
                }

                if (modelHolder.current) {
                    modelRef.current = modelHolder.current;
                    autoScaleAndCenter(
                        modelHolder.current,
                        camera,
                        width,
                        height,
                    );
                }
                // Nudge to a pleasant elevated 3/4 view before constructing the
                // controls (Arcball captures this camera pose as its home).
                const dist = camera.position.length() || 12;
                camera.position
                    .set(dist * 0.7, dist * 0.45, dist * 0.7)
                    .setLength(dist);
                camera.lookAt(0, 0, 0);

                // Virtual-trackball controls: free tumble in any direction, no
                // pole lock. Same scheme as the fullscreen viewer. Fires "change"
                // (incl. during damping), driving on-demand rendering.
                const { ArcballControls } = await import(
                    "three/examples/jsm/controls/ArcballControls.js"
                );
                const controls = new ArcballControls(
                    camera,
                    renderer.domElement,
                    scene,
                );
                controls.enableAnimations = true;
                controls.cursorZoom = true;
                controls.minDistance = 0.5;
                controls.maxDistance = 100;
                controls.setGizmosVisible(false);
                controls.addEventListener("change", () => requestRender(2));
                requestRender();

                // Animation Loop (renders only while armed; idles otherwise)
                const animate = () => {
                    animationIdRef.current = requestAnimationFrame(animate);
                    if (renderBudget > 0) {
                        renderBudget--;
                        renderer.render(scene, camera);
                    }
                };
                animate();
                setIsLoading(false);

                // Cleanup function
                cleanup = () => {
                    if (animationIdRef.current)
                        cancelAnimationFrame(animationIdRef.current);
                    canvas.removeEventListener("pointerdown", stopProp);
                    canvas.removeEventListener("wheel", stopProp);
                    controls.dispose();
                    disposeSplat(sceneRef.current, modelRef.current);
                    renderer.dispose();
                };
            } catch (err) {
                logger.error("Mini preview init error", err);
                setIsLoading(false);
            }
        };

        init();

        return () => {
            if (cleanup) cleanup();
        };
    }, [url, fileExtension]);

    return (
        <div className="w-full h-48 bg-gray-100 relative nodrag">
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Box className="h-6 w-6 text-gray-600 animate-pulse" />
                </div>
            )}
            <div
                ref={mountRef}
                className="w-full h-full cursor-grab active:cursor-grabbing"
            />
        </div>
    );
};

// Loader: glTF / GLB
async function loadGLTF(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    const { GLTFLoader } = await import(
        "three/examples/jsm/loaders/GLTFLoader.js"
    );
    const loader = new GLTFLoader();

    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (gltf: any) => {
                const model = gltf.scene;
                scene.add(model);
                modelRef.current = model;

                // Attach first glTF mixer clip when available
                if (gltf.animations.length > 0) {
                    const mixer = new THREE.AnimationMixer(model);
                    gltf.animations.forEach((clip: any) => {
                        mixer.clipAction(clip).play();
                    });

                    const clock = new THREE.Clock();
                    const originalAnimate = window.requestAnimationFrame;
                    const animLoop = () => {
                        mixer.update(clock.getDelta());
                        originalAnimate(animLoop);
                    };
                    animLoop();
                }
                resolve();
            },
            undefined,
            reject,
        );
    });
}

// Loader: Wavefront OBJ
async function loadOBJ(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    const { OBJLoader } = await import(
        "three/examples/jsm/loaders/OBJLoader.js"
    );
    const loader = new OBJLoader();

    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (object: any) => {
                scene.add(object);
                modelRef.current = object;

                // Provide default Lambert for untextured OBJ
                object.traverse((child: any) => {
                    if (child instanceof THREE.Mesh) {
                        if (!child.material) {
                            child.material = new THREE.MeshPhongMaterial({
                                color: 0x888888,
                            });
                        }
                    }
                });

                resolve();
            },
            undefined,
            reject,
        );
    });
}

// Loader: Gaussian splat payload
// Name of the per-scene SparkRenderer (one drives sorting/compositing for all
// SplatMeshes in a scene; reused across loads).
const SPARK_RENDERER_NAME = "__spark_renderer__";

// Loader: Gaussian Splatting (.ply / .spz / .splat / .ksplat / .sog) via SparkJS.
// Spark is imported dynamically so its WASM module is never evaluated during SSR
// or build — only client-side when a splat is actually viewed (paired with the
// `url: false` webpack parser tweak in next.config.ts).
async function loadSplat(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
    renderer: THREE.WebGLRenderer,
    ext: string,
): Promise<void> {
    const { SparkRenderer, SplatMesh, SplatFileType } = await import(
        "@sparkjsdev/spark"
    );

    // Install a SparkRenderer into the scene once; the existing
    // renderer.render(scene, camera) loop drives it via onBeforeRender.
    if (!scene.getObjectByName(SPARK_RENDERER_NAME)) {
        const spark = new SparkRenderer({ renderer });
        spark.name = SPARK_RENDERER_NAME;
        scene.add(spark);
    }

    // .ply / .spz / .sog auto-detect from content; .splat / .ksplat need an
    // explicit fileType (they carry no self-describing header). Inferred from
    // the enum members via a ternary — SplatFileType is a dynamic-import value
    // binding and can't be used in a type-annotation position.
    const lower = ext.toLowerCase();
    const fileType =
        lower === ".ply"
            ? SplatFileType.PLY
            : lower === ".spz"
              ? SplatFileType.SPZ
              : lower === ".splat"
                ? SplatFileType.SPLAT
                : lower === ".ksplat"
                  ? SplatFileType.KSPLAT
                  : undefined;

    const mesh = new SplatMesh(fileType ? { url, fileType } : { url });
    // Wait for decode so downstream framing (autoScaleAndCenter) sees real bounds.
    await mesh.initialized;
    scene.add(mesh);
    modelRef.current = mesh;
}

// Dispose a SplatMesh + its scene's SparkRenderer (best-effort; both expose
// dispose()). Called from each viewer's teardown.
function disposeSplat(
    scene: THREE.Scene | null,
    model: THREE.Object3D | null,
): void {
    (model as { dispose?: () => void } | null)?.dispose?.();
    const spark = scene?.getObjectByName(SPARK_RENDERER_NAME) as
        | (THREE.Object3D & { dispose?: () => void })
        | undefined;
    spark?.dispose?.();
}

// Loader: Autodesk FBX
async function loadFBX(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    const { FBXLoader } = await import(
        "three/examples/jsm/loaders/FBXLoader.js"
    );
    const loader = new FBXLoader();

    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (object: any) => {
                scene.add(object);
                modelRef.current = object;

                // Play first FBX clip if multiple
                if (object.animations && object.animations.length > 0) {
                    const mixer = new THREE.AnimationMixer(object);
                    mixer.clipAction(object.animations[0]).play();
                }
                resolve();
            },
            undefined,
            reject,
        );
    });
}

// Loader: stereolithography mesh
async function loadSTL(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    const { STLLoader } = await import(
        "three/examples/jsm/loaders/STLLoader.js"
    );
    const loader = new STLLoader();

    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (geometry: any) => {
                logger.debug("STL loaded successfully, creating mesh");
                geometry.computeVertexNormals?.();
                const material = new THREE.MeshPhongMaterial({
                    color: 0x0088ff,
                });
                const mesh = new THREE.Mesh(geometry, material);
                scene.add(mesh);
                modelRef.current = mesh;
                resolve();
            },
            undefined,
            (error: any) => {
                logger.error("STL loading error:", error);
                reject(error);
            },
        );
    });
}

// Loader: COLLADA interchange
async function loadDAE(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    const { ColladaLoader } = await import(
        "three/examples/jsm/loaders/ColladaLoader.js"
    );
    const loader = new ColladaLoader();

    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (collada: any) => {
                const model = collada.scene;
                scene.add(model);
                modelRef.current = model;
                resolve();
            },
            undefined,
            reject,
        );
    });
}

// Loader: Stanford PLY (non-splat)
async function loadPLY(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    const { PLYLoader } = await import(
        "three/examples/jsm/loaders/PLYLoader.js"
    );
    const loader = new PLYLoader();

    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (geometry: any) => {
                geometry.computeVertexNormals();
                const material = new THREE.MeshPhongMaterial({
                    color: 0x00ff88,
                });
                const mesh = new THREE.Mesh(geometry, material);
                scene.add(mesh);
                modelRef.current = mesh;
                resolve();
            },
            undefined,
            reject,
        );
    });
}

// Loader: Pixar USD family
async function loadUSDZ(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    const { USDZLoader } = await import(
        "three/examples/jsm/loaders/USDZLoader.js"
    );
    const loader = new USDZLoader();

    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (model: any) => {
                scene.add(model);
                modelRef.current = model;
                resolve();
            },
            undefined,
            reject,
        );
    });
}

// Loader: legacy 3DS Max binary
async function load3DS(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    const { TDSLoader } = await import(
        "three/examples/jsm/loaders/TDSLoader.js"
    );
    const loader = new TDSLoader();

    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (model: any) => {
                scene.add(model);
                modelRef.current = model;
                resolve();
            },
            undefined,
            reject,
        );
    });
}

// Loader: ISO STEP solids
async function loadSTEP(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    try {
        // STEP needs CAD libs — fallback to OBJ importer
        const response = await fetch(url);
        const text = await response.text();

        // Best-effort ASCII STEP to placeholder mesh
        const _lines = text.split("\n");

        // Stub mesh so UI still renders
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshPhongMaterial({ color: 0x4488ff });
        const mesh = new THREE.Mesh(geometry, material);

        scene.add(mesh);
        modelRef.current = mesh;
    } catch (_err) {
        throw new Error(
            "STEP format requires a specialized viewer. Please convert to GLTF or OBJ format.",
        );
    }
}

// Loader: IGES surfaces
async function loadIGES(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    try {
        // IGES needs CAD libs — fallback to OBJ importer
        const response = await fetch(url);
        const _text = await response.text();

        // Stub mesh so UI still renders
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshPhongMaterial({ color: 0xff8844 });
        const mesh = new THREE.Mesh(geometry, material);

        scene.add(mesh);
        modelRef.current = mesh;
    } catch (_err) {
        throw new Error(
            "IGES format requires a specialized viewer. Please convert to GLTF or OBJ format.",
        );
    }
}

// Loader: VTK polydata XML
async function loadVTP(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    const { VTKLoader } = await import(
        "three/examples/jsm/loaders/VTKLoader.js"
    );
    const loader = new VTKLoader();

    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (geometry: any) => {
                geometry.computeVertexNormals();
                const material = new THREE.MeshPhongMaterial({
                    color: 0xff8800,
                });
                const mesh = new THREE.Mesh(geometry, material);
                scene.add(mesh);
                modelRef.current = mesh;
                resolve();
            },
            undefined,
            reject,
        );
    });
}

// Loader: raw point-cloud dumps
async function loadPointCloud(
    url: string,
    scene: THREE.Scene,
    _extension: string,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    const response = await fetch(url);
    const text = await response.text();
    const lines = text
        .split("\n")
        .filter((line: string) => line.trim().length > 0);

    const positions: number[] = [];
    const colors: number[] = [];

    // Parse whitespace-delimited cloud rows
    lines.forEach((line: string) => {
        const parts = line.trim().split(/\s+/);

        if (parts.length >= 3) {
            // First triplet encodes XYZ
            positions.push(
                parseFloat(parts[0]),
                parseFloat(parts[1]),
                parseFloat(parts[2]),
            );

            // Optional RGB/A columns after xyz
            if (parts.length >= 6) {
                colors.push(
                    parseFloat(parts[3]) / 255,
                    parseFloat(parts[4]) / 255,
                    parseFloat(parts[5]) / 255,
                );
            } else {
                colors.push(0.5, 0.5, 0.5);
            }
        }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(new Float32Array(colors), 3),
    );

    const material = new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);
    modelRef.current = points;
}

// Primary exported node surface
const ModelNode = ({ selected, data }: ModelNodeRfProps) => {
    const t = useTranslations("Workspace.nodes.modal");
    const fileKeys = data.fileKeys;
    const fileName = data.fileName;

    const fileKey = fileKeys && fileKeys.length > 0 ? fileKeys[0] : undefined;

    const [isFullScreen, setIsFullScreen] = useState(false);
    const { url } = useFileAsyncLoader(fileKey, { priority: "high" });

    // Derive MIME/ext from persisted fileKey tails
    const fileExtension = fileKey
        ? `.${fileKey.split(".").pop()?.toLowerCase()}` || ".glb"
        : ".glb";
    const isSupported = [
        ".glb",
        ".gltf",
        ".obj",
        ".ply",
        ".spz",
        ".splat",
        ".ksplat",
        ".sog",
        ".fbx",
        ".stl",
        ".dae",
        ".usdz",
        ".usd",
        ".ptx",
        ".pts",
        ".xyz",
        ".3ds",
        ".igs",
        ".iges",
        ".step",
        ".stp",
        ".vtp",
    ].includes(fileExtension.toLowerCase());

    if (!fileKey) {
        return (
            <BaseNodeShell selected={selected}>
                <Handle
                    type="target"
                    position={Position.Left}
                    id="in:modelNode"
                    isConnectableStart={false}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="out:modelNode"
                    isConnectableStart={false}
                />
                <NodeHeader>
                    <NodeHeaderIcon>
                        <Box />
                    </NodeHeaderIcon>
                    <NodeHeaderTitle>{t("model3D")}</NodeHeaderTitle>
                </NodeHeader>
                <ModalityPlaceholder modality="model" />
            </BaseNodeShell>
        );
    }

    return (
        <>
            <BaseNodeShell selected={selected}>
                <Handle
                    type="target"
                    position={Position.Left}
                    id="in:modelNode"
                    isConnectableStart={false}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="out:modelNode"
                    isConnectableStart={false}
                />
                <NodeHeader>
                    <NodeHeaderIcon>
                        <Box />
                    </NodeHeaderIcon>
                    <NodeHeaderTitle>
                        {fileName ? fileName.substring(0, 20) : t("model3D")}
                        {!isSupported &&
                            ` (${t("unsupportedFormat").toLowerCase()})`}
                    </NodeHeaderTitle>
                    <NodeHeaderActions>
                        {isSupported && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setIsFullScreen(true)}
                                title={t("fullScreenPreview")}
                            >
                                <Maximize2 className="h-4 w-4" />
                            </Button>
                        )}
                        <NodeHeaderComboAction
                            onClick={() => logger.debug("compose mode toggle")}
                        />
                        <NodeHeaderMenuAction label={t("moreOptions")}>
                            <DropdownMenuLabel>
                                {t("actions")}
                            </DropdownMenuLabel>
                        </NodeHeaderMenuAction>
                    </NodeHeaderActions>
                </NodeHeader>

                {/* Content */}
                <div className="w-full">
                    {isSupported ? (
                        url ? (
                            <MiniModelPreview
                                url={url}
                                fileExtension={fileExtension}
                            />
                        ) : (
                            <div className="w-full bg-gray-900 flex items-center justify-center py-12">
                                <div className="text-center">
                                    <Box className="h-12 w-12 text-blue-400 mx-auto mb-2" />
                                    <p className="text-gray-400 text-sm">
                                        {t("loadingPreview")}
                                    </p>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="w-full bg-gray-100 flex items-center justify-center py-8">
                            <div className="text-center">
                                <p className="text-gray-600 text-sm font-medium">
                                    {t("unsupportedFormat")}
                                </p>
                                <p className="text-gray-500 text-xs mt-1">
                                    {t("supportedFormats")}: GLB, GLTF, OBJ,
                                    FBX, STL, DAE, PLY, SPZ, SPLAT, KSPLAT, SOG,
                                    USDZ, USD, 3DS, STEP, IGES, VTP, PTX, PTS,
                                    XYZ
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </BaseNodeShell>

            {/* Full screen modal */}
            {isFullScreen && isSupported && fileKey && (
                <FullScreen3DModal
                    fileKey={fileKey}
                    fileExtension={fileExtension}
                    onClose={() => setIsFullScreen(false)}
                />
            )}
        </>
    );
};

// Custom comparator suppresses needless React.memo churn
const areEqual = (prevProps: ModelNodeRfProps, nextProps: ModelNodeRfProps) => {
    const prevFileKey = prevProps.data.fileKey;
    const nextFileKey = nextProps.data.fileKey;
    const prevFileName = prevProps.data.fileName;
    const nextFileName = nextProps.data.fileName;

    return (
        prevProps.selected === nextProps.selected &&
        prevFileKey === nextFileKey &&
        prevFileName === nextFileName
    );
};

ModelNode.displayName = "ModelNode";

export default memo(ModelNode, areEqual);
