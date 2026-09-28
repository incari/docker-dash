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
            ports: [{ private: 80, public: 8080, type: "tcp" }],
            composeProject: null,
            composeService: null,
            hostId: 1,
            hostName: "Local"
        }
    ],
    hosts: [
        {
            id: 1,
            name: "Local",
            type: "local" as const,
            url: null,
            hostname: null,
            color: null,
            position: 0,
            enabled: true,
            has_api_key: false,
            status: {
                online: true,
                checked_at: null,
                container_count: 1,
                error: null,
                error_code: null,
                failures: 0,
                retry_after: null
            }
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
        const saveButton = screen.getByRole('button', { name: /^Create$/i });
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

    it('keeps the whole form when hosts revalidate (new array identity)', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<ShortcutModal {...mockProps} />);

        const nameInput = screen.getByPlaceholderText('e.g. Plex Media');
        await user.type(nameInput, 'My App');

        await user.click(screen.getByText('WEB URL'));
        const urlInput = screen.getByPlaceholderText('example.com or https://example.com');
        await user.type(urlInput, 'http://');

        // SWR revalidation returns a new array identity with the same content.
        // This used to wipe the entire form while the user was typing.
        rerender(<ShortcutModal {...mockProps} hosts={[...mockProps.hosts]} />);

        expect(screen.getByPlaceholderText('e.g. Plex Media')).toHaveValue('My App');
        expect(screen.getByPlaceholderText('example.com or https://example.com')).toHaveValue('http://');
    });

    it('keeps an invalid icon URL visible instead of clearing the field', async () => {
        const user = userEvent.setup();
        render(<ShortcutModal {...mockProps} />);

        // Open the icon "URL" tab (Icon / URL / Upload)
        await user.click(screen.getByRole('button', { name: 'URL' }));

        const iconUrlInput = screen.getByPlaceholderText('Enter or paste image URL...');
        await user.type(iconUrlInput, 'not a valid url');

        expect(iconUrlInput).toHaveValue('not a valid url');
    });
});
