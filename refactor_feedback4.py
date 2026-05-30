import re

# 1. Update index.css
with open('src/index.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Update re-center hint to be clickable and handle mobile/desktop text
old_hint = '''#out-of-view-hint {
    position: absolute;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(28, 28, 30, 0.7);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    color: #fff;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    pointer-events: none;
    z-index: 2000;
    opacity: 1;
    transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
}'''

new_hint = '''#out-of-view-hint {
    position: absolute;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(28, 28, 30, 0.7);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    color: #fff;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    pointer-events: auto;
    z-index: 2000;
    opacity: 1;
    transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
}
#out-of-view-hint .mobile-text { display: none; }
@media (hover: none) {
    #out-of-view-hint .desktop-text { display: none; }
    #out-of-view-hint .mobile-text { display: inline; }
}'''

css = css.replace(old_hint, new_hint)


# Update Multiselect Toolbar Delete button colors
old_del1 = '''.multiselect-toolbar .btn-delete.confirm-delete {
    background: rgba(255, 59, 48, 0.2);
    color: #ff3b30;
}'''
new_del1 = '''.multiselect-toolbar .btn-delete.confirm-delete {
    background: #ff3b30;
    color: #fff;
}'''
css = css.replace(old_del1, new_del1)

old_del2 = '''.multiselect-toolbar .btn-delete .delete-progress {
    position: absolute;
    top: 0; left: 0; bottom: 0;
    width: 100%;
    background: rgba(255, 59, 48, 0.4);'''
new_del2 = '''.multiselect-toolbar .btn-delete .delete-progress {
    position: absolute;
    top: 0; left: 0; bottom: 0;
    width: 100%;
    background: #ff7676;'''
css = css.replace(old_del2, new_del2)

with open('src/index.css', 'w', encoding='utf-8') as f:
    f.write(css)


# 2. Update CanvasView.tsx
with open('src/components/CanvasView.tsx', 'r', encoding='utf-8') as f:
    ts = f.read()

# Fix clear selection on mobile empty space tap
old_touch_empty = '''            if (e.pointerType === 'touch') {
                state.isMultiselectMode = false;
                setMultiselectConfirmDelete(false);
                state.isPanning = true;
                if (vp) vp.classList.add('panning');
                return;
            }'''
new_touch_empty = '''            if (e.pointerType === 'touch') {
                state.selection.clear();
                requestRender();
                state.isMultiselectMode = false;
                setMultiselectConfirmDelete(false);
                state.isPanning = true;
                if (vp) vp.classList.add('panning');
                return;
            }'''
ts = ts.replace(old_touch_empty, new_touch_empty)

# Fix hint JSX to make it clickable
old_hint_jsx = '''            <div id="out-of-view-hint" className={!isOutOfView ? 'hide-hint' : ''}>
                Press F to re-center
            </div>'''
new_hint_jsx = '''            <div 
                id="out-of-view-hint" 
                className={!isOutOfView ? 'hide-hint' : ''}
                onClick={() => {
                    const state = stateRef.current;
                    if (state.images.length === 0) return;
                    const allIds = state.images.map(i => i.id);
                    const box = getBoundingBox(allIds, state.images);
                    if (box) {
                        const padding = 0.9;
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
                }}
            >
                <span className="desktop-text">Press F to re-center</span>
                <span className="mobile-text">Click to re-center</span>
            </div>'''
ts = ts.replace(old_hint_jsx, new_hint_jsx)

with open('src/components/CanvasView.tsx', 'w', encoding='utf-8') as f:
    f.write(ts)

print("Done")
