import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  X,
  Bookmark,
  LinkIcon,
  Upload,
  ImageIcon,
  CheckCircle,
  ChevronDown,
  Trash2,
} from "../constants/icons";
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
import { uploadsApi, type UploadedImage } from "../services/api";
import { getContainerIcon } from "../utils/dockerIconVault";

interface FormData {
  display_name: string;
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
  const { t } = useTranslation();
  const [formData, setFormData] = useState<FormData>({
    display_name: "",
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
  const [hasManuallySelectedIcon, setHasManuallySelectedIcon] = useState(false);

  useEffect(() => {
    if (shortcut) {
      setFormData({
        display_name: shortcut.display_name || "",
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
      // Mark as manually selected if editing existing shortcut
      setHasManuallySelectedIcon(true);
    } else {
      setFormData({
        display_name: "",
        description: "",
        port: "",
        url: "",
        icon: "Server",
        container_id: "",
        type: "port",
        use_tailscale: false,
      });
      setActiveTab("icon");
      setHasManuallySelectedIcon(false);
    }
    setSelectedFile(null);
  }, [shortcut, isOpen]);

  // Add ESC key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  // Auto-fetch favicon for website URLs
  useEffect(() => {
    // Only auto-fetch if:
    // 1. Type is "url" (custom URL, not port)
    // 2. User hasn't manually selected an icon
    // 3. URL is valid
    if (
      formData.type === "url" &&
      !hasManuallySelectedIcon &&
      formData.url &&
      isValidUrl(formData.url)
    ) {
      try {
        const urlObj = new URL(
          formData.url.startsWith("http")
            ? formData.url
            : `https://${formData.url}`,
        );
        // Use the website's native favicon.ico
        const faviconUrl = `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;

        // Set the favicon as the icon
        setFormData((prev) => ({
          ...prev,
          icon: faviconUrl,
        }));

        // Set active tab to URL since we're using a URL-based icon
        setActiveTab("url");
      } catch (error) {
        // Invalid URL, do nothing
        console.error("Failed to extract domain for favicon:", error);
      }
    }
  }, [formData.type, formData.url, hasManuallySelectedIcon]);

  if (!isOpen) return null;

  // Memoize computed values to avoid recalculation on every render
  const linkedContainer = useMemo(
    () => containers.find((c) => c.id === formData.container_id),
    [containers, formData.container_id],
  );

  const availablePorts = useMemo(
    () => linkedContainer?.ports?.map((p) => p.public).filter(Boolean) || [],
    [linkedContainer],
  );

  // Memoize form submission handler
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setUrlError("");
      setIconUrlError("");

      // Validation
      if (formData.type === "port") {
        if (formData.port && !isValidPort(formData.port)) {
          onError(
            t("validation.invalidPort"),
            `${t("validation.invalidPort")}\n\n${t("validation.invalidPortNote")}`,
          );
          return;
        }
      } else {
        if (!formData.url || !isValidUrl(formData.url)) {
          setUrlError(t("validation.invalidUrl"));
          onError(t("validation.invalidUrl"), t("validation.invalidUrl"));
          return;
        }
      }

      // Validate image URL if using URL tab
      if (activeTab === "url" && formData.icon) {
        if (!isValidUrl(formData.icon)) {
          setIconUrlError(t("validation.invalidImageUrl"));
          onError(
            t("validation.invalidImageUrl"),
            t("validation.invalidImageUrl"),
          );
          return;
        }
      }

      const data = new window.FormData();
      data.append("display_name", formData.display_name.trim());
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
          err.response?.data?.error || t("modals.error.unexpectedError");
        onError(t("modals.error.savingShortcut"), errorMessage);
      }
    },
    [formData, activeTab, selectedFile, shortcut, onSave, onClose, onError, t],
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
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
            {shortcut?.id
              ? t("shortcuts.editShortcut")
              : t("shortcuts.createNew")}
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
                {t("shortcuts.linkToContainer")}
              </label>
              <select
                value={formData.container_id}
                onChange={(e) => {
                  const c = containers.find((x) => x.id === e.target.value);
                  const newIcon = c
                    ? getContainerIcon(c.name, "Server")
                    : "Server";
                  setFormData((prev) => ({
                    ...prev,
                    container_id: e.target.value,
                    display_name: c ? c.name : prev.display_name,
                    port: c ? c.ports[0]?.public?.toString() || "" : prev.port,
                    // Auto-select icon from docker-icon-vault based on container name
                    icon: newIcon,
                  }));
                  // Mark as manually selected when selecting a container
                  if (c) {
                    setHasManuallySelectedIcon(true);
                  }
                  // Switch to URL tab if icon is from vault, otherwise icon tab
                  if (newIcon.startsWith("http")) {
                    setActiveTab("url");
                  } else {
                    setActiveTab("icon");
                  }
                }}
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white appearance-none"
              >
                <option value="">{t("shortcuts.manualEntry")}</option>
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
              <label
                htmlFor="display-name"
                className="text-sm font-semibold text-slate-300"
              >
                {t("shortcuts.displayName")}
              </label>
              <input
                id="display-name"
                required
                value={formData.display_name}
                onChange={(e) =>
                  setFormData({ ...formData, display_name: e.target.value })
                }
                placeholder={t("shortcuts.displayNamePlaceholder")}
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white placeholder-slate-600"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">
                {t("shortcuts.connectionMode")}
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
                  {t("shortcuts.localPort")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, type: "url" });
                    // Reset manual selection flag when switching to URL type
                    // This allows auto-fetch of favicon
                    setHasManuallySelectedIcon(false);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    formData.type === "url"
                      ? "bg-slate-800 text-white shadow-lg"
                      : "text-slate-500"
                  }`}
                >
                  {t("shortcuts.webUrl")}
                </button>
              </div>
            </div>
          </div>

          {/* Port/URL Input */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-300">
              {formData.type === "port"
                ? t("shortcuts.portNumber")
                : t("shortcuts.targetUrl")}
              {formData.type === "port" && (
                <span className="text-xs text-slate-500 font-normal ml-2">
                  ({t("common.optional")})
                </span>
              )}
            </label>
            {formData.type === "port" ? (
              <PortSelector
                availablePorts={availablePorts as number[]}
                port={formData.port}
                containerId={formData.container_id}
                onChange={(port) => setFormData({ ...formData, port })}
                t={t}
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
                    setUrlError(t("validation.invalidUrl"));
                  } else {
                    setUrlError("");
                  }
                }}
                t={t}
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
              t={t}
            />
          )}

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-300">
              {t("shortcuts.descriptionLabel")}
            </label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder={t("shortcuts.descriptionPlaceholder")}
              className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white resize-none"
            />
          </div>

          {/* Icon Selector */}
          <IconSelector
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            icon={formData.icon}
            setIcon={(icon) => {
              setFormData({ ...formData, icon });
              setHasManuallySelectedIcon(true);
            }}
            selectedFile={selectedFile}
            setSelectedFile={(file) => {
              setSelectedFile(file);
              if (file) {
                setHasManuallySelectedIcon(true);
              }
            }}
            iconUrlError={iconUrlError}
            setIconUrlError={setIconUrlError}
            t={t}
          />

          {/* Buttons */}
          <div className="pt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="flex-[2] py-4 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
            >
              {shortcut?.id ? t("common.save") : t("common.create")}
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
  t: (key: string) => string;
}

const PortSelector: React.FC<PortSelectorProps> = ({
  availablePorts,
  port,
  containerId,
  onChange,
  t,
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
            <option value="">{t("shortcuts.selectPort")}</option>
            {availablePorts.map((p) => (
              <option
                key={p}
                value={p}
              >
                {p}
              </option>
            ))}
            <option value="__custom__">{t("shortcuts.customPort")}</option>
          </select>
        </div>
        <p className="text-xs text-slate-500 pl-1">
          {availablePorts.length === 1
            ? t("shortcuts.containerHasOnePort")
            : t("shortcuts.containerHasPorts").replace(
                "{{count}}",
                availablePorts.length.toString(),
              )}
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
          placeholder={t("shortcuts.portPlaceholder")}
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
            {t("shortcuts.useAvailable")}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 pl-1">
        {containerId
          ? availablePorts.length > 0
            ? t("shortcuts.enterCustomOrUseAvailable")
            : t("shortcuts.containerNoExposedPorts")
          : t("shortcuts.leaveEmptyNoPorts")}
      </p>
    </div>
  );
};

interface UrlInputProps {
  url: string;
  urlError: string;
  onChange: (url: string) => void;
  onBlur: () => void;
  t: (key: string) => string;
}

const UrlInput: React.FC<UrlInputProps> = ({
  url,
  urlError,
  onChange,
  onBlur,
  t,
}) => (
  <>
    <input
      required
      type="text"
      value={url}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={t("shortcuts.urlPlaceholder")}
      className={`w-full bg-slate-800 border ${
        urlError ? "border-red-500" : "border-white/10"
      } rounded-xl px-4 py-3 focus:outline-none focus:ring-2 ${
        urlError ? "focus:ring-red-500" : "focus:ring-blue-500"
      } transition-all text-white`}
    />
    {!urlError && (
      <p className="text-xs text-slate-500 pl-1">
        {t("shortcuts.urlSupports")}
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
  t: (key: string) => string;
}

const TailscaleToggle: React.FC<TailscaleToggleProps> = ({
  enabled,
  ip,
  onToggle,
  t,
}) => (
  <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-300">
            {t("shortcuts.useTailscale")}
          </label>
          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
            {ip}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {t("shortcuts.tailscaleDescription")}
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
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    filename: string;
    displayName: string;
    shortcuts: Array<{ id: number; display_name: string }>;
  }>({
    isOpen: false,
    filename: "",
    displayName: "",
    shortcuts: [],
  });
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Sort icons alphabetically
  const sortedIcons = Object.keys(AVAILABLE_ICONS).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );

  // Fetch uploaded images when dropdown opens
  useEffect(() => {
    if (isOpen) {
      uploadsApi
        .getAll()
        .then(setUploadedImages)
        .catch((err) => {
          console.error("Failed to fetch uploaded images:", err);
          setUploadedImages([]);
        });
    }
  }, [isOpen]);

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

  // Check if current icon is an uploaded image
  const isUploadedImage = icon.startsWith("uploads/");

  // Check if the current icon is a valid Lucide icon
  const isValidLucideIcon = AVAILABLE_ICONS.hasOwnProperty(icon);

  // Determine display name and actual icon to use
  // If icon is a URL (not uploaded, not Lucide), show "Server" but don't change the actual value
  const displayIcon = isUploadedImage || isValidLucideIcon ? icon : "Server";
  const displayName = isUploadedImage
    ? icon.split("/").pop()?.split("-").slice(1).join("-") || icon
    : isValidLucideIcon
      ? icon
      : "Server";

  // Handle delete image with confirmation
  const handleDeleteImage = async (filename: string, displayName: string) => {
    try {
      // First try to delete without force to check if it's in use
      await uploadsApi.delete(filename, false);

      // If successful, refresh the list
      const updatedImages = await uploadsApi.getAll();
      setUploadedImages(updatedImages);

      // If the deleted image was selected, clear the icon
      if (icon === `uploads/${filename}`) {
        setIcon("Server");
      }
    } catch (err: any) {
      // If status is 409, image is in use - show confirmation modal
      if (err.response?.status === 409) {
        const shortcuts = err.response?.data?.shortcuts || [];
        setDeleteConfirm({
          isOpen: true,
          filename,
          displayName,
          shortcuts,
        });
      } else {
        // Other errors - show alert
        const errorMessage =
          err.response?.data?.error || "Failed to delete image";
        alert(errorMessage);
      }
    }
  };

  // Handle confirmed delete (force delete)
  const handleConfirmedDelete = async () => {
    try {
      await uploadsApi.delete(deleteConfirm.filename, true);

      // Refresh the list
      const updatedImages = await uploadsApi.getAll();
      setUploadedImages(updatedImages);

      // If the deleted image was selected, clear the icon
      if (icon === `uploads/${deleteConfirm.filename}`) {
        setIcon("Server");
      }

      // Close the confirmation modal
      setDeleteConfirm({
        isOpen: false,
        filename: "",
        displayName: "",
        shortcuts: [],
      });
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error || "Failed to delete image";
      alert(errorMessage);
    }
  };

  return (
    <div className="w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between hover:border-white/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center overflow-hidden">
            {isUploadedImage ? (
              <img
                src={`/${icon}`}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <DynamicIcon
                name={displayIcon}
                className="w-5 h-5 text-white"
              />
            )}
          </div>
          <span className="text-white truncate">{displayName}</span>
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
            className="z-[250] bg-slate-800 border border-white/10 rounded-xl shadow-2xl max-h-64 overflow-y-auto custom-scrollbar"
          >
            {/* Uploaded Images Section */}
            {uploadedImages.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-white/5">
                  Uploaded Images
                </div>
                {uploadedImages.map((image) => {
                  const imageName =
                    image.filename.split("-").slice(1).join("-") ||
                    image.filename;
                  return (
                    <div
                      key={image.url}
                      className={`w-full px-4 py-2.5 flex items-center gap-3 group hover:bg-slate-700 transition-colors ${
                        icon === image.url
                          ? "bg-blue-600/20 text-blue-400"
                          : "text-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setIcon(image.url);
                          setIsOpen(false);
                        }}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0 ${
                            icon === image.url
                              ? "bg-blue-600/30"
                              : "bg-slate-700"
                          }`}
                        >
                          <img
                            src={`/${image.url}`}
                            alt={imageName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-sm truncate">{imageName}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteImage(image.filename, imageName);
                        }}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                        title="Delete image"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
                <div className="border-b border-white/5 my-1" />
              </>
            )}

            {/* Lucide Icons Section */}
            <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Icons
            </div>
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
          document.body,
        )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen &&
        createPortal(
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() =>
                setDeleteConfirm({
                  isOpen: false,
                  filename: "",
                  displayName: "",
                  shortcuts: [],
                })
              }
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-yellow-500/20"
            >
              <button
                onClick={() =>
                  setDeleteConfirm({
                    isOpen: false,
                    filename: "",
                    displayName: "",
                    shortcuts: [],
                  })
                }
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-yellow-500/20 rounded-2xl">
                  <Trash2 className="w-8 h-8 text-yellow-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">Delete Image?</h2>
              </div>

              <p className="text-slate-300 mb-4 leading-relaxed">
                The image{" "}
                <span className="font-semibold text-white">
                  "{deleteConfirm.displayName}"
                </span>{" "}
                is currently being used by the following shortcut
                {deleteConfirm.shortcuts.length > 1 ? "s" : ""}:
              </p>

              <div className="bg-slate-950/50 rounded-xl p-4 mb-6 max-h-32 overflow-y-auto">
                <ul className="space-y-2">
                  {deleteConfirm.shortcuts.map((shortcut) => (
                    <li
                      key={shortcut.id}
                      className="text-slate-300 flex items-center gap-2"
                    >
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                      {shortcut.display_name}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-slate-400 text-sm mb-6">
                If you delete this image, these shortcuts will be updated to use
                the default icon.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() =>
                    setDeleteConfirm({
                      isOpen: false,
                      filename: "",
                      displayName: "",
                      shortcuts: [],
                    })
                  }
                  className="flex-1 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmedDelete}
                  className="flex-1 py-3 px-6 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-red-500/30"
                >
                  Delete Anyway
                </button>
              </div>
            </motion.div>
          </div>,
          document.body,
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
  t: (key: string) => string;
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
  t,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [urlPreview, setUrlPreview] = useState<string | null>(null);
  const [urlPreviewError, setUrlPreviewError] = useState(false);

  const tabLabels: Record<"icon" | "url" | "upload", string> = {
    icon: t("shortcuts.iconTab"),
    url: t("shortcuts.urlTab"),
    upload: t("shortcuts.uploadTab"),
  };

  // Fetch uploaded images when component mounts or upload tab is active
  useEffect(() => {
    if (activeTab === "upload") {
      uploadsApi.getAll().then(setUploadedImages).catch(console.error);
    }
  }, [activeTab]);

  // Create and cleanup preview URL for selected file
  useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setPreviewUrl(null);
      };
    } else {
      setPreviewUrl(null);
    }
  }, [selectedFile]);

  // Handle URL preview
  useEffect(() => {
    if (activeTab === "url" && icon.startsWith("http")) {
      setUrlPreviewError(false);
      setUrlPreview(null);

      // Debounce the preview loading
      const timer = setTimeout(() => {
        if (isValidUrl(icon)) {
          setUrlPreview(icon);
        }
      }, 500);

      return () => clearTimeout(timer);
    } else {
      setUrlPreview(null);
      setUrlPreviewError(false);
    }
  }, [icon, activeTab]);

  return (
    <div className="space-y-4 pt-2">
      <label className="text-sm font-semibold text-slate-300">
        {t("shortcuts.identityBranding")}
      </label>
      <div className="flex gap-2 p-1 bg-slate-950 rounded-xl border border-white/10">
        {(["icon", "url", "upload"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
              activeTab === tab
                ? "bg-slate-800 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "icon" && <Bookmark className="w-3 h-3" />}
            {tab === "url" && <LinkIcon className="w-3 h-3" />}
            {tab === "upload" && <Upload className="w-3 h-3" />}
            {tabLabels[tab]}
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
            {/* URL Input with inline preview */}
            <div
              className={`flex items-center gap-3 bg-slate-800 border ${
                iconUrlError ? "border-red-500" : "border-white/10"
              } rounded-xl px-4 py-3`}
            >
              {/* Inline preview icon */}
              <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                {urlPreview && !urlPreviewError ? (
                  <img
                    src={urlPreview}
                    alt="Preview"
                    className="w-full h-full object-contain p-1"
                    onError={() => {
                      setUrlPreviewError(true);
                    }}
                  />
                ) : (
                  <LinkIcon className="w-5 h-5 text-slate-500" />
                )}
              </div>
              <input
                type="text"
                className="bg-transparent flex-1 focus:outline-none text-white text-sm"
                placeholder={t("shortcuts.imageUrlPlaceholder")}
                value={icon.startsWith("http") ? icon : ""}
                onChange={(e) => {
                  setIcon(e.target.value);
                  setIconUrlError("");
                  setUrlPreviewError(false);
                }}
                onBlur={(e) => {
                  if (e.target.value && !isValidUrl(e.target.value)) {
                    setIconUrlError(t("validation.invalidImageUrl"));
                  } else {
                    setIconUrlError("");
                  }
                }}
              />
            </div>
            {!iconUrlError && !urlPreview && (
              <p className="text-[10px] text-slate-500 pl-1 italic">
                {t("shortcuts.imageUrlHint")}
              </p>
            )}
            {iconUrlError && (
              <p className="text-xs text-red-400 pl-1 flex items-center gap-1">
                <span>⚠</span> {iconUrlError}
              </p>
            )}
            {urlPreviewError && (
              <p className="text-xs text-red-400 pl-1 flex items-center gap-1">
                <span>⚠</span> Failed to load image
              </p>
            )}
          </div>
        )}

        {activeTab === "upload" && (
          <div className="w-full space-y-4">
            {/* Upload new image button */}
            <label className="w-full h-20 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors group">
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,image/x-icon"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  // Clear icon selection when uploading new file
                  if (file) {
                    setIcon("");
                  }
                }}
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
                  <Upload className="w-5 h-5 text-slate-500 group-hover:text-blue-500 mb-1 transition-colors" />
                  <span className="text-xs text-slate-500 group-hover:text-slate-300">
                    Upload new image
                  </span>
                </>
              )}
            </label>

            {/* Preview of selected file */}
            {selectedFile && previewUrl && (
              <div className="w-full flex items-center justify-center">
                <div className="w-16 h-16 rounded-lg bg-slate-700 flex items-center justify-center overflow-hidden border border-white/10">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            {/* Divider if there are uploaded images */}
            {uploadedImages.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10"></div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Or select existing
                </span>
                <div className="flex-1 h-px bg-white/10"></div>
              </div>
            )}

            {/* List of uploaded images */}
            {uploadedImages.length > 0 && (
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                {uploadedImages.map((image) => {
                  const isSelected = icon === image.url;
                  return (
                    <button
                      key={image.url}
                      type="button"
                      onClick={() => {
                        setIcon(image.url);
                        setSelectedFile(null);
                      }}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected
                          ? "border-blue-500 ring-2 ring-blue-500/50"
                          : "border-white/10 hover:border-white/30"
                      }`}
                      title={image.filename}
                    >
                      <img
                        src={`/${image.url}`}
                        alt={image.filename}
                        className="w-full h-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                          <CheckCircle className="w-6 h-6 text-blue-400" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {uploadedImages.length === 0 && !selectedFile && (
              <p className="text-[10px] text-slate-500 text-center italic">
                No uploaded images yet. Upload one above.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
