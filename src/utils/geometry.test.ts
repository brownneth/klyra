import { describe, it, expect } from 'vitest';
import { clamp, screenToCanvas, getBoundingBox, calculateSnaps } from './geometry';
import type { BoundingBox } from './geometry';
import type { ImageNodeData } from './db';

describe('geometry math', () => {
    describe('clamp', () => {
        it('should clamp values to min', () => {
            expect(clamp(0, 1, 5)).toBe(1);
        });

        it('should clamp values to max', () => {
            expect(clamp(10, 1, 5)).toBe(5);
        });

        it('should return value if within range', () => {
            expect(clamp(3, 1, 5)).toBe(3);
        });
    });

    describe('screenToCanvas', () => {
        it('should convert screen coordinates to canvas coordinates', () => {
            const camera = { x: 100, y: 100, z: 2 };
            const result = screenToCanvas(200, 300, camera);
            expect(result.x).toBe(50); // (200 - 100) / 2
            expect(result.y).toBe(100); // (300 - 100) / 2
        });
    });

    describe('getBoundingBox', () => {
        const mockImages = [
            { id: '1', x: 0, y: 0, w: 100, h: 100 } as ImageNodeData,
            { id: '2', x: 50, y: 50, w: 100, h: 100 } as ImageNodeData,
            { id: '3', x: -50, y: -50, w: 50, h: 50 } as ImageNodeData
        ];

        it('should return null if no images found', () => {
            expect(getBoundingBox(['4'], mockImages)).toBeNull();
        });

        it('should calculate precise bounding box for multiple nodes', () => {
            const box = getBoundingBox(['1', '2'], mockImages);
            expect(box).not.toBeNull();
            expect(box?.left).toBe(0);
            expect(box?.top).toBe(0);
            expect(box?.right).toBe(150); // 50 + 100
            expect(box?.bottom).toBe(150);
            expect(box?.w).toBe(150);
            expect(box?.h).toBe(150);
        });
    });

    describe('calculateSnaps', () => {
        const dragBox: BoundingBox = {
            left: 100, top: 100, right: 200, bottom: 200,
            centerX: 150, centerY: 150, w: 100, h: 100
        };

        const unselected: ImageNodeData[] = [
            { id: 't1', x: 0, y: 0, w: 90, h: 100 } as ImageNodeData // right edge is 90
        ];

        it('should detect snap on X axis when within threshold', () => {
            // Threshold is 8 / 1 = 8.
            // Drag left is 100.
            // Target right is 90.
            // Spacing is 10. Target right + spacing = 100.
            // Dist: 100 - 100 = 0.
            const result = calculateSnaps(dragBox, unselected, 1, 10, 8);
            expect(result.x).not.toBeNull();
            expect(result.x?.dist).toBe(0);
        });

        it('should ignore snap when outside threshold', () => {
            // Drag left is 100. Target right + spacing = 100. 
            // If spacing is 50, target right + spacing = 140. 
            // Dist = 140 - 100 = 40.
            const result = calculateSnaps(dragBox, unselected, 1, 50, 8);
            expect(result.x).toBeNull();
        });
    });
});
