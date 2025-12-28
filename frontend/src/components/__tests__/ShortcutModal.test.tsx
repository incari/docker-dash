import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShortcutModal } from '../ShortcutModal';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');

// Mock components that might cause issues in JSDOM or are not the focus
vi.mock('../DynamicIcon', () => ({
    DynamicIcon: () => <div data-testid="dynamic-icon" />
}));

const mockProps = {
    isOpen: true,
    shortcut: null,
    containers: [
        {
            id: "123",
            name: "test-container",
            image: "test-image",
            state: "running",
            status: "Up 2 hours",
            ports: [{ private: 80, public: 8080, type: "tcp" }]
        }
    ],
    tailscaleInfo: { available: true, enabled: true, ip: "100.100.100.100" },
    onSave: vi.fn(),
    onClose: vi.fn(),
    onError: vi.fn(),
};

describe('ShortcutModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders correctly when open', () => {
        render(<ShortcutModal {...mockProps} />);
        expect(screen.getByText('Create New Shortcut')).toBeInTheDocument();
        expect(screen.getByLabelText('Display Name')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
        const { container } = render(<ShortcutModal {...mockProps} isOpen={false} />);
        expect(container).toBeEmptyDOMElement();
    });



    it('submits form with valid data', async () => {
        const user = userEvent.setup();
        (axios.post as any).mockResolvedValue({ data: { success: true } });
        render(<ShortcutModal {...mockProps} />);

        const nameInput = screen.getByPlaceholderText('e.g. Plex Media');
        await user.clear(nameInput);
        await user.type(nameInput, 'My App');

        const portInput = screen.getByPlaceholderText('8080 (leave empty if no port)');
        await user.clear(portInput);
        await user.type(portInput, '9000');

        // Find submit button by text
        const saveButton = screen.getByRole('button', { name: /Create Shortcut/i });
        await user.click(saveButton);

        await waitFor(() => {
            expect(axios.post).toHaveBeenCalled();
            expect(mockProps.onSave).toHaveBeenCalled();
        });
    });

    it('switches between URL and Port mode', async () => {
        const user = userEvent.setup();
        render(<ShortcutModal {...mockProps} />);

        const urlBtn = screen.getByText('WEB URL');
        await user.click(urlBtn);

        expect(screen.getByText('Target URL')).toBeInTheDocument();

        const portBtn = screen.getByText('LOCAL PORT');
        await user.click(portBtn);

        expect(screen.getByText('Port Number')).toBeInTheDocument();
    });

    it('validates URL format', async () => {
        const user = userEvent.setup();
        render(<ShortcutModal {...mockProps} />);

        await user.click(screen.getByText('WEB URL'));

        const urlInput = screen.getByPlaceholderText('example.com or https://example.com');
        await user.type(urlInput, 'http://');
        await user.tab(); // Trigger blur

        expect(await screen.findByText(/This is not a valid URL/i)).toBeInTheDocument();
    });
});
