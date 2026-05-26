import localforage from 'localforage';

export const metadataStore = localforage.createInstance({
  name: 'klyra',
  storeName: 'metadata'
});

export const imageStore = localforage.createInstance({
  name: 'klyra',
  storeName: 'images'
});

export interface Camera { x: number; y: number; z: number }

export interface ImageNodeData {
    id: string;
    type?: 'image' | 'text';
    text?: string;
    blobId: string;
    x: number;
    y: number;
    w: number;
    h: number;
    aspect: number;
    objectUrl?: string; 
    locked?: boolean;
    zIndex?: number;
}

export interface CanvasState {
    id: string;
    name: string;
    images: ImageNodeData[];
    camera: Camera;
    updatedAt: number;
}

export interface AppState {
    canvases: CanvasState[];
    activeId: string | null;
}

export const SETTINGS = {
    spacing: 8,
    snapThreshold: 8,
    minZoom: 0.1,
    maxZoom: 4.0,
    gridVisible: true
};

export function generateId(): string {
    return 'id_' + Math.random().toString(36).substr(2, 9);
}

export async function saveAppState(appState: AppState) {
    try {
        await metadataStore.setItem('app_state', appState);
    } catch (e: any) {
        window.dispatchEvent(new CustomEvent('db-error', { detail: e.message || 'Failed to save application state.' }));
    }
}

export async function loadAppState(): Promise<AppState | null> {
    try {
        return await metadataStore.getItem<AppState>('app_state');
    } catch (e: any) {
        window.dispatchEvent(new CustomEvent('db-error', { detail: e.message || 'Failed to load application state.' }));
        return null;
    }
}

export async function saveImageBlob(blobId: string, blob: Blob) {
    try {
        await imageStore.setItem(blobId, blob);
    } catch (e: any) {
        window.dispatchEvent(new CustomEvent('db-error', { detail: e.message || 'Storage limit reached: Could not save image.' }));
    }
}

export async function loadImageBlob(blobId: string): Promise<Blob | null> {
    try {
        return await imageStore.getItem<Blob>(blobId);
    } catch (e: any) {
        window.dispatchEvent(new CustomEvent('db-error', { detail: e.message || 'Failed to load image.' }));
        return null;
    }
}

export async function deleteImageBlob(blobId: string) {
    try {
        await imageStore.removeItem(blobId);
    } catch (e: any) {
        console.error('Failed to delete image blob:', e);
    }
}
