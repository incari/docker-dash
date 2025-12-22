import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import axios from "axios";
import {
  X,
  Bookmark,
  Link as LinkIcon,
  Upload,
  Image as ImageIcon,
  CheckCircle,
  ChevronDown,
} from "lucide-react";
import type { ShortcutModalProps } from "../types";
import { DynamicIcon } from "./DynamicIcon";
import { AVAILABLE_ICONS } from "../constants/icons";
import { API_BASE } from "../constants/api";
import {
  isValidUrl,
  isValidPort,
  normalizeUrl,
  cleanDescription,
} from "../utils/validation";

interface FormData {
  name: string;
  description: string;
  port: string;
  url: string;
  icon: string;
  container_id: string;
  type: "port" | "url";
  use_tailscale: boolean;
}

/**
 * Modal for creating and editing shortcuts
 */
export const ShortcutModal: React.FC<ShortcutModalProps> = ({
  isOpen,
  shortcut,
  containers,
  tailscaleInfo,
  onSave,
  onClose,
  onError,
}) => {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    description: "",
    port: "",
    url: "",
    icon: "Server",
    container_id: "",
    type: "port",
    use_tailscale: false,
  });
  const [activeTab, setActiveTab] = useState<"icon" | "url" | "upload">("icon");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [urlError, setUrlError] = useState("");
  const [iconUrlError, setIconUrlError] = useState("");

  useEffect(() => {
    if (shortcut) {
      setFormData({
        name: shortcut.name || "",
        description: shortcut.description || "",
        port: shortcut.port?.toString() || "",
        url: shortcut.url || "",
        icon: shortcut.icon || "Server",
        container_id: shortcut.container_id || "",
        type: shortcut.url ? "url" : "port",
        use_tailscale:
          (shortcut as any).use_tailscale === 1 ||
          (shortcut as any).use_tailscale === true,
      });
      if (shortcut.icon?.startsWith("http")) setActiveTab("url");
      else if (shortcut.icon?.includes("/")) setActiveTab("upload");
      else setActiveTab("icon");
    } else {
      setFormData({
        name: "",
        description: "",
        port: "",
        url: "",
        icon: "Server",
        container_id: "",
        type: "port",
        use_tailscale: false,
      });
      setActiveTab("icon");
    }
    setSelectedFile(null);
  }, [shortcut, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError("");
    setIconUrlError("");

    // Validation
    if (formData.type === "port") {
      if (formData.port && !isValidPort(formData.port)) {
        onError(
          "Invalid Port Number",
          "Please enter a valid port number between 1 and 65535.\n\nNote: Port is optional for containers that don't expose any ports."
        );
        return;
      }
    } else {
      if (!formData.url || !isValidUrl(formData.url)) {
        setUrlError(
          "This is not a valid URL. Please enter a valid URL like example.com or https://example.com"
        );
        onError(
          "Invalid URL",
          "Please enter a valid URL.\n\nSupported formats:\n• example.com\n• www.example.com\n• http://example.com\n• https://example.com"
        );
        return;
      }
    }

    // Validate image URL if using URL tab
    if (activeTab === "url" && formData.icon) {
      if (!isValidUrl(formData.icon)) {
        setIconUrlError(
          "This is not a valid URL. Please enter a valid image URL like https://example.com/image.png"
        );
        onError(
          "Invalid Image URL",
          "Please enter a valid image URL.\n\nExample: https://example.com/image.png"
        );
        return;
      }
    }

    const data = new window.FormData();
    data.append("name", formData.name.trim());
    const cleanedDesc = cleanDescription(formData.description);
    if (cleanedDesc) {
      data.append("description", cleanedDesc);
    }

    if (formData.type === "port") {
      if (formData.port) {
        data.append("port", formData.port);
      }
      data.append("use_tailscale", String(formData.use_tailscale));
    } else {
      data.append("url", normalizeUrl(formData.url));
    }

    if (activeTab === "icon") data.append("icon", formData.icon);
    else if (activeTab === "url")
      data.append("icon", normalizeUrl(formData.icon));
    else if (activeTab === "upload" && selectedFile)
      data.append("image", selectedFile);
    else if (shortcut) data.append("icon", shortcut.icon || "Server");

    if (formData.container_id)
      data.append("container_id", formData.container_id);

    try {
      if (shortcut?.id) {
        await axios.put(`${API_BASE}/shortcuts/${shortcut.id}`, data);
      } else {
        await axios.post(`${API_BASE}/shortcuts`, data);
      }
      onSave();
      onClose();
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error ||
        "An unexpected error occurred while saving the shortcut.";
      onError("Error Saving Shortcut", errorMessage);
    }
  };

  const linkedContainer = containers.find(
    (c) => c.id === formData.container_id
  );
  const availablePorts =
    linkedContainer?.ports?.map((p) => p.public).filter(Boolean) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-slate-900 border border-white/10 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-800/20">
          <h2 className="text-xl font-bold text-white">
            {shortcut?.id ? "Edit Shortcut" : "Create New Shortcut"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-8 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar"
        >
          {/* Container Selection */}
          {!shortcut?.id && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">
                Link to Container (Optional)
              </label>
              <select
                value={formData.container_id}
                onChange={(e) => {
                  const c = containers.find((x) => x.id === e.target.value);
                  setFormData((prev) => ({
                    ...prev,
                    container_id: e.target.value,
                    name: c ? c.name : prev.name,
                    port: c ? c.ports[0]?.public?.toString() || "" : prev.port,
                  }));
                }}
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white appearance-none"
              >
                <option value="">Manual Entry</option>
                {containers.map((c) => (
                  <option
                    key={c.id}
                    value={c.id}
                  >
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">
                Display Name
              </label>
              <input
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g. Plex Media"
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white placeholder-slate-600"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">
                Connection Mode
              </label>
              <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: "port" })}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    formData.type === "port"
                      ? "bg-slate-800 text-white shadow-lg"
                      : "text-slate-500"
                  }`}
                >
                  LOCAL PORT
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: "url" })}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    formData.type === "url"
                      ? "bg-slate-800 text-white shadow-lg"
                      : "text-slate-500"
                  }`}
                >
                  WEB URL
                </button>
              </div>
            </div>
          </div>

          {/* Port/URL Input */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-300">
              {formData.type === "port" ? "Port Number" : "Target URL"}
              {formData.type === "port" && (
                <span className="text-xs text-slate-500 font-normal ml-2">
                  (Optional)
                </span>
              )}
            </label>
            {formData.type === "port" ? (
              <PortSelector
                availablePorts={availablePorts as number[]}
                port={formData.port}
                containerId={formData.container_id}
                onChange={(port) => setFormData({ ...formData, port })}
              />
            ) : (
              <UrlInput
                url={formData.url}
                urlError={urlError}
                onChange={(url) => {
                  setFormData({ ...formData, url });
                  setUrlError("");
                }}
                onBlur={() => {
                  if (formData.url && !isValidUrl(formData.url)) {
                    setUrlError(
                      "This is not a valid URL. Please enter a valid URL like example.com or https://example.com"
                    );
                  } else {
                    setUrlError("");
                  }
                }}
              />
            )}
          </div>

          {/* Tailscale Toggle - Only show for port mode */}
          {formData.type === "port" && tailscaleInfo.available && (
            <TailscaleToggle
              enabled={formData.use_tailscale}
              ip={tailscaleInfo.ip}
              onToggle={() =>
                setFormData({
                  ...formData,
                  use_tailscale: !formData.use_tailscale,
                })
              }
            />
          )}

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-300">
              Description
            </label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="What does this service do?"
              className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white resize-none"
            />
          </div>

          {/* Icon Selector */}
          <IconSelector
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            icon={formData.icon}
            setIcon={(icon) => setFormData({ ...formData, icon })}
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
            iconUrlError={iconUrlError}
            setIconUrlError={setIconUrlError}
          />

          {/* Buttons */}
          <div className="pt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-[2] py-4 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
            >
              {shortcut?.id ? "Update Shortcut" : "Create Shortcut"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// Sub-components

interface PortSelectorProps {
  availablePorts: number[];
  port: string;
  containerId: string;
  onChange: (port: string) => void;
}

const PortSelector: React.FC<PortSelectorProps> = ({
  availablePorts,
  port,
  containerId,
  onChange,
}) => {
  const [isCustom, setIsCustom] = useState(false);

  // Check if current port is not in the available ports list
  const isCurrentPortCustom = port && !availablePorts.includes(Number(port));
  const showCustomInput =
    isCustom || isCurrentPortCustom || availablePorts.length === 0;

  if (availablePorts.length > 0 && !showCustomInput) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            value={port}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setIsCustom(true);
                onChange("");
              } else {
                onChange(e.target.value);
              }
            }}
            className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white appearance-none"
          >
            <option value="">Select a port...</option>
            {availablePorts.map((p) => (
              <option
                key={p}
                value={p}
              >
                {p}
              </option>
            ))}
            <option value="__custom__">Custom port...</option>
          </select>
        </div>
        <p className="text-xs text-slate-500 pl-1">
          {availablePorts.length === 1
            ? "Container has 1 port available, or enter a custom port"
            : `Container has ${availablePorts.length} ports available, or enter a custom port`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="number"
          min="1"
          max="65535"
          value={port}
          onChange={(e) => onChange(e.target.value)}
          placeholder="8080 (leave empty if no port)"
          className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white"
        />
        {availablePorts.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setIsCustom(false);
              onChange(availablePorts[0]?.toString() || "");
            }}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 border border-white/10 rounded-xl text-sm text-slate-300 transition-colors whitespace-nowrap"
          >
            Use available
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 pl-1">
        {containerId
          ? availablePorts.length > 0
            ? "Enter custom port or use available ports"
            : "Container has no exposed ports"
          : "Leave empty for containers that don't expose ports"}
      </p>
    </div>
  );
};

