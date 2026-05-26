# Klyra

Klyra is a local-first, infinite-canvas application designed for high-performance mood-boarding, diagramming, and spatial organization.

## Core Features

- **Infinite Canvas**: Unbounded panning and zooming for limitless spatial organization.
- **Local-First Architecture**: All data (including raw images and canvas state) is stored securely in your browser via IndexedDB. No cloud required.
- **Rich Media Support**: Drag-and-drop support for high-resolution images.
- **Text & Nodes**: Add editable text nodes with spatial arrangement capabilities.
- **Magnetic Snapping**: Precision alignment with automatic node-to-node snapping.
- **Advanced Selection**: Multi-select lasso tool and z-index ordering.
- **Undo/Redo System**: Robust discrete history tracking.

## Technology Stack

- **Framework**: React + TypeScript + Vite
- **Storage**: localforage (IndexedDB)
- **Styling**: Pure CSS (no external utility frameworks)
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Installation & Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Development Server**
   ```bash
   npm run dev
   ```

3. **Build for Production**
   ```bash
   npm run build
   ```

## Folder Structure

- `/src/components` - React UI and canvas rendering components
- `/src/utils` - Database, state management, and geometry helpers
- `/src/assets` - Static assets

## License

MIT
