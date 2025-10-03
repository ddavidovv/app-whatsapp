# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WhatsApp messaging template tester application built with React + TypeScript + Vite. The app allows testing WhatsApp UTILITY templates by loading shipment data, filling placeholders, and simulating message sending with real-time activity feed.

## Commands

### Development
- `npm install` - Install dependencies
- `npm run dev` - Start development server (Vite)
- `npm run build` - Build for production (runs TypeScript compiler + Vite build)
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint (checks .ts and .tsx files)

### Environment Setup
Create `.env.local` file with the following variables (all prefixed with `VITE_` for Vite):
- `VITE_API_BASE_URL` - Base URL for backend API
- `VITE_PROVIDER_API_BASE` - WhatsApp provider API base URL
- `VITE_PROVIDER_API_VERSION` - WhatsApp provider API version
- `VITE_PROVIDER_SENDER_ID` - WhatsApp sender ID
- `VITE_WEBHOOK_VERIFY_TOKEN` - Webhook verification token
- `VITE_BACKEND_BASE_URL` - Backend base URL

## Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **State Management**: React hooks (useState, useEffect, useMemo, useCallback)

### Key Components & Structure

**Main Application** (`src/App.tsx`):
- Single-page application with two-panel layout
- Left panel: Template selection, shipment loading, placeholder filling
- Right panel: Message preview and activity feed
- Uses custom `useEventSource` hook for real-time message updates

**API Layer** (`src/services/api.ts`):
- Currently uses mock data (MOCK_TEMPLATES, MOCK_SHIPMENT_DATA)
- Three main functions: `fetchTemplates()`, `fetchShipment(shippingCode)`, `sendMessage()`
- Filters only UTILITY category templates
- Simulates API delays and potential failures

**Real-time Updates** (`src/hooks/useEventSource.ts`):
- Custom hook for handling incoming messages
- Currently mocked with setInterval (15-20 second intervals)
- Contains commented-out real EventSource/SSE implementation ready to be enabled

**Type Definitions** (`src/types.ts`):
- `Template` - WhatsApp template structure with placeholderMapping
- `Shipment` - Shipment/order data structure
- `MessageLog` - Message with direction, status tracking
- `Placeholder` - Form placeholder with key-value mapping

**Configuration** (`src/config.ts`):
- Centralizes all environment variables from Vite
- Defines API endpoints structure
- Export `config` object for use across the app

### Import Alias
- `@/` maps to `src/` directory (configured in vite.config.ts)
- Example: `import { Template } from '@/types'`

### Message Flow
1. User selects template (filtered to UTILITY only)
2. Loads shipment data by shipping code
3. Placeholders auto-populate from shipment data via `placeholderMapping`
4. Preview shows message with filled placeholders
5. Send creates outgoing message → updates status based on API response
6. Activity feed displays both outgoing and incoming messages with status indicators

### Styling Notes
- Uses Tailwind with custom brand colors: `brand-red`, `brand-red-dark`
- Responsive design with `lg:` breakpoints for two-column layout
- Message bubbles styled differently for incoming (gray) vs outgoing (brand red)
- Status indicators: sending (…), sent (✓), delivered (✓✓), read (✓✓ blue), failed (✗ red)

## Development Notes

### Backend Integration
When connecting to real backend:
1. Update `.env.local` with actual API URLs
2. Replace mock implementations in `src/services/api.ts`
3. Uncomment real EventSource implementation in `src/hooks/useEventSource.ts`

### WhatsApp Template Constraints
- Only UTILITY templates are supported (filtered in `fetchTemplates`)
- Templates use {{1}}, {{2}} placeholder format
- Placeholders map to shipment data fields via `placeholderMapping` array
