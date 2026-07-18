import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { 
    AppState, CanvasState, ImageNodeData, Camera 
} from '../utils/db';
import { loadAppState, saveAppState, generateId, SETTINGS, loadImageBlob } from '../utils/db';
import { CanvasView } from './CanvasView';
import { Download, SlidersHorizontal, ChevronRight, Type, Trash2 } from 'lucide-react';

export default function App() {
    const [appState, setAppState] = useState<AppState | null>(null);
    const [showSwitcher, setShowSwitcher] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [nameInput, setNameInput] = useState("");
    const [gridVisible, setGridVisible] = useState(SETTINGS.gridVisible);
    const [showSettings, setShowSettings] = useState(false);
    const [nodeSpacing, setNodeSpacing] = useState(SETTINGS.spacing);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [toasts, setToasts] = useState<{id: string, message: string}[]>([]);

    const switcherRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const deleteTimeoutRef = useRef<number | null>(null);

    // Global click listener for closing dropdowns
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
                setShowSwitcher(false);
                setPendingDeleteId(null);
            }
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                setShowSettings(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Initial load
    useEffect(() => {
        const init = async () => {
            let state = await loadAppState();
            if (!state || !state.canvases.length) {
                const initCanvas: CanvasState = {
                    id: generateId(),
                    name: "Untitled",
                    images: [],
                    camera: { x: window.innerWidth / 2, y: window.innerHeight / 2, z: 1 },
                    updatedAt: Date.now()
                };
                state = { canvases: [initCanvas], activeId: initCanvas.id };
                await saveAppState(state);
            }

            // Clear all stale objectUrls from DB load as they are dead after page reload
            state.canvases.forEach(canvas => {
                canvas.images.forEach(img => {
                    img.objectUrl = undefined;
                });
            });

            // Restore object URLs for images in the active canvas
            const active = state.canvases.find(c => c.id === state.activeId) || state.canvases[0];
            for (const img of active.images) {
                if (img.type !== 'text') {
                    const blob = await loadImageBlob(img.blobId);
                    if (blob) img.objectUrl = URL.createObjectURL(blob);
                }
            }
            
            setAppState(state);
        };
        init();
    }, []);

    // Listen for DB errors
    useEffect(() => {
        const handleError = (e: any) => {
            const detail = e.detail || 'An unknown database error occurred.';
            const id = Math.random().toString(36).substr(2, 9);
            setToasts(prev => [...prev, { id, message: detail }]);
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 5000);
        };
        window.addEventListener('db-error', handleError);
        return () => window.removeEventListener('db-error', handleError);
    }, []);

    const activeCanvas = appState?.canvases.find(c => c.id === appState.activeId);

    const handleSaveRequested = useCallback((images: ImageNodeData[], camera: Camera) => {
        setAppState(prev => {
            if (!prev) return prev;
            const next = { ...prev };
            const canvasIdx = next.canvases.findIndex(c => c.id === prev.activeId);
            if (canvasIdx !== -1) {
                // To avoid React loop, we mutate lightly
                next.canvases[canvasIdx].images = images;
                next.canvases[canvasIdx].camera = camera;
                next.canvases[canvasIdx].updatedAt = Date.now();
                saveAppState(next);
            }
            return next;
        });
    }, []);

    const handleCreateCanvas = async () => {
        const newCanvas: CanvasState = {
            id: generateId(),
            name: "Untitled",
            images: [],
            camera: { x: window.innerWidth / 2, y: window.innerHeight / 2, z: 1 },
            updatedAt: Date.now()
        };
        
        const nextState = {
            canvases: [...appState!.canvases, newCanvas],
            activeId: newCanvas.id
        };
        
        await saveAppState(nextState);
        setAppState(nextState);
        setShowSwitcher(false);
    };

    const handleSwitchCanvas = async (id: string) => {
        if (id === appState!.activeId) {
            setShowSwitcher(false);
            return;
        }

        const nextState = { ...appState!, activeId: id };
        
        // Load object URLs for the newly active canvas
        const active = nextState.canvases.find(c => c.id === id)!;
        for (const img of active.images) {
            if (!img.objectUrl && img.type !== 'text') {
                const blob = await loadImageBlob(img.blobId);
                if (blob) img.objectUrl = URL.createObjectURL(blob);
            }
        }

        await saveAppState(nextState);
        setAppState(nextState);
        setShowSwitcher(false);
    };

    const handleDeleteCanvas = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (appState!.canvases.length <= 1) return;

        if (pendingDeleteId !== id) {
            setPendingDeleteId(id);
            if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
            deleteTimeoutRef.current = window.setTimeout(() => {
                setPendingDeleteId(null);
            }, 3000);
            return;
        }

        // Confirmed deletion
        if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
        setPendingDeleteId(null);

        let nextActiveId = appState!.activeId;
        if (id === nextActiveId) {
            const idx = appState!.canvases.findIndex(c => c.id === id);
            nextActiveId = appState!.canvases[idx === 0 ? 1 : 0].id;
        }

        const nextState = {
            canvases: appState!.canvases.filter(c => c.id !== id),
            activeId: nextActiveId
        };
        
        if (nextActiveId !== appState!.activeId) {
            const active = nextState.canvases.find(c => c.id === nextActiveId)!;
            for (const img of active.images) {
                if (!img.objectUrl && img.type !== 'text') {
                    const blob = await loadImageBlob(img.blobId);
                    if (blob) img.objectUrl = URL.createObjectURL(blob);
                }
            }
        }

        await saveAppState(nextState);
        setAppState(nextState);
    };

    const handleNameCommit = () => {
        setIsEditingName(false);
        const val = nameInput.trim() || "Untitled";
        if (val !== activeCanvas?.name) {
            setAppState(prev => {
                if (!prev) return prev;
                const next = { ...prev };
                const canvasIdx = next.canvases.findIndex(c => c.id === prev.activeId);
                if (canvasIdx !== -1) {
                    next.canvases[canvasIdx].name = val;
                    saveAppState(next);
                }
                return next;
            });
        }
    };


    const handleExportCanvas = async () => {
        if (!activeCanvas || activeCanvas.images.length === 0) return;

        const btnExport = document.getElementById('btn-export');
        if (btnExport) btnExport.style.opacity = '0.3';

        try {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let found = false;
            activeCanvas.images.forEach(img => {
                minX = Math.min(minX, img.x);
                minY = Math.min(minY, img.y);
                maxX = Math.max(maxX, img.x + img.w);
                maxY = Math.max(maxY, img.y + img.h);
                found = true;
            });

            if (!found) return;

            const box = {
                left: minX, right: maxX, top: minY, bottom: maxY,
                w: maxX - minX, h: maxY - minY
            };

            const spacing = SETTINGS.spacing; 
            const margin = spacing;
            const bottomMargin = Math.max(spacing * 5, 80);

            const outWidth = box.w + (margin * 2);
            const outHeight = box.h + margin + bottomMargin;

            const exportCanvasEl = document.createElement('canvas');
            const dpr = Math.max(window.devicePixelRatio || 1, 2);
            
            exportCanvasEl.width = outWidth * dpr;
            exportCanvasEl.height = outHeight * dpr;

            const ctx = exportCanvasEl.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);

            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim() || '#fbfbfb';
            ctx.fillRect(0, 0, outWidth, outHeight);

            const sortedImages = [...activeCanvas.images].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

            const loadPromises = sortedImages.map(imgData => {
                return new Promise((resolve) => {
                    if (imgData.type === 'text') {
                        resolve({ img: null, data: imgData });
                        return;
                    }
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => resolve({ img, data: imgData });
                    img.onerror = () => resolve({ img: null, data: imgData });
                    img.src = imgData.objectUrl || '';
                });
            });

            const loadedImages = await Promise.all(loadPromises) as any[];

            loadedImages.forEach(item => {
                const d = item.data;
                const drawX = (d.x - box.left) + margin;
                const drawY = (d.y - box.top) + margin;

                if (d.type === 'text') {
                    ctx.fillStyle = '#fff';
                    ctx.shadowColor = 'rgba(0,0,0,0.06)';
                    ctx.shadowBlur = 12;
                    ctx.shadowOffsetY = 4;
                    
                    if (ctx.roundRect) {
                        ctx.beginPath();
                        ctx.roundRect(drawX, drawY, d.w, d.h, 8);
                        ctx.fill();
                    } else {
                        ctx.fillRect(drawX, drawY, d.w, d.h);
                    }
                    
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetY = 0;
                    
                    ctx.font = '400 24px Parkinsans, sans-serif';
                    ctx.fillStyle = '#1c1c1e';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const text = d.text || '';
                    const lines = text.split('\n');
                    const lineHeight = 24 * 1.4;
                    let startY = drawY + (d.h / 2) - ((lines.length - 1) * lineHeight / 2);
                    lines.forEach((line: string) => {
                        ctx.fillText(line, drawX + (d.w / 2), startY);
                        startY += lineHeight;
                    });
                } else if (item.img) {
                    ctx.drawImage(item.img, drawX, drawY, d.w, d.h);
                }
            });

            ctx.textBaseline = 'top';
            const leftTextY = box.h + margin + (bottomMargin / 2) - 10.5; 

            ctx.font = '600 21px Parkinsans, sans-serif';
            ctx.fillStyle = 'rgba(28, 28, 30, 0.6)';
            ctx.textAlign = 'left';
            ctx.fillText(activeCanvas.name, margin, leftTextY);

            const rightTextY = box.h + margin + margin;
            ctx.font = '600 18px Parkinsans, sans-serif';
            ctx.fillStyle = 'rgba(28, 28, 30, 0.2)';
            ctx.textAlign = 'right';
            ctx.fillText('Klyra', outWidth - margin, rightTextY);

            exportCanvasEl.toBlob(blob => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${activeCanvas.name || 'Klyra-Export'}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 'image/png');

        } catch(e) {
            console.error("Export failed:", e);
        } finally {
            if (btnExport) btnExport.style.opacity = '';
        }
    };

    if (!appState || !activeCanvas) return null;

    const sortedCanvases = [...appState.canvases].sort((a, b) => b.updatedAt - a.updatedAt);

    return (
        <div style={{width: '100%', height: '100%'}}>
            <CanvasView 
                key={activeCanvas.id} 
                activeId={activeCanvas.id} 
                initialImages={activeCanvas.images} 
                initialCamera={activeCanvas.camera}
                onSaveRequested={handleSaveRequested} 
            />

            {/* UI Overlay */}
            <div id="ui">
                <div style={{ position: 'relative' }}>
                    <div className="logo">
                        <div className="logo-fallback">Klyra</div>
                        <div className="canvas-name-container" ref={switcherRef} style={{ position: 'relative' }}>
                            {!isEditingName ? (
                                <span 
                                    id="canvas-name-display" 
                                    onClick={() => {
                                        setNameInput(activeCanvas.name);
                                        setIsEditingName(true);
                                    }}
                                >
                                    {activeCanvas.name}
                                </span>
                            ) : (
                                <input 
                                    type="text" 
                                    id="canvas-name-input" 
                                    value={nameInput}
                                    onChange={e => setNameInput(e.target.value)}
                                    onFocus={e => e.target.select()}
                                    onBlur={handleNameCommit}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleNameCommit();
                                        if (e.key === 'Escape') setIsEditingName(false);
                                        e.stopPropagation();
                                    }}
                                    autoFocus
                                    spellCheck="false" 
                                    autoComplete="off" 
                                />
                            )}
                            <button 
                                id="btn-switcher-toggle" 
                                className={showSwitcher ? 'active' : ''}
                                onClick={() => setShowSwitcher(!showSwitcher)} 
                                title="Switch Boards"
                            >
                                <ChevronRight size={16} />
                            </button>
                            <div id="canvas-switcher" className={!showSwitcher ? 'hidden-ui' : ''}>
                                <div className="switcher-header">Your Boards</div>
                                <div id="canvas-list">
                                    {sortedCanvases.map(c => {
                                        const isActive = c.id === appState.activeId;
                                        const d = new Date(c.updatedAt);
                                        const timeStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric'}) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                                        
                                        return (
                                            <div 
                                                key={c.id} 
                                                className={`canvas-item ${isActive ? 'active' : ''}`}
                                                onClick={() => handleSwitchCanvas(c.id)}
                                            >
                                                <span>{c.name}</span>
                                                <span className="time">Last edited: {timeStr}</span>
                                                {appState.canvases.length > 1 && (
                                                    <button 
                                                        className={`btn-delete-board ${pendingDeleteId === c.id ? 'confirm-delete' : ''}`} 
                                                        onClick={(e) => handleDeleteCanvas(e, c.id)}
                                                    >
                                                        <Trash2 className="icon-trash" size={14} />
                                                        <span className="delete-text">Delete?</span>
                                                        <div className="delete-progress"></div>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="switcher-footer">
                                    <button className="btn" id="btn-new-board" onClick={handleCreateCanvas}>+ New Canvas</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }} ref={settingsRef}>
                    <div className="system-utils">
                        <button className="btn btn-icon" id="btn-export" data-tooltip="Export PNG" onClick={handleExportCanvas}>
                            <Download size={18} />
                        </button>
                        <div className="divider-vertical"></div>
                        <button id="btn-settings" data-tooltip="Settings" className={`btn btn-icon ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(!showSettings)}>
                            <SlidersHorizontal size={18} />
                        </button>
                    </div>
                    <div className={!showSettings ? 'hidden-ui' : ''} style={{
                        position: 'absolute', top: '100%', right: '0', marginTop: '8px',
                        background: 'rgba(255,255,255,0.6)', WebkitBackdropFilter: 'blur(24px) saturate(150%)', backdropFilter: 'blur(24px) saturate(150%)',
                        border: '1px solid rgba(0,0,0,0.06)', borderRadius: '24px', padding: '16px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)', zIndex: 2000, width: '220px',
                        display: 'flex', flexDirection: 'column', gap: '16px'
                    }}>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600 }}>
                            Grid View
                            <div className="toggle-switch">
                                <input type="checkbox" checked={gridVisible} onChange={e => {
                                    SETTINGS.gridVisible = e.target.checked;
                                    setGridVisible(e.target.checked);
                                    document.getElementById('viewport')?.classList.toggle('no-grid', !e.target.checked);
                                }} />
                                <span className="toggle-slider"></span>
                            </div>
                        </label>
                        <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.06)', margin: '0' }} />
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', fontWeight: 600 }}>
                            <span>Spacing: {nodeSpacing}px</span>
                            <input type="range" className="custom-range" min="2" max="20" step="2" value={nodeSpacing} onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                SETTINGS.spacing = val;
                                setNodeSpacing(val);
                            }} />
                        </label>
                    </div>
                </div>
            </div>
            <div id="creation-toolbar">
                <button className="btn" data-tooltip="Add Text" onClick={() => window.dispatchEvent(new CustomEvent('addTextNode'))}>
                    <Type size={18} />
                </button>
            </div>
            
            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className="toast">
                        {t.message}
                    </div>
                ))}
            </div>
        </div>
    );
}
