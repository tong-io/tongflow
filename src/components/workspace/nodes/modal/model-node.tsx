"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, useRef, useState, useEffect, useCallback } from "react";
import { Box, Maximize2, X, Download, RotateCcw } from "lucide-react";
import { createPortal } from "react-dom";
import * as THREE from "three";

import { BaseNode } from "../base/base-node";
import {
    NodeHeader,
    NodeHeaderActions,
    NodeHeaderIcon,
    NodeHeaderMenuAction,
    NodeHeaderTitle,
    NodeHeaderComboAction,
} from "../base/node-header";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useR2AsyncLoader } from "@/hooks/use-r2-async-loader";
import { useTranslations } from "next-intl";

// 动态导入Spark（因为它需要browser环境）
// 注意：因为Spark的WASM依赖导致Next.js构建问题，暂时移除
// 可以通过CDN的方式在生产环境中单独加载
let SplatMesh: any = null;

// 初始化Spark - 暂时禁用
async function initSparkIfNeeded() {
    // Spark WASM module disabled due to Next.js webpack compatibility issues
    // 在生产环境中，可以使用CDN版本或单独的加载方式
    console.info("Gaussian Splatting support requires separate CDN loading");
}

// 自动调整相机以适应模型
const fitCameraToSelection = (
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

// 简单的自动缩放和居中
const autoScaleAndCenter = (
    model: THREE.Object3D,
    camera: THREE.PerspectiveCamera,
    containerWidth: number,
    containerHeight: number,
) => {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // 居中模型
    model.position.x += model.position.x - center.x;
    model.position.y += model.position.y - center.y;
    model.position.z += model.position.z - center.z;

    // 归一化模型大小 - 确保模型大小适中，以便灯光效果一致
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 8; // 将模型缩放到约8个单位大小
    if (maxDim > 0) {
        const scale = targetSize / maxDim;
        model.scale.multiplyScalar(scale);
    }

    // 调整相机位置
    // 使用targetSize计算相机距离
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(targetSize / 2 / Math.tan(fov / 2));

    // 增加一点边距
    cameraZ *= 1.5;

    camera.position.set(0, 0, cameraZ);
    camera.lookAt(0, 0, 0);

    // 更新相机投影矩阵
    camera.aspect = containerWidth / containerHeight;
    camera.updateProjectionMatrix();
};

// 全屏3D预览Modal
const FullScreen3DModal = ({
    fileKey,
    fileExtension,
    onClose,
}: {
    fileKey: string;
    fileExtension: string;
    onClose: () => void;
}) => {
    const [mounted, setMounted] = useState(false);
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const modelRef = useRef<THREE.Object3D | null>(null);
    const animationIdRef = useRef<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { url } = useR2AsyncLoader(fileKey, { priority: "high" });

    const setupScene = useCallback(() => {
        if (!mountRef.current || !url) return;

        // 返回一个cleanup函数
        const init = async () => {
            try {
                setIsLoading(true);
                setError(null);

                console.log(
                    "[FullScreen3DModal] Starting scene setup with URL:",
                    url,
                    "Extension:",
                    fileExtension,
                );
                const scene = new THREE.Scene();
                scene.background = new THREE.Color(0xf0f0f0); // 使用浅灰色背景，避免白屏看起来像没加载
                sceneRef.current = scene;

                // 相机设置
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

                // 渲染器设置
                const renderer = new THREE.WebGLRenderer({
                    antialias: true,
                    alpha: true,
                });
                renderer.setSize(width, height);
                renderer.setPixelRatio(window.devicePixelRatio);
                renderer.outputColorSpace = THREE.SRGBColorSpace; // 确保颜色显示正确
                rendererRef.current = renderer;

                // 清空容器并添加渲染器
                if (mountRef.current) {
                    mountRef.current.innerHTML = "";
                    mountRef.current.appendChild(renderer.domElement);
                }

                // 灯光设置
                // 灯光设置 - 优化后的自然光照
                // 灯光设置 - 优化后的自然光照
                // 1. 环境光 - 使用半球光模拟天空和地面的自然光照
                const hemisphereLight = new THREE.HemisphereLight(
                    0xffffff,
                    0x444444,
                    1.5,
                );
                hemisphereLight.position.set(0, 20, 0);
                scene.add(hemisphereLight);

                // 2. 跟随相机的光源 (Headlamp) - 确保视角处总是亮的
                // 必须将相机添加到场景中，子对象(灯光)才能生效
                scene.add(camera);
                const cameraLight = new THREE.DirectionalLight(0xffffff, 2.5);
                cameraLight.position.set(0, 0, 1); // 沿着相机视线方向
                camera.add(cameraLight);

                // 3. 补光 - 稍微增加一点侧后方的光，增加立体感
                const backLight = new THREE.DirectionalLight(0xffffff, 1.0);
                backLight.position.set(0, 5, -5);
                scene.add(backLight);

                // 旋转控制变量
                let isDragging = false;
                let previousMousePosition = { x: 0, y: 0 };
                const rotation = { x: 0, y: 0 };
                let targetRotation = { x: 0, y: 0 };

                // 事件处理器
                const pointerdownHandler = (e: any) => {
                    // 确保点击的是canvas
                    if (e.target !== renderer.domElement) return;
                    e.stopPropagation();
                    e.preventDefault();
                    isDragging = true;
                    previousMousePosition = { x: e.clientX, y: e.clientY };
                };

                const pointermoveHandler = (e: any) => {
                    if (!isDragging || !modelRef.current) return;
                    e.stopPropagation();
                    e.preventDefault();

                    const deltaX = e.clientX - previousMousePosition.x;
                    const deltaY = e.clientY - previousMousePosition.y;

                    targetRotation.y += deltaX * 0.01;
                    targetRotation.x += deltaY * 0.01;
                    // 限制垂直旋转角度
                    targetRotation.x = Math.max(
                        -Math.PI / 2,
                        Math.min(Math.PI / 2, targetRotation.x),
                    );

                    previousMousePosition = { x: e.clientX, y: e.clientY };
                };

                const pointerupHandler = (e: any) => {
                    e.stopPropagation();
                    isDragging = false;
                };

                const pointerleaveHandler = (e: any) => {
                    e.stopPropagation();
                    isDragging = false;
                };

                const wheelHandler = (e: any) => {
                    if (e.target !== renderer.domElement) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const scrollDelta = e.deltaY > 0 ? 1.1 : 0.9;
                    camera.position.multiplyScalar(scrollDelta);
                    // 限制缩放范围
                    const distance = camera.position.length();
                    if (distance < 1) camera.position.setLength(1);
                    if (distance > 100) camera.position.setLength(100);
                };

                // 添加事件监听器
                const canvas = renderer.domElement;
                canvas.addEventListener(
                    "pointerdown",
                    pointerdownHandler,
                    true,
                );
                window.addEventListener(
                    "pointermove",
                    pointermoveHandler,
                    true,
                ); // 监听window以获得更流畅的拖动
                window.addEventListener("pointerup", pointerupHandler, true);
                canvas.addEventListener(
                    "pointerleave",
                    pointerleaveHandler,
                    true,
                );
                canvas.addEventListener("wheel", wheelHandler, {
                    passive: false,
                });

                // 加载模型
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
                        await loadSplat(url, scene, modelRef);
                    } else if (extension === ".fbx") {
                        await loadFBX(url, scene, modelRef);
                    } else if (extension === ".stl") {
                        await loadSTL(url, scene, modelRef);
                    } else if (extension === ".dae") {
                        await loadDAE(url, scene, modelRef);
                    } else if (extension === ".ply") {
                        await loadPLY(url, scene, modelRef);
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
                    console.error("Failed to load model:", loadErr);
                    throw loadErr;
                }

                // 自动缩放模型
                if (modelRef.current) {
                    autoScaleAndCenter(modelRef.current, camera, width, height);

                    // 初始化旋转目标为当前旋转
                    targetRotation.x = modelRef.current.rotation.x;
                    targetRotation.y = modelRef.current.rotation.y;
                }

                // 动画循环
                const animate = () => {
                    animationIdRef.current = requestAnimationFrame(animate);

                    if (modelRef.current) {
                        const easing = 0.1;
                        rotation.x += (targetRotation.x - rotation.x) * easing;
                        rotation.y += (targetRotation.y - rotation.y) * easing;

                        modelRef.current.rotation.x = rotation.x;
                        modelRef.current.rotation.y = rotation.y;
                    }

                    renderer.render(scene, camera);
                };
                animate();

                // 处理窗口大小变化
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
                });

                if (mountRef.current) {
                    resizeObserver.observe(mountRef.current);
                }

                setIsLoading(false);
                console.log("[FullScreen3DModal] Scene setup complete");

                // 返回cleanup函数
                return () => {
                    resizeObserver.disconnect();
                    window.removeEventListener(
                        "pointermove",
                        pointermoveHandler,
                        true,
                    );
                    window.removeEventListener(
                        "pointerup",
                        pointerupHandler,
                        true,
                    );
                    if (canvas) {
                        canvas.removeEventListener(
                            "pointerdown",
                            pointerdownHandler,
                            true,
                        );
                        canvas.removeEventListener(
                            "pointerleave",
                            pointerleaveHandler,
                            true,
                        );
                        canvas.removeEventListener("wheel", wheelHandler);
                    }

                    if (animationIdRef.current) {
                        cancelAnimationFrame(animationIdRef.current);
                    }
                    renderer.dispose();
                };
            } catch (err) {
                console.error("3D loading error:", err);
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to load 3D model",
                );
                setIsLoading(false);
            }
        };

        // 执行初始化并保存cleanup函数
        let cleanup: (() => void) | undefined;
        init().then((c) => (cleanup = c));

        return () => {
            if (cleanup) cleanup();
        };
    }, [url, fileExtension]);

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = "hidden";

        let cleanup: (() => void) | undefined;
        if (url) {
            // setupScene现在返回一个cleanup函数（或者是Promise<cleanup>）
            // 我们需要正确处理它
            const start = async () => {
                // @ts-ignore
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
        if (modelRef.current && cameraRef.current && mountRef.current) {
            autoScaleAndCenter(
                modelRef.current,
                cameraRef.current,
                mountRef.current.clientWidth,
                mountRef.current.clientHeight,
            );
            if (modelRef.current) {
                modelRef.current.rotation.set(0, 0, 0);
            }
        }
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
                        3D Model Preview
                    </h2>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleResetView}
                            title="Reset view"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleDownload}
                            title="Download model"
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
                                Loading 3D model...
                            </p>
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                            <div className="text-center">
                                <p className="text-red-500 font-semibold">
                                    Error loading model
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
                    <p>
                        Left Click + Drag to Rotate | Scroll to Zoom | Click
                        Reset to Center
                    </p>
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

