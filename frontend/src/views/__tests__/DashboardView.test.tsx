import { render, screen } from '@testing-library/react';
import { DashboardView } from '../DashboardView';
import { vi, describe, it, expect } from 'vitest';

// Create a valid DndContext mock since DashboardView renders DndContext
vi.mock('@dnd-kit/core', async () => {
    const actual = await vi.importActual('@dnd-kit/core');
    return {
        ...actual,
        DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        DragOverlay: () => null,
    };
});

// Mock SortableContext
vi.mock('@dnd-kit/sortable', () => ({
    SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    verticalListSortingStrategy: {},
    rectSortingStrategy: {},
}));

const mockProps = {
    isEditMode: false,
    dashboardShortcuts: [],
    unsectionedShortcuts: [],
    sections: [],
    shortcutsBySection: {},
    containers: [],
    tailscaleInfo: { available: false, ip: null, enabled: false },
    sensors: undefined,
    customCollisionDetection: undefined,
    activeId: null,
    shortcuts: [],
    loading: false,
    handleDragStart: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragCancel: vi.fn(),
    handleCreateSection: vi.fn(),
    handleEditSection: vi.fn(),
    handleDeleteSection: vi.fn(),
    handleToggleSection: vi.fn(),
    openEditModal: vi.fn(),
    handleDelete: vi.fn(),
    handleStart: vi.fn(),
    handleStop: vi.fn(),
    handleRestart: vi.fn(),
    handleToggleFavorite: vi.fn(),
    setView: vi.fn(),
} as any;

describe('DashboardView', () => {
    it('renders empty state correctly', () => {
        render(<DashboardView {...mockProps} />);
        expect(screen.getByText('No favorites found')).toBeInTheDocument();
        expect(screen.getByText(/Star your containers or URLs/i)).toBeInTheDocument();
    });

    it('renders shortcuts when provided', () => {
        const shortcuts = [{
            id: 1,
            name: 'Test Shortcut',
            description: 'Test Desc',
            icon: 'Server',
            url: 'http://test',
            port: 8080,
            container_id: '123',
            is_favorite: 1,
            section_id: null
        }];

        render(<DashboardView {...mockProps} dashboardShortcuts={shortcuts} unsectionedShortcuts={shortcuts} />);

        const items = screen.getAllByText('Test Shortcut');
        expect(items.length).toBeGreaterThan(0);
    });
});
