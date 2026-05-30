import re

with open('src/components/CanvasView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace('import { ZoomIn, ZoomOut, Type, Trash2 } from', 'import { ZoomIn, ZoomOut, Type, Trash2, Check } from')

# 2. States
state_insert = '''    const [multiselectConfirmDelete, setMultiselectConfirmDelete] = useState(false);
    const multiselectTimeoutRef = useRef<number | null>(null);
    const [imageContextMenu, setImageContextMenu] = useState<{x: number, y: number, id: string} | null>(null);
'''
content = content.replace('    const [contextMenu, setContextMenu] = useState', state_insert + '    const [contextMenu, setContextMenu] = useState')

# 3. HandlePointerDown Touch Long Press Logic
# Replace the touch pointerType logic in handlePointerDown
old_touch_logic = '''            if (e.pointerType === 'touch' && pointers.size === 1) {
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
            }'''

new_touch_logic = '''            if (e.pointerType === 'touch' && pointers.size === 1) {
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
            }'''
content = content.replace(old_touch_logic, new_touch_logic)

# 4. Desktop Right Click
# Right before the isMiddleClick block:
# const isMiddleClick = e.button === 1;
desktop_right_click = '''
            const imgTarget = (e.target as Element).closest('.image-node') as HTMLElement;
            if (e.button === 2 && imgTarget) {
                setImageContextMenu({ x: e.clientX, y: e.clientY, id: imgTarget.dataset.id! });
                state.isDragging = false;
                state.isLassoing = false;
                return;
            }
'''
content = content.replace('const isMiddleClick = e.button === 1;', desktop_right_click + '            const isMiddleClick = e.button === 1;')

# 5. Background Touch / Click disables multiselect mode
# Before `state.isPanning = true;` or `state.isLassoing = true;`
content = content.replace("if (e.pointerType === 'touch') {\n                state.isPanning = true;", "if (e.pointerType === 'touch') {\n                state.isMultiselectMode = false;\n                setMultiselectConfirmDelete(false);\n                state.isPanning = true;")
content = content.replace("state.isLassoing = true;\n            state.lasso.x1", "state.isMultiselectMode = false;\n            setMultiselectConfirmDelete(false);\n            state.isLassoing = true;\n            state.lasso.x1")


# 6. Selection Toggling
# Replace the shiftKey selection logic
old_selection_logic = '''                if (e.shiftKey) {
                    if (state.selection.has(imgId)) state.selection.delete(imgId);
                    else state.selection.add(imgId);
                } else {
                    if (!state.selection.has(imgId)) {
                        state.selection.clear();
                        state.selection.add(imgId);
                    }
                }'''

new_selection_logic = '''                const isToggling = e.shiftKey || state.isMultiselectMode;
                if (isToggling) {
                    if (state.selection.has(imgId)) state.selection.delete(imgId);
                    else state.selection.add(imgId);
                } else {
                    if (!state.selection.has(imgId)) {
                        state.selection.clear();
                        state.selection.add(imgId);
                    }
                }'''
content = content.replace(old_selection_logic, new_selection_logic)


# 7. Checkbox Overlay Rendering
# Find className={`image-node canvas-item ${isSelected ? 'selected' : ''}`}
old_img_render = "className={`image-node canvas-item ${isSelected ? 'selected' : ''}`}"
new_img_render = old_img_render + "\n                    >\n                        {stateRef.current.isMultiselectMode && (\n                            <div className=\"checkbox-overlay\">\n                                {isSelected && <Check size={16} strokeWidth={3} />}\n                            </div>\n                        )}"
# Wait, I also need to make sure I don't break the div closing.
# Actually I can replace the `<img` with the overlay plus `<img`
content = content.replace('<img\n                                src={img.url || undefined}', '{stateRef.current.isMultiselectMode && (\n                            <div className="checkbox-overlay">\n                                {isSelected && <Check size={16} strokeWidth={3} />}\n                            </div>\n                        )}\n                        <img\n                                src={img.url || undefined}')
content = content.replace('<div\n                                className="text-content"', '{stateRef.current.isMultiselectMode && (\n                            <div className="checkbox-overlay">\n                                {isSelected && <Check size={16} strokeWidth={3} />}\n                            </div>\n                        )}\n                        <div\n                                className="text-content"')

# 8. Render Multiselect Toolbar and Image Context Menu
# Add them inside the main return wrapper
menus_jsx = '''
            {stateRef.current.isMultiselectMode && stateRef.current.selection.size > 0 && (
                <div className="multiselect-toolbar">
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
                        {multiselectConfirmDelete ? <span className="delete-text">Delete?</span> : <span>Delete</span>}
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
'''

content = content.replace('            <div id="empty-state"', menus_jsx + '\n            <div id="empty-state"')

with open('src/components/CanvasView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
