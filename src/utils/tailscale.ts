/**
 * Tailscale detection utilities
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Detect Tailscale IP address using various methods
 * @returns The Tailscale IP or null if not available
 */
export async function getTailscaleIP(): Promise<string | null> {
  try {
    // Method 1: Try to get Tailscale IP using 'tailscale ip' command
    const { stdout } = await execAsync('tailscale ip -4 2>/dev/null');
    const ip = stdout.trim();
    if (ip && /^100\.\d+\.\d+\.\d+$/.test(ip)) {
      return ip;
    }
  } catch {
    // Tailscale command not found or not running
  }

  try {
    // Method 2: Check network interfaces for Tailscale IP (100.x.x.x range)
    const { stdout } = await execAsync('ip addr show 2>/dev/null || ifconfig 2>/dev/null');
    const match = stdout.match(/inet (100\.\d+\.\d+\.\d+)/);
    if (match) {
      return match[1];
    }
  } catch {
    // Network command failed
  }

  try {
    // Method 3: For Docker containers on Unraid - check host network
    const { stdout } = await execAsync('hostname -I 2>/dev/null');
    const ips = stdout.trim().split(/\s+/);
    const tailscaleIP = ips.find(ip => /^100\.\d+\.\d+\.\d+$/.test(ip));
    if (tailscaleIP) {
      return tailscaleIP;
    }
  } catch {
    // hostname command failed
  }

  try {
    // Method 4: Check /proc/net/fib_trie for Tailscale IPs (works in containers)
    const { stdout } = await execAsync('cat /proc/net/fib_trie 2>/dev/null');
    const matches = stdout.match(/100\.\d+\.\d+\.\d+/g);
    if (matches && matches.length > 0) {
      // Filter out broadcast addresses (ending in .255)
      const validIP = matches.find(ip => !ip.endsWith('.255') && !ip.endsWith('.0'));
      if (validIP) {
        return validIP;
      }
    }
  } catch {
    // /proc/net/fib_trie not available
  }

  return null;
}

