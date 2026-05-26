import type { Camera, ImageNodeData } from './db';

export function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

export function screenToCanvas(sx: number, sy: number, camera: Camera) {
    return {
        x: (sx - camera.x) / camera.z,
        y: (sy - camera.y) / camera.z
    };
}

export interface BoundingBox {
    left: number;
    right: number;
    top: number;
    bottom: number;
    centerX: number;
    centerY: number;
    w: number;
    h: number;
}

export function getBoundingBox(imageIds: string[], allImages: ImageNodeData[]): BoundingBox | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;

    imageIds.forEach(id => {
        const img = allImages.find(i => i.id === id);
        if (img) {
            minX = Math.min(minX, img.x);
            minY = Math.min(minY, img.y);
            maxX = Math.max(maxX, img.x + img.w);
            maxY = Math.max(maxY, img.y + img.h);
            found = true;
        }
    });

    if (!found) return null;

    return {
        left: minX, right: maxX, top: minY, bottom: maxY,
        centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2,
        w: maxX - minX, h: maxY - minY
    };
}

export function calculateSnaps(
    dragBox: BoundingBox, 
    unselectedImages: ImageNodeData[], 
    cameraZ: number, 
    spacing: number, 
    snapThresholdConfig: number
) : {
    x: { dist: number, targetEdge: number } | null;
    y: { dist: number, targetEdge: number } | null;
} {
    const threshold = snapThresholdConfig / cameraZ;
    
    let bestX: { dist: number, targetEdge: number } | null = null;
    let bestY: { dist: number, targetEdge: number } | null = null;

    const checkSnap = (selEdge: number, targetEdge: number, axis: 'x' | 'y') => {
        const dist = targetEdge - selEdge;
        if (Math.abs(dist) < threshold) {
            if (axis === 'x' && (!bestX || Math.abs(dist) < Math.abs(bestX.dist))) {
                bestX = { dist, targetEdge };
            }
            if (axis === 'y' && (!bestY || Math.abs(dist) < Math.abs(bestY.dist))) {
                bestY = { dist, targetEdge };
            }
        }
    };

    unselectedImages.forEach(target => {
        const t = {
            left: target.x, right: target.x + target.w,
            top: target.y, bottom: target.y + target.h,
            centerX: target.x + target.w / 2, centerY: target.y + target.h / 2
        };

        checkSnap(dragBox.left, t.left, 'x');
        checkSnap(dragBox.left, t.right + spacing, 'x');
        checkSnap(dragBox.right, t.right, 'x');
        checkSnap(dragBox.right, t.left - spacing, 'x');
        checkSnap(dragBox.centerX, t.centerX, 'x');

        checkSnap(dragBox.top, t.top, 'y');
        checkSnap(dragBox.top, t.bottom + spacing, 'y');
        checkSnap(dragBox.bottom, t.bottom, 'y');
        checkSnap(dragBox.bottom, t.top - spacing, 'y');
        checkSnap(dragBox.centerY, t.centerY, 'y');
    });

    return { x: bestX, y: bestY };
}