// 小型的交互式预览组件，用于节点内部
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
                renderer.outputColorSpace = THREE.SRGBColorSpace; // 确保颜色显示正确
                rendererRef.current = renderer;

                if (mountRef.current) {
                    mountRef.current.innerHTML = "";
                    mountRef.current.appendChild(renderer.domElement);
                }

                // Lights
                // Lights - 优化后的自然光照
                // Lights - 优化后的自然光照
                // 1. 环境光
                const hemisphereLight = new THREE.HemisphereLight(
                    0xffffff,
                    0x444444,
                    1.5,
                );
                hemisphereLight.position.set(0, 20, 0);
                scene.add(hemisphereLight);

                // 2. 跟随相机的光源
                scene.add(camera);
                const cameraLight = new THREE.DirectionalLight(0xffffff, 2.0);
                cameraLight.position.set(0, 0, 1);
                camera.add(cameraLight);

                // Interaction state
                let isDragging = false;
                let previousMousePosition = { x: 0, y: 0 };
                const rotation = { x: 0, y: 0 };
                let targetRotation = { x: 0, y: 0 };

                // Event Handlers
                const onPointerDown = (e: PointerEvent) => {
                    if (e.target !== renderer.domElement) return;
                    // CRITICAL: Stop propagation to prevent React Flow from dragging the node
                    e.stopPropagation();
                    e.preventDefault();
                    isDragging = true;
                    previousMousePosition = { x: e.clientX, y: e.clientY };
                    (renderer.domElement as HTMLElement).style.cursor =
                        "grabbing";
                };

                const onPointerMove = (e: PointerEvent) => {
                    if (!isDragging) return;
                    e.stopPropagation();
                    e.preventDefault();

                    const deltaX = e.clientX - previousMousePosition.x;
                    const deltaY = e.clientY - previousMousePosition.y;

                    targetRotation.y += deltaX * 0.01;
                    targetRotation.x += deltaY * 0.01;
                    targetRotation.x = Math.max(
                        -Math.PI / 2,
                        Math.min(Math.PI / 2, targetRotation.x),
                    );

                    previousMousePosition = { x: e.clientX, y: e.clientY };
                };

                const onPointerUp = (e: PointerEvent) => {
                    if (isDragging) {
                        e.stopPropagation();
                        isDragging = false;
                        (renderer.domElement as HTMLElement).style.cursor =
                            "grab";
                    }
                };

                const onWheel = (e: WheelEvent) => {
                    if (e.target !== renderer.domElement) return;
                    // Prevent zooming the flow canvas
                    e.stopPropagation();
                    // Optional: Implement zoom for mini preview if needed, but might be too cluttered
                    // For now, just stop propagation
                };

                // Attach events
                const canvas = renderer.domElement;
                canvas.style.cursor = "grab";
                canvas.addEventListener("pointerdown", onPointerDown);
                window.addEventListener("pointermove", onPointerMove); // Window for smooth drag outside
                window.addEventListener("pointerup", onPointerUp);
                canvas.addEventListener("wheel", onWheel, { passive: false });

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
                        await loadSplat(url, scene, modelHolder);
                    else if (ext === ".igs" || ext === ".iges")
                        await loadIGES(url, scene, modelHolder);
                    else if (ext === ".step" || ext === ".stp")
                        await loadSTEP(url, scene, modelHolder);
                    else throw new Error("Unsupported");
                } catch (e) {
                    console.error("Mini preview load error", e);
                }

                if (modelHolder.current) {
                    modelRef.current = modelHolder.current;
                    autoScaleAndCenter(
                        modelHolder.current,
                        camera,
                        width,
                        height,
                    );

                    // Initial nice angle
                    targetRotation.x = -0.2;
                    targetRotation.y = 0.5;
                    rotation.x = -0.2;
                    rotation.y = 0.5;
                    modelHolder.current.rotation.x = rotation.x;
                    modelHolder.current.rotation.y = rotation.y;
                }

                // Animation Loop
                const animate = () => {
                    animationIdRef.current = requestAnimationFrame(animate);

                    if (modelRef.current) {
                        const easing = 0.1;
                        rotation.x += (targetRotation.x - rotation.x) * easing;
                        rotation.y += (targetRotation.y - rotation.y) * easing;
                        modelRef.current.rotation.x = rotation.x;
                        modelRef.current.rotation.y = rotation.y;
                    }
                    renderer.render(scene, camera);
                };
                animate();
                setIsLoading(false);

                // Cleanup function
                cleanup = () => {
                    if (animationIdRef.current)
                        cancelAnimationFrame(animationIdRef.current);
                    canvas.removeEventListener("pointerdown", onPointerDown);
                    window.removeEventListener("pointermove", onPointerMove);
                    window.removeEventListener("pointerup", onPointerUp);
                    canvas.removeEventListener("wheel", onWheel);
                    renderer.dispose();
                };
            } catch (err) {
                console.error("Mini preview init error", err);
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

// 加载GLTF/GLB文件
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

                // 播放动画如果存在
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

// 加载OBJ文件
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

                // 为OBJ对象添加基础材质
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

// 加载高斯泼溅文件
async function loadSplat(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    // Gaussian Splatting support is temporarily disabled due to WASM compatibility issues
    // Create a placeholder geometry to show in the scene
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshPhongMaterial({
        color: 0x64b5f6,
        emissive: 0x2196f3,
        shininess: 100,
    });
    const mesh = new THREE.Mesh(geometry, material);

    scene.add(mesh);
    modelRef.current = mesh;

    console.info(
        "Gaussian Splatting (.splat, .spz) files require separate CDN loading. Showing placeholder.",
    );
}

// 加载FBX文件
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

                // 播放第一个动画
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

// 加载STL文件
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
                console.log("STL loaded successfully, creating mesh");
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
                console.error("STL loading error:", error);
                reject(error);
            },
        );
    });
}

