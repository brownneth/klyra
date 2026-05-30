import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Camera, ImageNodeData } from '../utils/db';
import { SETTINGS, saveImageBlob, generateId, deleteImageBlob } from '../utils/db';
import { clamp, screenToCanvas, getBoundingBox, calculateSnaps } from '../utils/geometry';

import { useCanvasPhysics } from '../hooks/useCanvasPhysics';
const ANIMATION = {
    targetZ: 1,
    focalX: window.innerWidth / 2,
    focalY: window.innerHeight / 2,
    targetX: null as number | null,
    targetY: null as number | null,
    vx: 0,
    vy: 0,
    lastMoveTime: 0,
    friction: 0.90,
    zoomSpeed: 0.25,
    magneticFactor: 0.35
};



const LOCK_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;

export function CanvasView({ 
    activeId, 
    initialImages, 
    initialCamera, 
    onSaveRequested 
}: { 
    activeId: string, 
    initialImages: ImageNodeData[], 
    initialCamera: Camera,
    onSaveRequested: (images: ImageNodeData[], camera: Camera) => void 
}) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const lassoRef = useRef<HTMLDivElement>(null);
    const guidesRef = useRef<HTMLDivElement>(null);
    
    const [isEmpty, setIsEmpty] = useState(initialImages.length === 0);
    const [isOutOfView, setIsOutOfView] = useState(false);
    const [multiselectConfirmDelete, setMultiselectConfirmDelete] = useState(false);
    const multiselectTimeoutRef = useRef<number | null>(null);
    const [imageContextMenu, setImageContextMenu] = useState<{x: number, y: number, id: string} | null>(null);
    const [contextMenu, setContextMenu] = useState<{x: number, y: number} | null>(null);
    
    const { stateRef, pushHistory, undo, redo } = useCanvasPhysics(initialImages, initialCamera);
    const imageNodesMap = useRef<Map<string, HTMLDivElement>>(new Map());
    const renderQueued = useRef(false);



    useEffect(() => {
        stateRef.current.images = [...initialImages];
        stateRef.current.camera = { ...initialCamera };
        stateRef.current.selection.clear();
        
        ANIMATION.targetX = null;
        ANIMATION.targetY = null;
        ANIMATION.targetZ = initialCamera.z;
        ANIMATION.vx = 0;
        ANIMATION.vy = 0;
        
        for (const el of imageNodesMap.current.values()) {
            el.remove();
        }
        imageNodesMap.current.clear();
        requestRender();
    }, [activeId]);

    const saveTimeoutRef = useRef<number | null>(null);

    const requestRender = useCallback(() => {
        if (!renderQueued.current) {
            renderQueued.current = true;
            requestAnimationFrame(render);
        }
        
        if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(() => {
            onSaveRequested(stateRef.current.images, stateRef.current.camera);
            setIsEmpty(stateRef.current.images.length === 0);
        }, 500);
    }, [onSaveRequested]);



    const handleUndo = useCallback(() => {
        if (undo()) {
            onSaveRequested(stateRef.current.images, stateRef.current.camera);
            requestRender();
        }
    }, [undo, onSaveRequested, requestRender, stateRef]);

    const handleRedo = useCallback(() => {
        if (redo()) {
            onSaveRequested(stateRef.current.images, stateRef.current.camera);
            requestRender();
        }
    }, [redo, onSaveRequested, requestRender, stateRef]);
    const render = useCallback(() => {
        renderQueued.current = false;
        let needsNextFrame = false;
        const state = stateRef.current;

        if (!state.isPanning && (Math.abs(ANIMATION.vx) > 0.05 || Math.abs(ANIMATION.vy) > 0.05)) {
            state.camera.x += ANIMATION.vx;
            state.camera.y += ANIMATION.vy;
            ANIMATION.vx *= ANIMATION.friction;
            ANIMATION.vy *= ANIMATION.friction;
            needsNextFrame = true;
        } else if (!state.isPanning) {
            ANIMATION.vx = 0;
            ANIMATION.vy = 0;
        }

        if (ANIMATION.targetX !== null && ANIMATION.targetY !== null) {
            state.camera.x += (ANIMATION.targetX - state.camera.x) * ANIMATION.zoomSpeed;
            state.camera.y += (ANIMATION.targetY - state.camera.y) * ANIMATION.zoomSpeed;
            state.camera.z += (ANIMATION.targetZ - state.camera.z) * ANIMATION.zoomSpeed;

            if (Math.abs(ANIMATION.targetX - state.camera.x) < 0.5 &&
                Math.abs(ANIMATION.targetY - state.camera.y) < 0.5 &&
                Math.abs(ANIMATION.targetZ - state.camera.z) < 0.001) {
                state.camera.x = ANIMATION.targetX;
                state.camera.y = ANIMATION.targetY;
                state.camera.z = ANIMATION.targetZ;
                ANIMATION.targetX = null;
                ANIMATION.targetY = null;
            }
            needsNextFrame = true;
        } 
        else if (Math.abs(ANIMATION.targetZ - state.camera.z) > 0.0005) {
            const oldZ = state.camera.z;
            state.camera.z += (ANIMATION.targetZ - state.camera.z) * ANIMATION.zoomSpeed;
            const actualFactor = state.camera.z / oldZ;
            state.camera.x = ANIMATION.focalX - (ANIMATION.focalX - state.camera.x) * actualFactor;
            state.camera.y = ANIMATION.focalY - (ANIMATION.focalY - state.camera.y) * actualFactor;
            needsNextFrame = true;
        } else if (state.camera.z !== ANIMATION.targetZ) {
            const oldZ = state.camera.z;
            state.camera.z = ANIMATION.targetZ;
            const actualFactor = state.camera.z / oldZ;
            state.camera.x = ANIMATION.focalX - (ANIMATION.focalX - state.camera.x) * actualFactor;
            state.camera.y = ANIMATION.focalY - (ANIMATION.focalY - state.camera.y) * actualFactor;
        }

        if (state.isDragging && state.dragStart) {
            const ease = ANIMATION.magneticFactor;
            state.activeSnap.x += (state.targetSnap.x - state.activeSnap.x) * ease;
            state.activeSnap.y += (state.targetSnap.y - state.activeSnap.y) * ease;
            
            if (Math.abs(state.targetSnap.x - state.activeSnap.x) < 0.1) state.activeSnap.x = state.targetSnap.x;
            if (Math.abs(state.targetSnap.y - state.activeSnap.y) < 0.1) state.activeSnap.y = state.targetSnap.y;
            
            if (state.activeSnap.x !== state.targetSnap.x || state.activeSnap.y !== state.targetSnap.y) {
                needsNextFrame = true;
            }
            
            state.selection.forEach(id => {
                const img = state.images.find(i => i.id === id);
                const init = state.dragStart!.initials.get(id);
                if (img && init && !img.locked) {
                    img.x = init.x + state.dragStart!.dx + state.activeSnap.x;
                    img.y = init.y + state.dragStart!.dy + state.activeSnap.y;
                }
            });
        }

        if (viewportRef.current && canvasRef.current) {
            viewportRef.current.style.setProperty('--x', `${state.camera.x}px`);
            viewportRef.current.style.setProperty('--y', `${state.camera.y}px`);
            viewportRef.current.style.setProperty('--z', String(state.camera.z));
            canvasRef.current.style.transform = `translate(${state.camera.x}px, ${state.camera.y}px) scale(${state.camera.z})`;
        }

        let isOut = false;
        if (state.images.length > 0) {
            const allIds = state.images.map(i => i.id);
            const box = getBoundingBox(allIds, state.images);
            if (box) {
                const screenLeft = (box.left * state.camera.z) + state.camera.x;
                const screenRight = (box.right * state.camera.z) + state.camera.x;
                const screenTop = (box.top * state.camera.z) + state.camera.y;
                const screenBottom = (box.bottom * state.camera.z) + state.camera.y;
                isOut = screenRight < 0 || screenLeft > window.innerWidth || screenBottom < 0 || screenTop > window.innerHeight;
            }
        }
        setIsOutOfView(isOut);

        if (canvasRef.current && guidesRef.current) {
            // Sort by zIndex so DOM order reflects zIndex manually
            const sortedImages = [...state.images].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

            sortedImages.forEach(img => {
                let el = imageNodesMap.current.get(img.id);
                
                if (!el) {
                    el = document.createElement('div');
                    el.className = `image-node ${img.type === 'text' ? 'text-type' : ''}`;
                    el.dataset.id = img.id;
                    
                    if (img.type === 'text') {
                        el.innerHTML = `
                            
                            <textarea class="text-node" spellcheck="false" placeholder="Type something...">${img.text || ''}</textarea>
                            <div class="lock-icon" style="display: none">${LOCK_ICON_SVG}</div>
                            <div class="handle nw"></div><div class="handle ne"></div><div class="handle sw"></div><div class="handle se"></div>
                        `;
                        const ta = el.querySelector('textarea');
                        if (ta) {
                            ta.style.pointerEvents = 'none';
                            let hasEditedSinceFocus = false;
                            ta.addEventListener('focus', () => {
                                hasEditedSinceFocus = false;
                            });
                            ta.addEventListener('input', (e) => {
                                if (!hasEditedSinceFocus) {
                                    pushHistory();
                                    hasEditedSinceFocus = true;
                                }
                                const target = state.images.find(i => i.id === img.id);
                                if (target) target.text = (e.target as HTMLTextAreaElement).value;
                            });
                            ta.addEventListener('blur', () => {
                                ta.style.pointerEvents = 'none';
                                window.getSelection()?.removeAllRanges();
                            });
                            ta.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    ta.blur();
                                }
                            });
                        }

                        el.addEventListener('dblclick', (e) => {
                            e.stopPropagation();
                            const target = state.images.find(i => i.id === img.id);
                            if (target && !target.locked && ta) {
                                ta.style.pointerEvents = 'auto';
                                setTimeout(() => {
                                    ta.focus();
                                }, 10);
                            }
                        });

                        if (state.focusId === img.id && ta) {
                            state.focusId = null;
                            ta.style.pointerEvents = 'auto';
                            setTimeout(() => {
                                ta.focus();
                            }, 10);
                        }
                    } else {
                        el.innerHTML = `
                            
                            <img src="${img.objectUrl}" draggable="false" />
                            <div class="lock-icon" style="display: none">${LOCK_ICON_SVG}</div>
                            <div class="handle nw"></div><div class="handle ne"></div><div class="handle sw"></div><div class="handle se"></div>
                        `;
                    }
                    
                    canvasRef.current!.insertBefore(el, guidesRef.current!);
                    imageNodesMap.current.set(img.id, el);
                }

                // Ensure it's correctly appended in DOM order for natural stacking
                if (el.nextElementSibling !== guidesRef.current) {
                    canvasRef.current!.insertBefore(el, guidesRef.current!);
                }
                
                el.style.transform = `translate(${img.x}px, ${img.y}px)`;
                el.style.width = `${img.w}px`;
                el.style.height = `${img.h}px`;
                
                if (img.locked) {
                    el.classList.add('locked');
                    (el.querySelector('.lock-icon') as HTMLElement).style.display = 'block';
                    // Hide handles if locked
                    el.querySelectorAll('.handle').forEach(h => (h as HTMLElement).style.display = 'none');
                } else {
                    el.classList.remove('locked');
                    (el.querySelector('.lock-icon') as HTMLElement).style.display = 'none';
                    el.querySelectorAll('.handle').forEach(h => (h as HTMLElement).style.display = '');
                }

                if (state.selection.has(img.id)) {
                    el.classList.add('selected');
                    el.style.zIndex = '1000'; // Bring to absolute front when selected
                } else {
                    el.classList.remove('selected');
                    el.style.zIndex = String(img.zIndex || 1);
                }
            });
            
            for (const [id, el] of imageNodesMap.current.entries()) {
                if (!state.images.find(i => i.id === id)) {
                    el.remove();
                    imageNodesMap.current.delete(id);
                }
            }
        }

        if (guidesRef.current) {
            guidesRef.current.innerHTML = '';
            if (state.guides.length > 0) {
                const guideThickness = 1 / state.camera.z;
                state.guides.forEach(g => {
                    const guideEl = document.createElement('div');
                    guideEl.className = `guide ${g.axis}`;
                    if (g.axis === 'v') {
                        guideEl.style.left = `${g.pos}px`;
                        guideEl.style.width = `${guideThickness}px`;
                    } else {
                        guideEl.style.top = `${g.pos}px`;
                        guideEl.style.height = `${guideThickness}px`;
                    }
                    guidesRef.current!.appendChild(guideEl);
                });
            }
        }

        if (lassoRef.current) {
            if (state.isLassoing) {
                lassoRef.current.style.display = 'block';
                const minX = Math.min(state.lasso.x1, state.lasso.x2);
                const minY = Math.min(state.lasso.y1, state.lasso.y2);
                const width = Math.abs(state.lasso.x2 - state.lasso.x1);
                const height = Math.abs(state.lasso.y2 - state.lasso.y1);
                lassoRef.current.style.left = `${minX}px`;
                lassoRef.current.style.top = `${minY}px`;
                lassoRef.current.style.width = `${width}px`;
                lassoRef.current.style.height = `${height}px`;
            } else {
                lassoRef.current.style.display = 'none';
            }
        }

        if (needsNextFrame) {
            requestRender();
        }
    }, [requestRender]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
            const state = stateRef.current;

            if (e.code === 'Space' && !state.isSpaceDown && !isInput) {
                state.isSpaceDown = true;
                if (viewportRef.current) viewportRef.current.classList.add('space-down');
            }
            
            if (!isInput && (e.key === 'Backspace' || e.key === 'Delete')) {
                const hasSelectedUnocked = state.images.some(img => state.selection.has(img.id) && !img.locked);
                if (hasSelectedUnocked) pushHistory();

                state.images = state.images.filter(img => {
                    if (state.selection.has(img.id) && !img.locked) {
                        if (img.blobId) deleteImageBlob(img.blobId);
                        if (img.objectUrl) URL.revokeObjectURL(img.objectUrl);
                        return false;
                    }
                    return true;
                });
                state.selection.clear();
                requestRender();
            }

            if (!isInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
            }
            if (!isInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
            }

            if (!isInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                state.images.forEach(img => {
                    if (!img.locked) state.selection.add(img.id)
                });
                requestRender();
            }

            // Lock / Unlock toggle
            if (!isInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                state.images.forEach(img => {
                    if (state.selection.has(img.id)) {
                        img.locked = !img.locked;
                    }
                });
                state.selection.clear(); // Clear selection after locking/unlocking to reset visual state
                requestRender();
            }

            // Z-Index manipulation
            if (!isInput && e.key === '[') {
                if (state.selection.size > 0) pushHistory();
                state.images.forEach(img => {
                    if (state.selection.has(img.id)) img.zIndex = (img.zIndex || 1) - 1;
                });
                requestRender();
            }
            if (!isInput && e.key === ']') {
                if (state.selection.size > 0) pushHistory();
                state.images.forEach(img => {
                    if (state.selection.has(img.id)) img.zIndex = (img.zIndex || 1) + 1;
                });
                requestRender();
            }
            
            if (!isInput && (e.key === '+' || e.key === '=')) {
                ANIMATION.targetZ = clamp(ANIMATION.targetZ * 1.2, SETTINGS.minZoom, SETTINGS.maxZoom);
                ANIMATION.focalX = window.innerWidth/2;
                ANIMATION.focalY = window.innerHeight/2;
                requestRender();
            }
            
            if (!isInput && (e.key === '-' || e.key === '_')) {
                ANIMATION.targetZ = clamp(ANIMATION.targetZ / 1.2, SETTINGS.minZoom, SETTINGS.maxZoom);
                ANIMATION.focalX = window.innerWidth/2;
                ANIMATION.focalY = window.innerHeight/2;
                requestRender();
            }

            if (!isInput && e.key === '0') {
                ANIMATION.targetX = null;
                ANIMATION.targetY = null;
                ANIMATION.targetZ = 1;
                ANIMATION.focalX = window.innerWidth / 2;
                ANIMATION.focalY = window.innerHeight / 2;
                requestRender();
            }

            if (!isInput && e.key.toLowerCase() === 'f') {
                const allIds = state.images.map(i => i.id);
                const box = getBoundingBox(allIds, state.images);
                if (box && box.w > 0 && box.h > 0) {
                    const padding = 0.85; 
                    const scaleX = (window.innerWidth * padding) / box.w;
                    const scaleY = (window.innerHeight * padding) / box.h;
                    
                    let targetZ = Math.min(scaleX, scaleY);
                    targetZ = clamp(targetZ, SETTINGS.minZoom, SETTINGS.maxZoom);

                    ANIMATION.targetX = (window.innerWidth / 2) - (box.centerX * targetZ);
                    ANIMATION.targetY = (window.innerHeight / 2) - (box.centerY * targetZ);
                    ANIMATION.targetZ = targetZ;
                    ANIMATION.vx = 0;
                    ANIMATION.vy = 0;
                    requestRender();
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                stateRef.current.isSpaceDown = false;
                if (viewportRef.current) viewportRef.current.classList.remove('space-down');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [requestRender, pushHistory, handleUndo, handleRedo]);

    useEffect(() => {
        const vp = viewportRef.current;
        if (!vp) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const state = stateRef.current;

            ANIMATION.targetX = null;
            ANIMATION.targetY = null;

            if (e.ctrlKey || e.metaKey) {
                const zoomFactor = Math.exp(e.deltaY * -0.01);
                ANIMATION.targetZ = clamp(ANIMATION.targetZ * zoomFactor, SETTINGS.minZoom, SETTINGS.maxZoom);
                ANIMATION.focalX = e.clientX;
                ANIMATION.focalY = e.clientY;
                requestRender();
            } else {
                let dx = e.deltaX;
                let dy = e.deltaY;
                if (e.shiftKey && dy !== 0 && dx === 0) {
                    dx = dy;
                    dy = 0;
                }
                state.camera.x -= dx;
                state.camera.y -= dy;
                ANIMATION.vx = 0;
                ANIMATION.vy = 0;
                requestRender();
            }
        };

        vp.addEventListener('wheel', handleWheel, { passive: false });
        return () => vp.removeEventListener('wheel', handleWheel);
    }, [requestRender]);

    useEffect(() => {
        const vp = viewportRef.current;
        if (!vp) return;

        const pointers = new Map<number, { x: number, y: number }>();
        let initialPinchDist: number | null = null;
        let initialPinchMid: { x: number, y: number } | null = null;
        let initialCamera: { x: number, y: number, z: number } | null = null;
        let longPressTimeout: ReturnType<typeof setTimeout> | null = null;

        const getPointersMidpoint = () => {
            const pts = Array.from(pointers.values());
            if (pts.length < 2) return null;
            return {
                x: (pts[0].x + pts[1].x) / 2,
                y: (pts[0].y + pts[1].y) / 2
            };
        };

        const getPointersDist = () => {
            const pts = Array.from(pointers.values());
            if (pts.length < 2) return null;
            return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        };

        const handlePointerDown = (e: PointerEvent) => {
            if ((e.target as Element).closest('#ui') || (e.target as Element).closest('#creation-toolbar') || (e.target as Element).closest('.context-menu')) return;
            if ((e.target as Element).tagName === 'TEXTAREA' && document.activeElement === e.target) return;

            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const state = stateRef.current;
            setContextMenu(null);

            ANIMATION.targetX = null;
            ANIMATION.targetY = null;

            if (pointers.size === 2) {
                initialPinchDist = getPointersDist();
                initialPinchMid = getPointersMidpoint();
                initialCamera = { x: state.camera.x, y: state.camera.y, z: state.camera.z };
                
                state.isDragging = false;
                state.isLassoing = false;
                state.isResizing = false;
                if (longPressTimeout) clearTimeout(longPressTimeout);
                return;
            }

            if (pointers.size > 2) return;

            
            const imgTarget = (e.target as Element).closest('.image-node') as HTMLElement;
            if (e.button === 2 && imgTarget) {
                setImageContextMenu({ x: e.clientX, y: e.clientY, id: imgTarget.dataset.id! });
                state.isDragging = false;
                state.isLassoing = false;
                return;
            }
            const isMiddleClick = e.button === 1;
            const isRightClick = e.button === 2;

            if (state.isSpaceDown || isMiddleClick || isRightClick) {
                state.isPanning = true;
                if (vp) vp.classList.add('panning');
                return;
            }

            if (e.pointerType === 'touch' && pointers.size === 1) {
                if (longPressTimeout) clearTimeout(longPressTimeout);
                longPressTimeout = setTimeout(() => {
                    const ptr = pointers.get(e.pointerId);
                    if (ptr) {
                        const targetEl = document.elementFromPoint(ptr.x, ptr.y);
                        const hitImgNode = targetEl ? targetEl.closest('.image-node') as HTMLElement : null;
                        if (hitImgNode) {
                            const imgId = hitImgNode.dataset.id!;
                            state.isMultiselectMode = true;
                            if (!state.selection.has(imgId)) {
                                state.selection.add(imgId);
                            }
                            setMultiselectConfirmDelete(false);
                        } else {
                            setContextMenu({ x: ptr.x, y: ptr.y });
                        }
                        state.isDragging = false;
                        state.isLassoing = false;
                        state.isResizing = false;
                        requestRender();
                    }
                }, 500);
            }

            const handleEl = (e.target as Element).closest('.handle');
            if (handleEl) {
                const imgNode = handleEl.closest('.image-node') as HTMLElement;
                const imgId = imgNode.dataset.id!;
                const img = state.images.find(i => i.id === imgId)!;
                if (img.locked) return;
                
                state.isResizing = true;
                state.resizeStart = {
                    handle: handleEl.className.replace('handle ', '').trim(),
                    imgId,
                    mouseX: e.clientX,
                    mouseY: e.clientY,
                    startW: img.w,
                    startH: img.h,
                    startX: img.x,
                    startY: img.y
                };
                return;
            }

            const imgNode = (e.target as Element).closest('.image-node') as HTMLElement;
            if (imgNode) {
                const imgId = imgNode.dataset.id!;
                
                const now = Date.now();
                if (state.lastClickNodeId === imgId && now - state.lastClickTime < 300) {
                    const imgObj = state.images.find(i => i.id === imgId);
                    if (imgObj && imgObj.type === 'text' && !imgObj.locked) {
                        const ta = imgNode.querySelector('textarea');
                        if (ta) {
                            ta.style.pointerEvents = 'auto';
                            setTimeout(() => {
                                ta.focus();
                            }, 10);
                        }
                    }
                    state.lastClickNodeId = null;
                    return;
                }
                state.lastClickNodeId = imgId;
                state.lastClickTime = now;

                const imgObj = state.images.find(i => i.id === imgId);
                
                const isToggling = e.shiftKey || state.isMultiselectMode;
                if (isToggling) {
                    if (state.selection.has(imgId)) state.selection.delete(imgId);
                    else state.selection.add(imgId);
                } else {
                    if (!state.selection.has(imgId)) {
                        state.selection.clear();
                        state.selection.add(imgId);
                    }
                }

                if (!imgObj?.locked) {
                    state.isDragging = true;
                    const initials = new Map();
                    state.selection.forEach(id => {
                        const img = state.images.find(i => i.id === id)!;
                        initials.set(id, { x: img.x, y: img.y });
                    });

                    state.dragStart = { mouseX: e.clientX, mouseY: e.clientY, dx: 0, dy: 0, initials };
                    state.targetSnap = { x: 0, y: 0 };
                    state.activeSnap = { x: 0, y: 0 };
                }
                
                requestRender();
                return;
            }

            if (e.pointerType === 'touch') {
                state.isMultiselectMode = false;
                setMultiselectConfirmDelete(false);
                state.isPanning = true;
                if (vp) vp.classList.add('panning');
                return;
            }

            state.isMultiselectMode = false;
            setMultiselectConfirmDelete(false);
            state.isLassoing = true;
            state.lasso.x1 = e.clientX;
            state.lasso.y1 = e.clientY;
            state.lasso.x2 = e.clientX;
            state.lasso.y2 = e.clientY;
            if (!e.shiftKey) state.selection.clear();
            requestRender();
        };

        const handlePointerMove = (e: PointerEvent) => {
            let dx = e.movementX;
            let dy = e.movementY;

            if (pointers.has(e.pointerId)) {
                const ptr = pointers.get(e.pointerId)!;
                if (longPressTimeout && Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) > 10) {
                    clearTimeout(longPressTimeout);
                    longPressTimeout = null;
                }
                if (e.pointerType === 'touch') {
                    dx = e.clientX - ptr.x;
                    dy = e.clientY - ptr.y;
                }
                pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            }

            const state = stateRef.current;

            if (pointers.size === 2 && initialPinchDist && initialPinchMid && initialCamera) {
                const newDist = getPointersDist();
                const newMid = getPointersMidpoint();
                if (newDist && newMid) {
                    const scale = newDist / initialPinchDist;
                    let newZ = initialCamera.z * scale;
                    newZ = clamp(newZ, 0.1, 5);

                    const mx = (initialPinchMid.x - initialCamera.x) / initialCamera.z;
                    const my = (initialPinchMid.y - initialCamera.y) / initialCamera.z;

                    state.camera.z = newZ;
                    ANIMATION.targetZ = newZ;
                    state.camera.x = newMid.x - mx * newZ;
                    state.camera.y = newMid.y - my * newZ;
                    
                    requestRender();
                }
                return;
            }

            if (state.isPanning) {
                ANIMATION.vx = dx;
                ANIMATION.vy = dy;
                ANIMATION.lastMoveTime = performance.now();
                state.camera.x += dx;
                state.camera.y += dy;
                requestRender();
                return;
            }

            if (state.isLassoing) {
                state.lasso.x2 = e.clientX;
                state.lasso.y2 = e.clientY;
                const lxMin = Math.min(state.lasso.x1, state.lasso.x2);
                const lxMax = Math.max(state.lasso.x1, state.lasso.x2);
                const lyMin = Math.min(state.lasso.y1, state.lasso.y2);
                const lyMax = Math.max(state.lasso.y1, state.lasso.y2);
                const cMin = screenToCanvas(lxMin, lyMin, state.camera);
                const cMax = screenToCanvas(lxMax, lyMax, state.camera);

                state.images.forEach(img => {
                    if (img.locked) return;
                    const overlap = (img.x < cMax.x && img.x + img.w > cMin.x && img.y < cMax.y && img.y + img.h > cMin.y);
                    if (overlap) state.selection.add(img.id);
                    else if (!e.shiftKey) state.selection.delete(img.id);
                });
                requestRender();
                return;
            }

            if (state.isDragging && state.dragStart) {
                if (!state.dragStart.hasMoved) {
                    pushHistory();
                    state.dragStart.hasMoved = true;
                }
                state.dragStart.dx = (e.clientX - state.dragStart.mouseX) / state.camera.z;
                state.dragStart.dy = (e.clientY - state.dragStart.mouseY) / state.camera.z;

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                state.selection.forEach(id => {
                    const img = state.images.find(i => i.id === id);
                    const init = state.dragStart!.initials.get(id);
                    if (img && init && !img.locked) {
                        const hx = init.x + state.dragStart!.dx;
                        const hy = init.y + state.dragStart!.dy;
                        minX = Math.min(minX, hx);
                        minY = Math.min(minY, hy);
                        maxX = Math.max(maxX, hx + img.w);
                        maxY = Math.max(maxY, hy + img.h);
                    }
                });

                const dragBox = {
                    left: minX, right: maxX, top: minY, bottom: maxY,
                    centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2,
                    w: maxX - minX, h: maxY - minY
                };

                state.guides = [];
                const unselected = state.images.filter(i => !state.selection.has(i.id));
                state.targetSnap = { x: 0, y: 0 };

                if (unselected.length > 0) {
                    const snaps = calculateSnaps(dragBox, unselected, state.camera.z, SETTINGS.spacing, SETTINGS.snapThreshold);
                    if (snaps.x) {
                        state.targetSnap.x = snaps.x.dist;
                        state.guides.push({ axis: 'v', pos: snaps.x.targetEdge });
                    }
                    if (snaps.y) {
                        state.targetSnap.y = snaps.y.dist;
                        state.guides.push({ axis: 'h', pos: snaps.y.targetEdge });
                    }
                }
                requestRender();
                return;
            }

            if (state.isResizing && state.resizeStart) {
                const start = state.resizeStart;
                if (!start.hasMoved) {
                    pushHistory();
                    start.hasMoved = true;
                }
                const img = state.images.find(i => i.id === start.imgId);
                if (!img || img.locked) return;

                const dx = (e.clientX - start.mouseX) / state.camera.z;
                
                let newW = start.startW;
                if (start.handle === 'se' || start.handle === 'ne') newW = start.startW + dx;
                if (start.handle === 'sw' || start.handle === 'nw') newW = start.startW - dx;

                newW = Math.max(40, newW);
                let newH = newW / img.aspect;

                if (start.handle === 'nw' || start.handle === 'sw') {
                    img.x = start.startX + (start.startW - newW);
                }
                if (start.handle === 'nw' || start.handle === 'ne') {
                    img.y = start.startY + (start.startH - newH);
                }
                
                img.w = newW;
                img.h = newH;
                requestRender();
            }
        };

        const handlePointerUp = (e: PointerEvent) => {
            pointers.delete(e.pointerId);
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }

            const state = stateRef.current;
            
            if (pointers.size < 2) {
                initialPinchDist = null;
                initialPinchMid = null;
                initialCamera = null;
            }

            if (state.isPanning) {
                if (performance.now() - ANIMATION.lastMoveTime > 50) {
                    ANIMATION.vx = 0;
                    ANIMATION.vy = 0;
                }
                state.isPanning = false;
                if (vp) vp.classList.remove('panning');
            }
            if (state.isDragging) {
                if (state.dragStart) {
                    state.selection.forEach(id => {
                        const img = state.images.find(i => i.id === id);
                        const init = state.dragStart!.initials.get(id);
                        if (img && init && !img.locked) {
                            img.x = init.x + state.dragStart!.dx + state.targetSnap.x;
                            img.y = init.y + state.dragStart!.dy + state.targetSnap.y;
                        }
                    });
                }
                state.isDragging = false;
                state.dragStart = null;
                state.guides = [];
            }
            if (state.isLassoing) state.isLassoing = false;
            if (state.isResizing) {
                state.isResizing = false;
                state.resizeStart = null;
            }
            requestRender();
        };

        vp.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
        return () => {
            vp.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [requestRender]);

    useEffect(() => {
        const processFile = async (file: File, cx: number, cy: number) => {
            const url = URL.createObjectURL(file);
            const imgObj = new Image();
            imgObj.onload = async () => {
                let w = imgObj.width;
                let h = imgObj.height;
                const MAX_DIM = 600;
                if (w > MAX_DIM || h > MAX_DIM) {
                    if (w > h) { h = (h/w) * MAX_DIM; w = MAX_DIM; } 
                    else { w = (w/h) * MAX_DIM; h = MAX_DIM; }
                }

                const state = stateRef.current;
                const pt = screenToCanvas(cx, cy, state.camera);
                const blobId = generateId();
                await saveImageBlob(blobId, file);
                
                const topZ = state.images.reduce((max, i) => Math.max(max, i.zIndex || 1), 0);
                
                const newImg: ImageNodeData = {
                    id: generateId(),
                    blobId,
                    objectUrl: url,
                    type: 'image',
                    x: pt.x - (w / 2),
                    y: pt.y - (h / 2),
                    w, h, aspect: w / h,
                    zIndex: topZ + 1
                };
                
                pushHistory();
                stateRef.current.images.push(newImg);
                stateRef.current.selection.clear();
                stateRef.current.selection.add(newImg.id);
                requestRender();
            };
            imgObj.src = url;
        };

        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                for (let i = 0; i < e.dataTransfer.files.length; i++) {
                    const file = e.dataTransfer.files[i];
                    if (file.type.startsWith('image/')) {
                        processFile(file, e.clientX, e.clientY);
                    }
                }
            }
        };

        const handlePaste = (e: ClipboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
            if (!e.clipboardData?.items) return;
            for (let i = 0; i < e.clipboardData.items.length; i++) {
                const item = e.clipboardData.items[i];
                if (item.type.indexOf('image') === 0) {
                    const file = item.getAsFile();
                    if (file) {
                        e.preventDefault();
                        processFile(file, window.innerWidth / 2, window.innerHeight / 2);
                        return;
                    }
                }
            }
        };

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        };

        window.addEventListener('drop', handleDrop);
        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('paste', handlePaste);

        const handleCustomPaste = async (e: Event) => { const ev = e as CustomEvent;
            try {
                if (navigator.clipboard.read) {
                    const items = await navigator.clipboard.read();
                    for (const item of items) {
                        const imageTypes = item.types.filter(t => t.startsWith('image/'));
                        if (imageTypes.length > 0) {
                            const blob = await item.getType(imageTypes[0]);
                            const file = new File([blob], "pasted.png", { type: imageTypes[0] });
                            processFile(file, ev.detail.x, ev.detail.y);
                            return;
                        }
                        const textTypes = item.types.filter(t => t === 'text/plain');
                        if (textTypes.length > 0) {
                            const blob = await item.getType('text/plain');
                            const text = await blob.text();
                            
                            const pt = screenToCanvas(ev.detail.x, ev.detail.y, stateRef.current.camera);
                            const topZ = stateRef.current.images.reduce((max, i) => Math.max(max, i.zIndex || 1), 0);
                            
                            const newImg = {
                                id: generateId(),
                                blobId: '',
                                w: 300, h: 100, x: pt.x - 150, y: pt.y - 50, aspect: 3,
                                type: 'text' as const, content: text, zIndex: topZ + 1
                            };
                            
                            pushHistory();
                            stateRef.current.images.push(newImg);
                            setIsEmpty(false);
                            requestRender();
                            onSaveRequested(stateRef.current.images, stateRef.current.camera);
                            return;
                        }
                    }
                }
            } catch (err) {
                console.error("Custom paste failed", err);
            }
        };
        window.addEventListener('customPaste', handleCustomPaste );
        return () => {
            window.removeEventListener('drop', handleDrop);
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('paste', handlePaste);
            window.removeEventListener('customPaste', handleCustomPaste );
        };
    }, [requestRender, pushHistory]);

    // Handle Custom Event for Text Node
    useEffect(() => {
        const handleAddText = (e?: any) => {
            const state = stateRef.current;
            const cx = e?.detail?.x ?? (window.innerWidth / 2);
            const cy = e?.detail?.y ?? (window.innerHeight / 2);
            const pt = screenToCanvas(cx, cy, state.camera);
            const w = 300, h = 100;
            const topZ = state.images.reduce((max, i) => Math.max(max, i.zIndex || 1), 0);
            
            const newText: ImageNodeData = {
                id: generateId(),
                blobId: '', // Text nodes don't need blob storage
                type: 'text',
                text: '',
                x: pt.x - (w / 2),
                y: pt.y - (h / 2),
                w, h, aspect: w / h,
                zIndex: topZ + 1
            };
            
            pushHistory();
            state.images.push(newText);
            state.selection.clear();
            state.selection.add(newText.id);
            state.focusId = newText.id;
            requestRender();
        };

        window.addEventListener('addTextNode', handleAddText);
        return () => window.removeEventListener('addTextNode', handleAddText);
    }, [requestRender, pushHistory]);

    return (
        <div id="app" className={stateRef.current.isMultiselectMode ? "multiselect-mode" : ""}>
            <div id="viewport" ref={viewportRef} className={!SETTINGS.gridVisible ? 'no-grid' : ''} style={{ '--x': '0px', '--y': '0px', '--z': 1 } as React.CSSProperties}>
                <div id="canvas" ref={canvasRef}>
                    <div className="guides-container" id="guides-container" ref={guidesRef}></div>
                </div>
                <div id="lasso" ref={lassoRef}></div>
            </div>


            {contextMenu && (
                <div className="context-menu" style={{
                    position: 'absolute',
                    left: contextMenu.x,
                    top: contextMenu.y,
                    transform: 'translate(-50%, -100%)',
                    marginTop: '-20px',
                    zIndex: 3000,
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(24px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(150%)',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '16px',
                    padding: '8px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6)',
                    display: 'flex',
                    gap: '4px'
                }}>
                    <button 
                        className="btn" 
                        style={{ padding: '8px 16px', fontWeight: 600, margin: 0, opacity: 1, color: '#000' }}
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('customPaste', { detail: { x: contextMenu.x, y: contextMenu.y } }));
                            setContextMenu(null);
                        }}>
                        Paste
                    </button>
                    <div style={{ width: '1px', background: 'rgba(0,0,0,0.1)', margin: '4px 0' }} />
                    <button 
                        className="btn" 
                        style={{ padding: '8px 16px', fontWeight: 600, margin: 0, opacity: 1, color: '#000' }}
                        onClick={() => {
                            setContextMenu(null);
                            window.dispatchEvent(new CustomEvent('addTextNode', { detail: { x: contextMenu.x, y: contextMenu.y } }));
                        }}>
                        Add Text
                    </button>
                </div>
            )}
    

            {stateRef.current.isMultiselectMode && stateRef.current.selection.size > 0 && (
                <div className="multiselect-toolbar" onPointerDown={(e) => e.stopPropagation()}>
                    <span className="selected-count">Selected: {stateRef.current.selection.size}</span>
                    <button className="btn" onClick={() => {
                        stateRef.current.isMultiselectMode = false;
                        setMultiselectConfirmDelete(false);
                        stateRef.current.selection.clear();
                        requestRender();
                    }}>Cancel</button>
                    <button className={`btn btn-delete ${multiselectConfirmDelete ? 'confirm-delete' : ''}`} onClick={() => {
                        if (multiselectConfirmDelete) {
                            stateRef.current.images = stateRef.current.images.filter(img => !stateRef.current.selection.has(img.id));
                            stateRef.current.selection.clear();
                            stateRef.current.isMultiselectMode = false;
                            setMultiselectConfirmDelete(false);
                            pushHistory();
                            requestRender();
                            onSaveRequested(stateRef.current.images, stateRef.current.camera);
                        } else {
                            setMultiselectConfirmDelete(true);
                            if (multiselectTimeoutRef.current) clearTimeout(multiselectTimeoutRef.current);
                            multiselectTimeoutRef.current = window.setTimeout(() => {
                                setMultiselectConfirmDelete(false);
                            }, 3000);
                        }
                    }}>
                        {multiselectConfirmDelete ? <span className="delete-text">Confirm Delete</span> : <span>Delete</span>}
                        <div className="delete-progress"></div>
                    </button>
                </div>
            )}

            {imageContextMenu && (
                <div className="context-menu" style={{
                    position: 'absolute',
                    left: imageContextMenu.x,
                    top: imageContextMenu.y,
                    transform: 'translate(-50%, -100%)',
                    marginTop: '-20px',
                    zIndex: 3000,
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(24px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(150%)',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '16px',
                    padding: '8px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6)',
                    display: 'flex',
                    gap: '4px'
                }}>
                    <button 
                        className="btn" 
                        style={{ padding: '8px 16px', fontWeight: 600, margin: 0, opacity: 1, color: '#000' }}
                        onClick={() => {
                            stateRef.current.isMultiselectMode = true;
                            if (!stateRef.current.selection.has(imageContextMenu.id)) {
                                stateRef.current.selection.add(imageContextMenu.id);
                            }
                            setImageContextMenu(null);
                            requestRender();
                        }}>
                        Select
                    </button>
                </div>
            )}

            <div id="empty-state" className={!isEmpty ? 'hidden' : ''}>
                <h2>Canvas is empty</h2>
                <p>Drag & Drop or Paste (Ctrl+V) images anywhere</p>
            </div>

            <div id="out-of-view-hint" className={!isOutOfView ? 'hide-hint' : ''}>
                Press F to re-center
            </div>
        </div>
    );
}
