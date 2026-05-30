import re

# 1. Update index.css
with open('src/index.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Add touch-action: none to body
if 'touch-action: none;' not in css[:200]:
    css = css.replace('body {', 'body {\n    touch-action: none;\n    -webkit-touch-callout: none;')

# Fix multiselect-toolbar position
old_toolbar_pos = '''    top: max(16px, env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);'''
new_toolbar_pos = '''    bottom: calc(max(24px, env(safe-area-inset-bottom, 24px)) + 64px);
    left: 50%;
    transform: translateX(-50%);
    width: calc(100% - 48px);
    max-width: 400px;
    justify-content: space-between;'''
css = css.replace(old_toolbar_pos, new_toolbar_pos)

# Hide checkboxes by default, show when app has multiselect-mode
css = css.replace('.checkbox-overlay {', '.checkbox-overlay {\n    display: none;')
# Add the display flex rule
css += '\n#app.multiselect-mode .checkbox-overlay {\n    display: flex;\n}\n'

with open('src/index.css', 'w', encoding='utf-8') as f:
    f.write(css)


# 2. Update CanvasView.tsx
with open('src/components/CanvasView.tsx', 'r', encoding='utf-8') as f:
    ts = f.read()

# Add CHECKBOX_SVG to top
svg_def = '''
const LOCK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const CHECKBOX_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
'''
ts = ts.replace("const LOCK_ICON_SVG = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/></svg>`;", svg_def)

# Add state.isPanning = false; inside pointers.size === 2
old_pinch_start = '''            if (pointers.size === 2) {
                initialPinchDist = getPointersDist();
                initialPinchMid = getPointersMidpoint();
                initialCamera = { x: state.camera.x, y: state.camera.y, z: state.camera.z };
                state.isDragging = false;
                state.isLassoing = false;
                state.isResizing = false;
                if (state.dragStart) state.dragStart = null;
                if (state.resizeStart) state.resizeStart = null;'''

new_pinch_start = '''            if (pointers.size === 2) {
                initialPinchDist = getPointersDist();
                initialPinchMid = getPointersMidpoint();
                initialCamera = { x: state.camera.x, y: state.camera.y, z: state.camera.z };
                state.isDragging = false;
                state.isLassoing = false;
                state.isResizing = false;
                state.isPanning = false;
                if (state.dragStart) state.dragStart = null;
                if (state.resizeStart) state.resizeStart = null;'''
ts = ts.replace(old_pinch_start, new_pinch_start)

# Inject checkbox into innerHTML for both image types
old_text_html = '''                        el.innerHTML = `
                            <textarea class="text-node" spellcheck="false" placeholder="Type something...">${img.text || ''}</textarea>'''
new_text_html = '''                        el.innerHTML = `
                            <div class="checkbox-overlay">${CHECKBOX_SVG}</div>
                            <textarea class="text-node" spellcheck="false" placeholder="Type something...">${img.text || ''}</textarea>'''
ts = ts.replace(old_text_html, new_text_html)

old_img_html = '''                        el.innerHTML = `
                            <img src="${img.objectUrl}" draggable="false" />'''
new_img_html = '''                        el.innerHTML = `
                            <div class="checkbox-overlay">${CHECKBOX_SVG}</div>
                            <img src="${img.objectUrl}" draggable="false" />'''
ts = ts.replace(old_img_html, new_img_html)

# Add #app multiselect-mode class
old_app_div = '<div id="app">'
new_app_div = '<div id="app" className={stateRef.current.isMultiselectMode ? "multiselect-mode" : ""}>'
ts = ts.replace(old_app_div, new_app_div)

# Fix early return for TEXTAREA so it only triggers if focused
old_textarea_check = "if ((e.target as Element).tagName === 'TEXTAREA') return;"
new_textarea_check = "if ((e.target as Element).tagName === 'TEXTAREA' && document.activeElement === e.target) return;"
ts = ts.replace(old_textarea_check, new_textarea_check)

# Clean up the React JSX that was trying to render checkboxes incorrectly
bad_jsx1 = '''                        {stateRef.current.isMultiselectMode && (
                            <div className="checkbox-overlay">
                                {isSelected && <Check size={16} strokeWidth={3} />}
                            </div>
                        )}
                        <img
                                src={img.url || undefined}'''
ts = ts.replace(bad_jsx1, '<img src={img.url || undefined}')

bad_jsx2 = '''                        {stateRef.current.isMultiselectMode && (
                            <div className="checkbox-overlay">
                                {isSelected && <Check size={16} strokeWidth={3} />}
                            </div>
                        )}
                        <div
                                className="text-content"'''
ts = ts.replace(bad_jsx2, '<div className="text-content"')

with open('src/components/CanvasView.tsx', 'w', encoding='utf-8') as f:
    f.write(ts)

print("Done")