// 加载DAE (Collada)文件
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

// 加载PLY文件（独立于Splat格式）
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

// 加载USDZ/USD文件
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

// 加载3DS文件
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

// 加载STEP文件（CAD格式）
async function loadSTEP(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    try {
        // STEP格式需要专门的库，这里作为fallback使用OBJ格式
        const response = await fetch(url);
        const text = await response.text();

        // 尝试作为纯文本解析并创建简单的网格
        const lines = text.split("\n");

        // 创建一个简单的占位符网格
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshPhongMaterial({ color: 0x4488ff });
        const mesh = new THREE.Mesh(geometry, material);

        scene.add(mesh);
        modelRef.current = mesh;
    } catch (err) {
        throw new Error(
            "STEP format requires a specialized viewer. Please convert to GLTF or OBJ format.",
        );
    }
}

// 加载IGES文件（CAD格式）
async function loadIGES(
    url: string,
    scene: THREE.Scene,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    try {
        // IGES格式需要专门的库，这里作为fallback使用OBJ格式
        const response = await fetch(url);
        const text = await response.text();

        // 创建一个简单的占位符网格
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshPhongMaterial({ color: 0xff8844 });
        const mesh = new THREE.Mesh(geometry, material);

        scene.add(mesh);
        modelRef.current = mesh;
    } catch (err) {
        throw new Error(
            "IGES format requires a specialized viewer. Please convert to GLTF or OBJ format.",
        );
    }
}

