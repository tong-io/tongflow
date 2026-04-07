"use client";

/**
 * DEBUG VERSION - 用于诊断事件传播问题
 * 添加了详细的控制台日志来追踪事件流
 */

import { useRef, useEffect } from "react";
import * as THREE from "three";

export function DebugModelNode() {
    const mountRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!mountRef.current) return;

        // 创建canvas
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 400;
        canvasRef.current = canvas;

        // 创建Three.js场景
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(400, 400);
        renderer.setClearColor(0xffffff);
        mountRef.current.appendChild(canvas);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        camera.position.z = 5;

        // 创建立方体
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        // 灯光
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(5, 5, 5);
        scene.add(light);

        // 旋转控制
        let isDragging = false;
        let rotation = { x: 0, y: 0 };
        let targetRotation = { x: 0, y: 0 };
        let previousMousePosition = { x: 0, y: 0 };

        const logEvent = (eventName: string, phase: string, e: any) => {
            console.log(`[${eventName}] ${phase}:`, {
                bubbles: e.bubbles,
                cancelable: e.cancelable,
                composed: e.composed,
                isPropagationStopped: e.isPropagationStopped?.(),
                defaultPrevented: e.defaultPrevented,
                clientX: e.clientX,
                clientY: e.clientY,
            });
        };

        // 方法1: 使用addEventListener + stopPropagation（当前方法）
        canvas.addEventListener(
            "mousedown",
            (e: any) => {
                logEvent("mousedown", "before stopPropagation", e);
                e.stopPropagation();
                e.preventDefault();
                logEvent("mousedown", "after stopPropagation", e);
                isDragging = true;
                previousMousePosition = { x: e.clientX, y: e.clientY };
            },
            false, // useCapture: false
        );

        canvas.addEventListener(
            "mousemove",
            (e: any) => {
                if (!isDragging) return;
                logEvent("mousemove", "during drag", e);
                e.stopPropagation();
                e.preventDefault();

                const deltaX = e.clientX - previousMousePosition.x;
                const deltaY = e.clientY - previousMousePosition.y;

                targetRotation.y += deltaX * 0.01;
                targetRotation.x += deltaY * 0.01;

                previousMousePosition = { x: e.clientX, y: e.clientY };
            },
            false,
        );

        canvas.addEventListener("mouseup", (e: any) => {
            logEvent("mouseup", "before stop", e);
            e.stopPropagation();
            isDragging = false;
        });

        canvas.addEventListener("mouseleave", (e: any) => {
            logEvent("mouseleave", "before stop", e);
            e.stopPropagation();
            isDragging = false;
        });

        // 也在document上监听看看事件是否真的被阻止了
        const documentMousedown = (e: any) => {
            console.log("[DOCUMENT] mousedown - 事件到达了document!", {
                target: e.target,
                composedPath: e
                    .composedPath()
                    .map((el: any) => el.tagName || el.constructor.name),
            });
        };

        const documentMousemove = (e: any) => {
            if (isDragging) {
                console.log(
                    "[DOCUMENT] mousemove during drag - 事件到达了document!",
                );
            }
        };

        document.addEventListener("mousedown", documentMousedown);
        document.addEventListener("mousemove", documentMousemove);

        // 动画循环
        const animate = () => {
            requestAnimationFrame(animate);

            // 平滑旋转
            rotation.x += (targetRotation.x - rotation.x) * 0.1;
            rotation.y += (targetRotation.y - rotation.y) * 0.1;

            cube.rotation.x = rotation.x;
            cube.rotation.y = rotation.y;

            renderer.render(scene, camera);
        };
        animate();

        // 清理
        return () => {
            document.removeEventListener("mousedown", documentMousedown);
            document.removeEventListener("mousemove", documentMousemove);
            renderer.dispose();
        };
    }, []);

    return (
        <div
            style={{
                padding: "20px",
                border: "2px solid red",
                backgroundColor: "#f0f0f0",
            }}
        >
            <h2>Debug: 3D Canvas Event Propagation Test</h2>
            <p style={{ color: "#666", fontSize: "12px" }}>
                打开浏览器控制台查看事件日志。拖动绿色立方体观察事件流。
            </p>
            <div
                ref={mountRef}
                style={{
                    border: "2px solid blue",
                    marginTop: "10px",
                    background: "white",
                }}
            />
            <div
                style={{
                    marginTop: "10px",
                    fontSize: "12px",
                    color: "#666",
                    padding: "10px",
                    backgroundColor: "#f9f9f9",
                    border: "1px solid #ddd",
                }}
            >
                <p>
                    预期行为:
                    拖动时只看到canvas的mousedown/mousemove/mouseup日志
                </p>
                <p>实际问题: 如果看到[DOCUMENT]日志，说明事件没有被正确阻止</p>
            </div>
        </div>
    );
}