interface UrlInputProps {
  url: string;
  urlError: string;
  onChange: (url: string) => void;
  onBlur: () => void;
}

const UrlInput: React.FC<UrlInputProps> = ({
  url,
  urlError,
  onChange,
  onBlur,
}) => (
  <>
    <input
      required
      type="text"
      value={url}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder="example.com or https://example.com"
      className={`w-full bg-slate-800 border ${
        urlError ? "border-red-500" : "border-white/10"
      } rounded-xl px-4 py-3 focus:outline-none focus:ring-2 ${
        urlError ? "focus:ring-red-500" : "focus:ring-blue-500"
      } transition-all text-white`}
    />
    {!urlError && (
      <p className="text-xs text-slate-500 pl-1">
        Supports: example.com, www.example.com, http://example.com,
        https://example.com
      </p>
    )}
    {urlError && (
      <p className="text-xs text-red-400 pl-1 flex items-center gap-1">
        <span>⚠</span> {urlError}
      </p>
    )}
  </>
);

interface TailscaleToggleProps {
  enabled: boolean;
  ip: string | null;
  onToggle: () => void;
}

const TailscaleToggle: React.FC<TailscaleToggleProps> = ({
  enabled,
  ip,
  onToggle,
}) => (
  <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-300">
            Use Tailscale IP
          </label>
          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
            {ip}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Access this service via your Tailscale network instead of local IP
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative w-14 h-7 rounded-full transition-colors ${
          enabled ? "bg-blue-600" : "bg-slate-700"
        }`}
      >
        <div
          className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
            enabled ? "translate-x-7" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  </div>
);

interface IconDropdownProps {
  icon: string;
  setIcon: (icon: string) => void;
}

const IconDropdown: React.FC<IconDropdownProps> = ({ icon, setIcon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({
    top: 0,
    left: 0,
    width: 0,
    openUpward: false,
  });
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Sort icons alphabetically
  const sortedIcons = Object.keys(AVAILABLE_ICONS).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = 256; // max-h-64 = 16rem = 256px
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      // Open upward if not enough space below but enough above
      const openUpward =
        spaceBelow < dropdownHeight + 8 && spaceAbove > spaceBelow;

      setDropdownPos({
        top: openUpward ? rect.top - dropdownHeight - 8 : rect.bottom + 8,
        left: rect.left,
        width: rect.width,
        openUpward,
      });
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Update position when opening or on scroll/resize
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  return (
    <div className="w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between hover:border-white/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
            <DynamicIcon
              name={icon}
              className="w-5 h-5 text-white"
            />
          </div>
          <span className="text-white">{icon}</span>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
            }}
            className="z-[100] bg-slate-800 border border-white/10 rounded-xl shadow-2xl max-h-64 overflow-y-auto custom-scrollbar"
          >
            {sortedIcons.map((iconKey) => (
              <button
                key={iconKey}
                type="button"
                onClick={() => {
                  setIcon(iconKey);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-700 transition-colors ${
                  icon === iconKey
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-white"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    icon === iconKey ? "bg-blue-600/30" : "bg-slate-700"
                  }`}
                >
                  <DynamicIcon
                    name={iconKey}
                    className="w-5 h-5"
                  />
                </div>
                <span className="text-sm">{iconKey}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};

