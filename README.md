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
| `DB_PATH`       | Path to the SQLite database file.              | `./data/dashboard.db`  |
| `UPLOAD_DIR`    | Path to store uploaded images.                 | `./data/images`        |
| `NODE_ENV`      | Environment mode (`development`/`production`). | `production`           |
| `HOST_NAME`       | Name this machine's own Docker goes by in the dashboard. | container/host name |
| `HOST_TIMEOUT_MS` | How long to wait for a remote server before giving up on it. | `6000` |
| `HOST_CACHE_MS`   | How long one read across all servers is reused. | `2000` |
| `HOST_DEADLINE_MS`  | How long a read of all servers may take before answering with what has arrived. | `2000` |
| `AUTO_SYNC_INTERVAL_MS` | The least time between two real auto-syncs. Cleared whenever a server is added, removed or re-pointed. | `60000` |
| `SHUTDOWN_GRACE_MS` | How long in-flight requests get after `SIGTERM` before the process exits anyway. | `8000` |

## Several servers, one dashboard

One dashboard can list, search and control the containers of every machine you
own. Nothing of docker-dash is installed on the others: the dashboard talks to
each machine's Docker API directly, the same way `docker -H` does.

> This is multi-**host**, not multi-tenancy. One dashboard reads many machines;
> it does not give different people different views of it. There are no user
> accounts anywhere in Docker Dashboard - see [Security](#security) below.

There are two ways to reach a machine:

| Address | What the other machine needs | When |
| :--- | :--- | :--- |
| `ssh://user@machine` | Its usual `sshd`, and a user that can run `docker` | **Recommended.** The ssh key is the credential |
| `tcp://machine:2375` | A [socket proxy](docker-compose.socket-proxy.yml) | Machines already on a private network (Tailscale, WireGuard, an isolated VLAN) |

### The check that settles it

Whatever the dashboard can do, this command can do too, because it is exactly
what the dashboard runs. From the machine the dashboard runs on:

```bash
ssh user@machine docker version
```

If it prints a client and a server version, `ssh://user@machine` will work.

| What you see | What is missing |
| :--- | :--- |
| `Permission denied (publickey)` | The key is not authorised there. Run `ssh-copy-id` again |
| `command not found: docker` | `docker` is not on that user's `PATH` |
| `permission denied ... docker.sock` | The user is not in the `docker` group on that machine |
| `Host key verification failed` | The machine is not in `known_hosts` yet |

The same messages appear on the server's card in the dashboard, translated.

### Over ssh (recommended)

The dashboard hands each connection to the system `ssh` client, so
`known_hosts` and `~/.ssh/config` (host aliases, ports, `IdentityFile`) work
exactly as they do in your terminal. It never answers a prompt: an unknown host
key or a key with a passphrase fails instead of hanging.

1. **Give the dashboard a key of its own** *(once)*. A folder just for it keeps
   your personal keys out of the container, and is owned by root, which is who
   the dashboard runs as:

   ```bash
   sudo mkdir -p /opt/docker-dash/ssh
   sudo ssh-keygen -t ed25519 -N "" -C docker-dash -f /opt/docker-dash/ssh/id_ed25519
   ```

2. **Authorise it on every machine you want to add** *(per machine)*:

   ```bash
   sudo ssh-copy-id -i /opt/docker-dash/ssh/id_ed25519.pub user@machine
   ```

3. **Connect once by hand** *(per machine)*, so the machine lands in
   `known_hosts`, and run the check while you are there:

   ```bash
   sudo ssh -i /opt/docker-dash/ssh/id_ed25519 -o UserKnownHostsFile=/opt/docker-dash/ssh/known_hosts user@machine docker version
   ```

   If it complains about the socket, add that user to the `docker` group on
   the remote machine (`sudo usermod -aG docker user`, then log in again).

4. **Mount the folder** into the dashboard, read-only - see
   [docker-compose.yml](docker-compose.yml):

   ```yaml
   volumes:
     - /opt/docker-dash/ssh:/root/.ssh:ro
   ```

5. **Add the server.** In **Shortcuts** → **Servers**, click **Add server**,
   give it a name and the address `ssh://user@machine`. **Test** checks it
   before you save.

> Mounting your own `~/.ssh` instead works too, with one catch: ssh refuses a
> `config` file that is not owned by the user reading it, and inside the
> container that user is root.

### Through a socket proxy

On the **other** machine, run
[docker-compose.socket-proxy.yml](docker-compose.socket-proxy.yml), then check
it from the dashboard's machine:

```bash
docker -H tcp://machine:2375 version
```

and add the server as `tcp://machine:2375`.

> **This carries no authentication.** The proxy limits *which* parts of the
> Docker API are reachable, not *who* reaches them, and starting and stopping
> containers needs `CONTAINERS=1` and `POST=1` - which also allows creating
> one, and that is as good as root on that machine. Publish the port only on a
> network you trust, ideally bound to its Tailscale or WireGuard address, never
> on the internet. When in doubt, use ssh.

### Which address to use

The address decides two separate things: whether the dashboard can reach the
server at all, and where that server's port-based shortcuts point. A shortcut
for a container on the NAS opens the hostname taken from this address (or the
**Link hostname** you set on the server), not the machine serving the
dashboard.

- **A LAN address is not always reachable, even on the same network.** Machines
  on different subnets or VLANs cannot see each other's LAN addresses, and the
  attempt does not fail - it hangs until it times out.
- **A mesh address works from anywhere.** With Tailscale or WireGuard the
  address keeps working when you open the dashboard away from home, and so do
  the links it builds. Inside the container, MagicDNS names may not resolve;
  the `100.x` address always does.

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

- This dashboard holds all the shortcuts, sections and settings in its own
  database. Every shortcut records which server it belongs to.
- The other machines only run Docker. The dashboard lists their containers and
  starts, stops and restarts them; it never writes anything there.
- Containers are grouped by server in the Shortcuts list, and search covers
  every server at once - typing a server's name narrows the list to that
  machine. Favourites stay ungrouped, with the server named on each card.
- Removing a server deletes its shortcuts here. The server itself and its
  containers are untouched.
- Export and import carry the servers, by address, and each shortcut's server.
  There is no secret to leave out: the ssh key lives in the mounted folder.

### Upgrading an installation that already has shortcuts

Nothing to do beyond pulling the new image. On first start the database is
migrated: every existing shortcut stays filed under its server, so the
dashboard looks exactly as it did before.

If you had servers added through the old agent (an `http://` address and an
API key), they are kept - with their shortcuts, names and colours - but
switched off, because the new address cannot be worked out from the old one.
Edit each one, give it its `ssh://` or `tcp://` address, and switch it back on.
The agent's keys are deleted, and the docker-dash on those machines can be
removed.

A copy of the database as it was is written next to it before anything is
rewritten (`dashboard.db.backup-premigration-*`), because migrations have no
undo. If you ever need to go back, stop the container, put that file back as
`dashboard.db`, and run the older image.

### Security

- An ssh key that can reach a user in the `docker` group, or a socket proxy
  with `POST=1`, can do anything on that machine. Keep the key folder
  read-only and readable only by root, and the proxy port off the internet.
- The dashboard itself has no login. Keep it on a private network, or behind a
  reverse proxy that authenticates, exactly as with a single-server install -
  anyone who can open it can start and stop containers on every server it
  reads.

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
