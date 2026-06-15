"use client";

import type React from "react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface WhiteBoardRef {
    clear: () => void;
    getDataURL: () => string | null;
}

interface WhiteBoardProps {
    onChange: (dataUrl?: string) => void;
}

const WhiteBoard = forwardRef<WhiteBoardRef, WhiteBoardProps>(
    ({ onChange }, ref) => {
        const canvasRef = useRef<HTMLCanvasElement>(null);
        const isDrawing = useRef(false);
        const lastX = useRef(0);
        const lastY = useRef(0);

        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            // Set canvas size and DPI
            const rect = canvas.parentElement?.getBoundingClientRect();
            if (rect) {
                canvas.width = rect.width;
                canvas.height = rect.height;
            } else {
                canvas.width = 800;
                canvas.height = 300;
            }

            // Fill with white background
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }, []);

        const getCanvasDataUrl = () => {
            return canvasRef.current?.toDataURL("image/png") || null;
        };

        const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
            e.stopPropagation();
            isDrawing.current = true;
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                lastX.current = e.clientX - rect.left;
                lastY.current = e.clientY - rect.top;
            }
        };

        const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
            e.stopPropagation();
            if (!isDrawing.current || !canvasRef.current) return;

            const ctx = canvasRef.current.getContext("2d");
            if (!ctx) return;

            const rect = canvasRef.current.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;

            ctx.strokeStyle = "#000";
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(lastX.current, lastY.current);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();

            lastX.current = currentX;
            lastY.current = currentY;

            onChange(getCanvasDataUrl() || undefined);
        };

        const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
            e.stopPropagation();
            isDrawing.current = false;
        };

        const handleMouseLeave = () => {
            isDrawing.current = false;
        };

        const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
            e.stopPropagation();
            if (e.touches.length !== 1) return;
            isDrawing.current = true;
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                lastX.current = e.touches[0].clientX - rect.left;
                lastY.current = e.touches[0].clientY - rect.top;
            }
        };

        const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
            e.stopPropagation();
            if (
                !isDrawing.current ||
                !canvasRef.current ||
                e.touches.length !== 1
            )
                return;

            const ctx = canvasRef.current.getContext("2d");
            if (!ctx) return;

            const rect = canvasRef.current.getBoundingClientRect();
            const currentX = e.touches[0].clientX - rect.left;
            const currentY = e.touches[0].clientY - rect.top;

            ctx.strokeStyle = "#000";
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(lastX.current, lastY.current);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();

            lastX.current = currentX;
            lastY.current = currentY;

            onChange(getCanvasDataUrl() || undefined);
        };

        const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
            e.stopPropagation();
            isDrawing.current = false;
        };

        useImperativeHandle(ref, () => ({
            clear: () => {
                if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext("2d");
                    if (ctx) {
                        ctx.fillStyle = "white";
                        ctx.fillRect(
                            0,
                            0,
                            canvasRef.current.width,
                            canvasRef.current.height,
                        );
                        onChange(undefined);
                    }
                }
            },
            getDataURL: getCanvasDataUrl,
        }));

        return (
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="w-full h-full bg-white cursor-crosshair"
                style={{ display: "block", pointerEvents: "auto" }}
            />
        );
    },
);

WhiteBoard.displayName = "WhiteBoard";

export { WhiteBoard };