interface IconSelectorProps {
  activeTab: "icon" | "url" | "upload";
  setActiveTab: (tab: "icon" | "url" | "upload") => void;
  icon: string;
  setIcon: (icon: string) => void;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  iconUrlError: string;
  setIconUrlError: (error: string) => void;
}

const IconSelector: React.FC<IconSelectorProps> = ({
  activeTab,
  setActiveTab,
  icon,
  setIcon,
  selectedFile,
  setSelectedFile,
  iconUrlError,
  setIconUrlError,
}) => (
  <div className="space-y-4 pt-2">
    <label className="text-sm font-semibold text-slate-300">
      Identity & Branding
    </label>
    <div className="flex gap-2 p-1 bg-slate-950 rounded-xl border border-white/10">
      {(["icon", "url", "upload"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setActiveTab(t)}
          className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === t
              ? "bg-slate-800 text-white"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          {t === "icon" && <Bookmark className="w-3 h-3" />}
          {t === "url" && <LinkIcon className="w-3 h-3" />}
          {t === "upload" && <Upload className="w-3 h-3" />}
          {t}
        </button>
      ))}
    </div>

    <div className="bg-slate-950/50 rounded-2xl p-6 border border-white/5 min-h-20 flex items-center justify-center">
      {activeTab === "icon" && (
        <IconDropdown
          icon={icon}
          setIcon={setIcon}
        />
      )}

      {activeTab === "url" && (
        <div className="w-full space-y-3">
          <div
            className={`flex items-center gap-3 bg-slate-800 border ${
              iconUrlError ? "border-red-500" : "border-white/10"
            } rounded-xl px-4 py-3`}
          >
            <LinkIcon className="w-5 h-5 text-slate-500" />
            <input
              type="text"
              className="bg-transparent flex-1 focus:outline-none text-white text-sm"
              placeholder="Enter or paste image URL..."
              value={activeTab === "url" ? icon : ""}
              onChange={(e) => {
                setIcon(e.target.value);
                setIconUrlError("");
              }}
              onBlur={(e) => {
                if (e.target.value && !isValidUrl(e.target.value)) {
                  setIconUrlError(
                    "This is not a valid URL. Please enter a valid image URL like https://example.com/image.png"
                  );
                } else {
                  setIconUrlError("");
                }
              }}
            />
          </div>
          {!iconUrlError && (
            <p className="text-[10px] text-slate-500 pl-1 italic">
              Prefer direct links to PNG/SVG assets.
            </p>
          )}
          {iconUrlError && (
            <p className="text-xs text-red-400 pl-1 flex items-center gap-1">
              <span>⚠</span> {iconUrlError}
            </p>
          )}
        </div>
      )}

      {activeTab === "upload" && (
        <label className="w-full h-24 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/[0.02] transition-colors group">
          <input
            type="file"
            className="hidden"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
          {selectedFile ? (
            <div className="flex flex-col items-center text-green-400">
              <CheckCircle className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium truncate max-w-[200px]">
                {selectedFile.name}
              </span>
            </div>
          ) : (
            <>
              <ImageIcon className="w-6 h-6 text-slate-500 group-hover:text-blue-500 mb-1 transition-colors" />
              <span className="text-xs text-slate-500 group-hover:text-slate-300">
                Choose local asset
              </span>
            </>
          )}
        </label>
      )}
    </div>
  </div>
);
