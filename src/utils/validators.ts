/**
 * Validation utilities for Docker Dashboard
 */

/**
 * Normalize a URL to ensure it has a protocol
 * Adds https:// if no protocol is present
 */
export function normalizeUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') return '';

  url = url.trim();

  // If it already has a protocol, return as is
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  // Add https:// by default
  return `https://${url}`;
}

/**
 * Check if a URL is valid
 * Must be http or https protocol
 */
export function isValidUrl(url: string | undefined | null): boolean {
  if (!url) return false;

  try {
    const normalized = normalizeUrl(url);
    const urlObj = new URL(normalized);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Clean a description string
 * Trims whitespace and removes double spaces
 */
export function cleanDescription(desc: string | undefined | null): string {
  if (!desc || typeof desc !== 'string') return '';
  return desc.trim().replace(/\s+/g, ' ');
}

/**
 * Check if a port number is valid
 * Must be between 1 and 65535
 */
export function isValidPort(port: string | number | undefined | null): boolean {
  if (!port) return false;
  const portNum = typeof port === 'string' ? parseInt(port, 10) : port;
  return !isNaN(portNum) && portNum > 0 && portNum <= 65535;
}

