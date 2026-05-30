import { useRef, useCallback } from 'react';
import type { Camera, ImageNodeData } from '../utils/db';

export interface PhysicsState {
    camera: Camera;
    images: ImageNodeData[];
    selection: Set<string>;
    
    isSpaceDown: boolean;
    isPanning: boolean;
    isDragging: boolean;
    isResizing: boolean;
    isLassoing: boolean;
    isMultiselectMode: boolean;
    
    dragStart: { mouseX: number, mouseY: number, dx: number, dy: number, initials: Map<string, {x: number, y: number}>, hasMoved?: boolean } | null;
    resizeStart: { handle: string, imgId: string, mouseX: number, mouseY: number, startW: number, startH: number, startX: number, startY: number, hasMoved?: boolean } | null;
    lasso: { x1: number, y1: number, x2: number, y2: number };
    guides: { axis: 'v'|'h', pos: number }[];
    targetSnap: { x: number, y: number };
    activeSnap: { x: number, y: number };
    lastClickNodeId: string | null;
    lastClickTime: number;
    focusId: string | null;
    undoStack: ImageNodeData[][];
    redoStack: ImageNodeData[][];
}

export function useCanvasPhysics(
    initialImages: ImageNodeData[], 
    initialCamera: Camera
) {
    const stateRef = useRef<PhysicsState>({
        camera: { ...initialCamera },
        images: [...initialImages],
        selection: new Set(),
        isSpaceDown: false,
        isPanning: false,
        isDragging: false,
        isResizing: false,
        isLassoing: false,
        isMultiselectMode: false,
        dragStart: null,
        resizeStart: null,
        lasso: { x1: 0, y1: 0, x2: 0, y2: 0 },
        guides: [],
        targetSnap: { x: 0, y: 0 },
        activeSnap: { x: 0, y: 0 },
        lastClickNodeId: null,
        lastClickTime: 0,
        focusId: null,
        undoStack: [],
        redoStack: []
    });

    const pushHistory = useCallback(() => {
        const state = stateRef.current;
        const snapshot = state.images.map(img => ({ ...img }));
        state.undoStack.push(snapshot);
        if (state.undoStack.length > 30) {
            state.undoStack.shift();
        }
        state.redoStack = [];
    }, []);

    const undo = useCallback(() => {
        const state = stateRef.current;
        if (state.undoStack.length === 0) return false;
        
        const currentSnapshot = state.images.map(img => ({ ...img }));
        state.redoStack.push(currentSnapshot);
        
        const previousState = state.undoStack.pop()!;
        state.images = previousState.map(img => ({ ...img }));
        
        state.selection.clear();
        return true;
    }, []);

    const redo = useCallback(() => {
        const state = stateRef.current;
        if (state.redoStack.length === 0) return false;
        
        const currentSnapshot = state.images.map(img => ({ ...img }));
        state.undoStack.push(currentSnapshot);
        
        const nextState = state.redoStack.pop()!;
        state.images = nextState.map(img => ({ ...img }));
        
        state.selection.clear();
        return true;
    }, []);

    return {
        stateRef,
        pushHistory,
        undo,
        redo
    };
}
