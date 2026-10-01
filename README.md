# Docker Dashboard

A modern, responsive dashboard for managing your Docker containers. Create shortcuts (favorites) for your most used containers, organize them into sections, and access them quickly.

## Troubleshooting

> [!IMPORTANT]
> We are still on development and we are working on new features that can cause some issues with your current installation. Here are some common issues and how to fix them.

### Container not starting after update

If you see an error like `Cannot find module '/app/src/server.js'` after updating, your Docker has cached an old image. Force a fresh pull:

```bash
# Stop and remove the container
docker stop docker-dash
docker rm docker-dash

# Remove the cached image
docker rmi ghcr.io/incari/docker-dash:latest
# or for dev tag (experimental):
docker rmi ghcr.io/incari/docker-dash:dev

# Pull the fresh image
docker pull ghcr.io/incari/docker-dash:latest
#or for dev tag
docker pull ghcr.io/incari/docker-dash:dev

# Recreate the container
```

Then recreate the container from your Docker UI (Unraid, Portainer, etc.).

## Installation

## Running with Docker

### Using Docker Compose (Recommended)

Create a `docker-compose.yml` file:

```yaml
services:
  docker-dash:
    image: ghcr.io/incari/docker-dash:latest
    container_name: docker-dash
    restart: unless-stopped

    ports:
      - "3080:3000"

    volumes:
      # Mount Docker socket for container access
      - /var/run/docker.sock:/var/run/docker.sock:ro
      # Persistent data storage
      - ./data:/app/data

    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/app/data/dashboard.db
      - UPLOAD_DIR=/app/data/images
```

Then start the container:

```bash
docker-compose up -d
```

