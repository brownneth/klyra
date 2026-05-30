import sys
with open('src/components/CanvasView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('NodeJS.Timeout', 'ReturnType<typeof setTimeout>')
content = content.replace("type: 'text', content:", "type: 'text' as const, content:")
content = content.replace('saveImages(stateRef.current.images);', 'onSaveRequested();')
content = content.replace('const handleCustomPaste = async (e: CustomEvent) => {', 'const handleCustomPaste = async (e: Event) => { const ev = e as CustomEvent;')
content = content.replace('e.detail.x', 'ev.detail.x').replace('e.detail.y', 'ev.detail.y')
content = content.replace('as EventListener', '')

with open('src/components/CanvasView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
