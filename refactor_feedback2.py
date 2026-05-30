import re

# 1. Update index.css
with open('src/index.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Remove checkbox CSS
css = re.sub(r'/\* Multiselect Checkbox Overlay \*/.*?/\* Multiselect Toolbar \*/', '/* Multiselect Toolbar */', css, flags=re.DOTALL)
css = re.sub(r'#app\.multiselect-mode \.checkbox-overlay \{.*?\}', '', css, flags=re.DOTALL)

# Update multiselect-toolbar delete button styling
old_delete_css = '''
.multiselect-toolbar .btn-delete.confirm-delete {
    background: #ff3b30;
    color: white;
}

.multiselect-toolbar .btn-delete .delete-progress {
    position: absolute;
    top: 0; left: 0; bottom: 0;
    width: 100%;
    background: rgba(0, 0, 0, 0.2);
    transform-origin: left;
    opacity: 0;
}'''

new_delete_css = '''
.multiselect-toolbar .btn-delete {
    color: #ff3b30;
    position: relative;
    overflow: hidden;
    padding: 8px 16px;
    background: transparent;
}

.multiselect-toolbar .btn-delete.confirm-delete {
    background: rgba(255, 59, 48, 0.1);
    color: #ff3b30;
}

.multiselect-toolbar .btn-delete .delete-progress {
    position: absolute;
    top: 0; left: 0; bottom: 0;
    width: 100%;
    background: rgba(255, 59, 48, 0.2);
    transform-origin: left;
    opacity: 0;
}'''
css = css.replace(old_delete_css, new_delete_css)

with open('src/index.css', 'w', encoding='utf-8') as f:
    f.write(css)

# 2. Update CanvasView.tsx
with open('src/components/CanvasView.tsx', 'r', encoding='utf-8') as f:
    ts = f.read()

# Remove CHECKBOX_SVG definition and its injections
ts = re.sub(r'const CHECKBOX_SVG = .*?;\n', '', ts)
ts = ts.replace('<div class="checkbox-overlay">${CHECKBOX_SVG}</div>', '')

# Ensure stopPropagation on toolbar and update text to Confirm Delete
old_toolbar_div = '<div className="multiselect-toolbar">'
new_toolbar_div = '<div className="multiselect-toolbar" onPointerDown={(e) => e.stopPropagation()}>'
ts = ts.replace(old_toolbar_div, new_toolbar_div)

ts = ts.replace('{multiselectConfirmDelete ? <span className="delete-text">Delete?</span> : <span>Delete</span>}', '{multiselectConfirmDelete ? <span className="delete-text">Confirm Delete</span> : <span>Delete</span>}')

# Fix Zoom by ensuring targetZ stays synced during pinch!
# I already added state.isPanning = false, but I need ANIMATION.targetZ = newZ inside the pointermove logic!
# Find state.camera.z = newZ; and replace with state.camera.z = newZ; ANIMATION.targetZ = newZ;
old_pinch_move = '''                    state.camera.z = newZ;
                    state.camera.x = newMid.x - mx * newZ;
                    state.camera.y = newMid.y - my * newZ;
                    requestRender();'''
new_pinch_move = '''                    state.camera.z = newZ;
                    ANIMATION.targetZ = newZ;
                    state.camera.x = newMid.x - mx * newZ;
                    state.camera.y = newMid.y - my * newZ;
                    requestRender();'''
ts = ts.replace(old_pinch_move, new_pinch_move)

with open('src/components/CanvasView.tsx', 'w', encoding='utf-8') as f:
    f.write(ts)

print("Done")
