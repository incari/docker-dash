import { useState, useRef, useEffect } from "react";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

const languages = [
    { code: "en", name: "English", flag: "🇺🇸" },
    { code: "es", name: "Español", flag: "🇪🇸" },
];

export function LanguageSelector() {
    const { i18n } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const currentLang = languages.find((l) => l.code === i18n.language) ?? languages[0]!;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    const handleLanguageChange = (langCode: string) => {
        i18n.changeLanguage(langCode);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-white/5 rounded-lg transition-colors text-sm"
                title={currentLang.name}
            >
                <Globe className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300">{currentLang.flag} {currentLang.name}</span>
            </button>

            {isOpen && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 border border-white/10 rounded-lg shadow-xl overflow-hidden z-100 min-w-[140px]">
                    {languages.map((lang) => (
                        <button
                            key={lang.code}
                            onClick={() => handleLanguageChange(lang.code)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                                i18n.language === lang.code
                                    ? "bg-blue-600/20 text-blue-400"
                                    : "text-slate-300 hover:bg-slate-700"
                            }`}
                        >
                            <span>{lang.flag}</span>
                            <span>{lang.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

