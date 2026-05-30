import re

with open('src/components/CanvasView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the mousedown/move/up block
old_block_regex = re.compile(r"useEffect\(\(\) => \{\s*const vp = viewportRef.current;\s*if \(\!vp\) return;\s*const handleMouseDown = \(e: MouseEvent\) => \{.*?vp\.removeEventListener\('mousedown', handleMouseDown\);\s*window\.removeEventListener\('mousemove', handleMouseMove\);\s*window\.removeEventListener\('mouseup', handleMouseUp\);\s*\};\s*\}, \[requestRender\]\);", re.DOTALL)

new_block = """useEffect(() => {
        const vp = viewportRef.current;
        if (!vp) return;

        const pointers = new Map<number, { x: number, y: number }>();
        let initialPinchDist: number | null = null;
        let initialPinchMid: { x: number, y: number } | null = null;
        let initialCamera: { x: number, y: number, z: number } | null = null;
        let longPressTimeout: NodeJS.Timeout | null = null;

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
            if ((e.target as Element).tagName === 'TEXTAREA') return;

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
                        setContextMenu({ x: ptr.x, y: ptr.y });
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
                
                if (e.shiftKey) {
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

            state.isLassoing = true;
            state.lasso.x1 = e.clientX;
            state.lasso.y1 = e.clientY;
            state.lasso.x2 = e.clientX;
            state.lasso.y2 = e.clientY;
            if (!e.shiftKey) state.selection.clear();
            requestRender();
        };

        const handlePointerMove = (e: PointerEvent) => {
            if (pointers.has(e.pointerId)) {
                const ptr = pointers.get(e.pointerId)!;
                if (longPressTimeout && Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) > 10) {
                    clearTimeout(longPressTimeout);
                    longPressTimeout = null;
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
                    state.camera.x = newMid.x - mx * newZ;
                    state.camera.y = newMid.y - my * newZ;
                    
                    requestRender();
                }
                return;
            }

            if (state.isPanning) {
                ANIMATION.vx = e.movementX;
                ANIMATION.vy = e.movementY;
                ANIMATION.lastMoveTime = performance.now();
                state.camera.x += e.movementX;
                state.camera.y += e.movementY;
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
    }, [requestRender]);"""

if not old_block_regex.search(content):
    print("Could not find the mouse events useEffect block to replace.")
else:
    content = old_block_regex.sub(new_block, content)
    
    # 2. Add customPaste logic in the file processing useEffect
    paste_event_code = """        window.addEventListener('paste', handlePaste);

        const handleCustomPaste = async (e: CustomEvent) => {
            try {
                if (navigator.clipboard.read) {
                    const items = await navigator.clipboard.read();
                    for (const item of items) {
                        const imageTypes = item.types.filter(t => t.startsWith('image/'));
                        if (imageTypes.length > 0) {
                            const blob = await item.getType(imageTypes[0]);
                            const file = new File([blob], "pasted.png", { type: imageTypes[0] });
                            processFile(file, e.detail.x, e.detail.y);
                            return;
                        }
                        const textTypes = item.types.filter(t => t === 'text/plain');
                        if (textTypes.length > 0) {
                            const blob = await item.getType('text/plain');
                            const text = await blob.text();
                            
                            const pt = screenToCanvas(e.detail.x, e.detail.y, stateRef.current.camera);
                            const topZ = stateRef.current.images.reduce((max, i) => Math.max(max, i.zIndex || 1), 0);
                            
                            const newImg = {
                                id: generateId(),
                                blobId: '',
                                w: 300, h: 100, x: pt.x - 150, y: pt.y - 50, aspect: 3,
                                type: 'text', content: text, zIndex: topZ + 1
                            };
                            
                            pushHistory();
                            stateRef.current.images.push(newImg);
                            setIsEmpty(false);
                            requestRender();
                            saveImages(stateRef.current.images);
                            return;
                        }
                    }
                }
            } catch (err) {
                console.error("Custom paste failed", err);
            }
        };
        window.addEventListener('customPaste', handleCustomPaste as EventListener);"""
        
    paste_cleanup_code = """            window.removeEventListener('paste', handlePaste);
            window.removeEventListener('customPaste', handleCustomPaste as EventListener);"""

    content = content.replace("        window.addEventListener('paste', handlePaste);", paste_event_code)
    content = content.replace("            window.removeEventListener('paste', handlePaste);", paste_cleanup_code)

    # 3. Add contextMenu render
    context_menu_jsx = """
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
    """
    
    # insert before the #ui div ends, or just before <div id="empty-state"
    content = content.replace('            <div id="empty-state"', context_menu_jsx + '\n            <div id="empty-state"')

    with open('src/components/CanvasView.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done")