Access the dashboard at [http://localhost:3080](http://localhost:3080)

### Using Docker Run

Alternatively, run directly with Docker:

```bash
docker run -d \
  --name docker-dash \
  -p 3080:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v ./data:/app/data \
  -e NODE_ENV=production \
  -e PORT=3000 \
  ghcr.io/incari/docker-dash:latest
```

## Environment Variables

You can configure the application using environment variables. Create a `.env` file in the root directory (see `.env.example`).

| Variable        | Description                                    | Default                |
| :-------------- | :--------------------------------------------- | :--------------------- |
| `PORT`          | The port the backend server runs on.           | `3000`                 |
| `DOCKER_SOCKET` | Path to the Docker socket.                     | `/var/run/docker.sock` |
| `DOCKER_HOST`   | Reach Docker over TCP instead, e.g. through a socket proxy (`tcp://docker-socket-proxy:2375`). Wins over `DOCKER_SOCKET`. | _(unset)_ |
| `TRUST_PROXY`   | Number of reverse proxies in front of the app, so rate limits see the real client address. | _(unset)_ |
| `DB_PATH`       | Path to the SQLite database file.              | `./data/dashboard.db`  |
| `UPLOAD_DIR`    | Path to store uploaded images.                 | `./data/images`        |
| `NODE_ENV`      | Environment mode (`development`/`production`). | `production`           |
| `HOST_NAME`       | Name this machine goes by in the dashboard and when a hub asks. | container/host name |
| `API_KEY`         | Pins the key another dashboard must present to read this machine, and switches reading on. Leave unset to let the machine generate its own and switch it on from the dashboard. | _(unset)_ |
| `HOST_TIMEOUT_MS` | Hub only: how long to wait for a remote server before giving up on it. | `6000` |
| `HOST_CACHE_MS`   | Hub only: how long one read across all servers is reused. | `2000` |
| `HOST_DEADLINE_MS`  | Hub only: how long a read of all servers may take before answering with what has arrived. | `2000` |
| `AUTO_SYNC_INTERVAL_MS` | Hub only: the least time between two real auto-syncs. Cleared whenever a server is added, removed or re-pointed. | `60000` |
| `SHUTDOWN_GRACE_MS` | How long in-flight requests get after `SIGTERM` before the process exits anyway. | `8000` |

## Several servers, one dashboard

You can run Docker Dashboard on every machine you own and still open a single
page that lists, searches and controls all of their containers.

One installation is the **hub** - the dashboard you actually open. The others
just allow the hub to read them. No terminal and no secret to invent: each
installation generates its own API key and shows it to you.

> This is multi-**host**, not multi-tenancy. One dashboard reads many machines;
> it does not give different people different views of it. There are no user
> accounts anywhere in Docker Dashboard - see [Security](#security) below.

### 1. On the machine you want to read

Install Docker Dashboard as usual (see [docker-compose.agent.yml](docker-compose.agent.yml)),
open its dashboard, and in **Shortcuts** → **Servers** find the card for that
machine:

- Tick **let another dashboard read this server**.
- Its **API key** appears, with buttons to reveal, copy and replace it. Copy it.

Until you tick that box nothing is exposed: `/api/agent` answers 404 and the
installation is just a dashboard for its own machine, as before.

> Prefer to pin the key from your compose file or a secrets manager? Set
> `API_KEY` there instead. That switches reading on by itself, and the key can
> then only be changed there.

### 2. On the hub

1. Open the hub and go to **Shortcuts**.
2. In the **Servers** panel, click **Add server**.
3. Fill in a **name** (`NAS`), its **address** (`http://192.168.1.10:3080`, a
   Tailscale name, anything the hub can reach) and paste the **API key** you
   copied.
4. **Test** checks the address and the key before you save, so a typo is caught
   while the form is still open.
5. **Create**. That server's containers appear below, grouped under its name.

Each server card then reports whether it answered and how many containers it
has, so an unreachable machine says so instead of silently showing nothing.

### Which address to use

The address decides two separate things, which is why it is worth a minute:
whether the hub can reach the server at all, and where that server's port-based
shortcuts point. A shortcut for a container on the NAS opens the hostname taken
from this address, not the machine serving the dashboard.

Two things worth knowing before you pick one:

- **A LAN address is not always reachable, even on the same network.** Machines
  on different subnets or VLANs cannot see each other's LAN addresses, and the
  attempt does not fail - it hangs until it times out.
- **A mesh address works from anywhere.** With Tailscale or WireGuard, the
  address keeps working when you open the dashboard away from home, and so do
  the links it builds. A LAN address does not.

If the machines are on one flat network and you never open the dashboard from
outside, the LAN address is fine and marginally faster. Otherwise use the mesh
address. **Test** in the add-server form tells you which of the two works
before you commit to it.

### When a server is off

A server that refuses the connection - powered on, nothing listening - fails
instantly. One that is asleep, or behind a firewall that drops packets, does
not answer at all, and waiting for it would hold up every other server on every
refresh. So:

- A read of all servers answers within about two seconds with whatever has
  arrived. A server that misses that keeps its previous containers on screen
  while its request finishes in the background.
- After it fails, a server is skipped for a growing interval - five seconds,
  then ten, up to a minute - instead of being retried on every refresh.
- Its card carries a **Try again now** button, because a backoff is the wrong
  answer the moment you switch the machine back on.

`HOST_TIMEOUT_MS`, `HOST_DEADLINE_MS` and `HOST_CACHE_MS` tune this if your
network needs it.

### What lives where

- The hub holds all the shortcuts, sections and settings in its own database.
  Every shortcut records which server it belongs to.
- The other installations keep serving their own local dashboard on their own
  port; the hub never writes to them. It only lists containers and starts,
  stops and restarts them.
- Containers are grouped by server in the Shortcuts list, and search covers
  every server at once - typing a server's name narrows the list to that
  machine. Favourites stay ungrouped, with the server named on each card.
- Removing a server from the hub deletes its shortcuts on the hub. The server
  itself and its containers are untouched.
- Export and import carry the servers and each shortcut's server. Keys are
  never written to an export, so restored servers arrive switched off until you
  enter their key.

### Upgrading an installation that already has shortcuts

Nothing to do beyond pulling the new image. On first start the database is
migrated and every existing shortcut is filed under the local server, so the
dashboard looks exactly as it did before - the servers panel simply appears,
with one entry.

A copy of the database as it was is written next to it before anything is
rewritten (`dashboard.db.backup-premigration-*`), because migrations have no
undo. If you ever need to go back, stop the container, put that file back as
`dashboard.db`, and run the older image.

### Security

**This dashboard has no login.** Anyone who can open the page can start and
stop your containers. Run it on a private network, or behind a reverse proxy
that authenticates (Authelia, Caddy basic auth, Tailscale Serve, ...). That is
the intended deployment, not an extra.

What the app does on its own side:

- No cross-origin access. The API sends no CORS headers and the page cannot be
  framed, so a web page open in another tab cannot drive the dashboard.
- A content-security-policy that allows no inline scripts, so nothing that
  comes in through a URL, an icon or an import file can run as code.
- Uploaded icons are checked by extension, declared type and the bytes
  themselves, stored under generated names, and served with `nosniff` and a
  sandboxing policy. SVG is not accepted.
- Import files are validated field by field before anything is replaced.
- Rate limits on `/api/agent`, uploads, connection tests and imports.

The Docker socket is the asset to protect: whoever holds it is root on the
host, and the `:ro` on the bind mount does not change that. If you can, run the
dashboard behind a socket proxy with only the calls it needs -
[docker-compose.socket-proxy.yml](docker-compose.socket-proxy.yml) shows how.

The API key is the only thing standing between a caller and the ability to stop
containers on that machine, so:

- Prefer a private network for hub-to-server traffic - a LAN, a VPN or
  Tailscale - or put the server behind HTTPS. The key is sent as a bearer
  header, so plain HTTP over the open internet would expose it.
- If a key does leak, **Replace key** on that machine's own card issues a new
  one and locks out whoever held the old one.
- A machine's own key is shown in its own dashboard on purpose: that dashboard
  has no login and can already start and stop those containers. It is fetched
  only when you ask to see or copy it, never shown for a *remote* server, and
  never leaves the hub.
- A saved key is only ever sent to the address it was saved with. Changing a
  server's address asks for its key again.

## Running Locally

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/incari/docker-dash.git
    cd docker-dash
    ```

2.  **Install dependencies:**

    Install root dependencies (backend) and frontend dependencies:

    ```bash
    # Root (Backend)
    pnpm install

    # Frontend
    cd frontend
    pnpm install
    cd ..
    ```

## Running Locally

To run the application in development mode (which starts both backend and frontend concurrently):

```bash
pnpm dev
```

- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:3000](http://localhost:3000)

> **Note**: The backend needs access to the Docker socket (`/var/run/docker.sock`) to fetch container information. Ensure your user has permissions or run with necessary privileges if needed.

### Tailscale Support

For Tailscale IP detection (useful on Unraid/Linux hosts), use host network mode:

```yaml
services:
  docker-dash:
    image: ghcr.io/incari/docker-dash:latest
    container_name: docker-dash
    restart: unless-stopped
    network_mode: host # Use host network for Tailscale detection

    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./data:/app/data

    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/app/data/dashboard.db
      - UPLOAD_DIR=/app/data/images
```

> **Note**: With `network_mode: host`, the app will be available at `http://HOST_IP:3000` (not 3080).

## Features

### Container Management

- **Several servers, one dashboard**: Run Docker Dashboard on every machine and read them all from one page - containers grouped by server, search across the whole fleet, start/stop on the right machine. See [Several servers, one dashboard](#several-servers-one-dashboard).
- **Real-time Container Discovery**: Automatically detects and displays all running Docker containers on your server.
- **Container Controls**: Start, Stop, and Restart containers directly from the dashboard _note_ Editing the container to use a URL will still track the container to start/stop the container.
- **Quick Add from Containers**: Star icon on running containers to instantly create shortcuts
- **Port Detection**: Automatically detects exposed ports from running containers. _note_ Some container can use multiple ports, in this case you can select the port you want to use when you create the shortcut.
- **Auto-Icon Detection**: Automatically fetches container icons from [Homarr Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) library based on container name
- **Custom Icon Mappings**: Support for custom icons for specific containers (see [CUSTOM_DOCKER_ICONS.md](CUSTOM_DOCKER_ICONS.md))

### Smart Shortcuts System

- **Flexible URL Options**:
  - Link to container ports (auto-detects server IP)
  - Use custom URLs for external services
  - Tailscale IP detection for secure remote access
- **Customizable Appearance**:
  - Choose from icon library (Lucide React icons)
  - Use custom image URLs
  - **Upload your own images** with built-in image management
  - **Delete uploaded images** with confirmation dialog
  - Custom names and descriptions
  - Support for GIFs and SVG images
    ![Animated gift support](/public/gifs-support.gif "Gifs support")
- **Organization**: Group shortcuts into collapsible sections with drag-and-drop support
- **Multiple View Modes**: Switch between Compact, Icon, List, and Table views in Management page
- **Icon Migration Tool**: Bulk update container icons and descriptions from Homarr Dashboard Icons library

### Bookmarks

- **Bookmark your favorite websites**:
  - Add a name, description, url and icon
  - Choose from icon library (Lucide React icons)
  - Use custom image URLs
  - Same image management as shortcuts

### Advanced Features

- **Tailscale Integration**:
  - Automatically detects Tailscale IP addresses when using host network mode
  - Perfect for secure remote access to your homelab/server
  - Works seamlessly with Unraid and other Linux hosts
- **Drag & Drop Interface**:
  - Reorder shortcuts within sections
  - Move shortcuts between sections
  - Reorganize sections
  - Optimized for both mobile touch and desktop mouse interactions
- **Responsive Design**:
  - Mobile-first design with touch-friendly controls
  - Desktop hover actions for quick access
  - Adaptive layouts for all screen sizes
- **PWA Support**: Install as a Progressive Web App on mobile devices or desktop
- **Persistent Storage**: SQLite database for reliable data persistence across restarts

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [pnpm](https://pnpm.io/) (Package manager)
- [Docker](https://www.docker.com/) (Running locally for backend access)

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Framer Motion, @dnd-kit (Drag & Drop), i18next (Internationalization)
- **Backend**: Node.js, Express, Better-SQLite3 (for persistent data), Multer (file uploads)
- **Icons**: Lucide React

## Recent Updates

Check out the [CHANGELOG.md](CHANGELOG.md) for detailed information about recent features and improvements.

### Latest Features (2024)

- ✅ **Homarr Dashboard Icons Integration**: Automatic icon detection from the [Homarr Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) library
- ✅ **Custom Icon Mappings**: Support for custom container icons with priority over default library (see [CUSTOM_DOCKER_ICONS.md](CUSTOM_DOCKER_ICONS.md))
- ✅ **Icon Migration Tool**: Bulk update existing shortcuts with new icons and descriptions from Homarr library
- ✅ **Internationalization**: Full i18n support with English and Spanish translations
- ✅ **Image Upload & Management**: Upload custom images (PNG, JPG, GIF, SVG) with deletion support
- ✅ **Multiple View Modes**: Compact, Icon, List, and Table views in Management page
- ✅ **Enhanced Drag & Drop**: Improved visual feedback and touch support for mobile and desktop
- ✅ **Performance Optimizations**: React hooks optimization and better state management
- ✅ **TypeScript Improvements**: Better type safety and error handling
- ✅ **UI/UX Enhancements**: Improved dashboard organization and responsive design

[Feedback and features requests](https://tally.so/r/aQ2zNE)

### Roadmap

- More flexible UI card to display more information from the container and shortcut
- Add more filters to the management page
- Group by docker images that run multiple containers from the same image (like Docker Desktop does)
- Batch Creation: Efficiently create multiple shortcuts in one operation
- Dark/Light theme toggle
- Export/Import dashboard configuration
