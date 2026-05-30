import re

with open('src/index.css', 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Fix Frost order in multiselect-toolbar
bad_frost = '''    backdrop-filter: blur(24px) saturate(150%);
    -webkit-backdrop-filter: blur(24px) saturate(150%);'''
good_frost = '''    background: rgba(255, 255, 255, 0.6);
    -webkit-backdrop-filter: blur(24px) saturate(150%);
    backdrop-filter: blur(24px) saturate(150%);'''
css = css.replace(bad_frost, good_frost)

# 2. Fix the red colors to be darker
old_red1 = 'background: rgba(255, 59, 48, 0.1);'
new_red1 = 'background: rgba(255, 59, 48, 0.2);'
css = css.replace(old_red1, new_red1)

old_red2 = 'background: rgba(255, 59, 48, 0.2);'
new_red2 = 'background: rgba(255, 59, 48, 0.4);'
css = css.replace(old_red2, new_red2)

with open('src/index.css', 'w', encoding='utf-8') as f:
    f.write(css)


with open('src/components/CanvasView.tsx', 'r', encoding='utf-8') as f:
    ts = f.read()

# 3. Fix Zoom Reset loophole
# We need to find the specific block in CanvasView.tsx
lines = ts.split('\n')
for i, line in enumerate(lines):
    if 'const scale = newDist / initialPinchDist;' in line:
        # We know state.camera.z = newZ is a few lines down
        for j in range(i, i+15):
            if 'state.camera.z = newZ;' in lines[j]:
                # If we haven't already inserted ANIMATION.targetZ = newZ;
                if 'ANIMATION.targetZ = newZ;' not in lines[j+1]:
                    lines.insert(j+1, '                    ANIMATION.targetZ = newZ;')
                break
        break

ts = '\n'.join(lines)

with open('src/components/CanvasView.tsx', 'w', encoding='utf-8') as f:
    f.write(ts)

print("Done")