// 加载VTP文件（VTK多边形格式）
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

// 加载点云文件 (PTX, PTS, XYZ)
async function loadPointCloud(
    url: string,
    scene: THREE.Scene,
    extension: string,
    modelRef: React.MutableRefObject<THREE.Object3D | null>,
): Promise<void> {
    return new Promise(async (resolve, reject) => {
        try {
            const response = await fetch(url);
            const text = await response.text();
            const lines = text
                .split("\n")
                .filter((line: string) => line.trim().length > 0);

            const positions: number[] = [];
            const colors: number[] = [];

            // 解析点云数据
            lines.forEach((line: string) => {
                const parts = line.trim().split(/\s+/);

                if (parts.length >= 3) {
                    // 前3个数字是坐标
                    positions.push(
                        parseFloat(parts[0]),
                        parseFloat(parts[1]),
                        parseFloat(parts[2]),
                    );

                    // 如果有颜色信息（RGB或RGBA）
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
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

// 主节点组件
const ModelNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes.modal");
    const { fileKeys, fileName } = (data as {
        fileKeys?: string[];
        fileName?: string;
    }) || {
        fileKeys: undefined,
        fileName: undefined,
    };

    const fileKey = fileKeys && fileKeys.length > 0 ? fileKeys[0] : undefined;

    const [isFullScreen, setIsFullScreen] = useState(false);
    const { url } = useR2AsyncLoader(fileKey, { priority: "high" });

    // 提取文件扩展名 - 从 fileKey 中提取（fileKey 本身包含扩展名）
    const fileExtension = fileKey
        ? "." + fileKey.split(".").pop()?.toLowerCase() || ".glb"
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
            <BaseNode selected={selected}>
                <NodeHeader>
                    <NodeHeaderIcon>
                        <Box />
                    </NodeHeaderIcon>
                    <NodeHeaderTitle>{t("model3D")}</NodeHeaderTitle>
                </NodeHeader>
                <div className="w-full bg-gray-100 flex items-center justify-center py-8">
                    <p className="text-gray-500 text-sm">
                        {t("noModelLoaded")}
                    </p>
                </div>
                <Handle
                    type="target"
                    position={Position.Left}
                    id="a"
                    isConnectable={true}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="b"
                    isConnectable={true}
                />
            </BaseNode>
        );
    }

    return (
        <>
            <BaseNode selected={selected}>
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
                            onClick={() => console.log("组合模式切换")}
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

                <Handle
                    type="target"
                    position={Position.Left}
                    id="a"
                    isConnectable={true}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="b"
                    isConnectable={true}
                />
            </BaseNode>

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

// 自定义比较函数防止不必要的重新渲染
const areEqual = (prevProps: NodeProps, nextProps: NodeProps) => {
    const prevFileKey = (prevProps.data as { fileKey?: string })?.fileKey;
    const nextFileKey = (nextProps.data as { fileKey?: string })?.fileKey;
    const prevFileName = (prevProps.data as { fileName?: string })?.fileName;
    const nextFileName = (nextProps.data as { fileName?: string })?.fileName;

    return (
        prevProps.selected === nextProps.selected &&
        prevFileKey === nextFileKey &&
        prevFileName === nextFileName
    );
};

ModelNode.displayName = "ModelNode";

export default memo(ModelNode, areEqual);
