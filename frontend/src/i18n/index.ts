import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';

// Supported languages
const SUPPORTED_LANGUAGES = ['en', 'es'];

// Get browser language (first 2 characters, e.g., 'en-US' -> 'en')
const getBrowserLanguage = (): string => {
  if (typeof window !== 'undefined' && navigator.language) {
    const browserLang = navigator.language.split('-')[0];
    if (browserLang && SUPPORTED_LANGUAGES.includes(browserLang)) {
      return browserLang;
    }
  }
  return 'en';
};

// Get saved language from localStorage, or browser language, or default to 'en'
const getSavedLanguage = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('language');
    if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
      return saved;
    }
    return getBrowserLanguage();
  }
  return 'en';
};

const resources = {
  en: {
    translation: en,
  },
  es: {
    translation: es,
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getSavedLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false,
    },
  });

// Save language preference when it changes
i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('language', lng);
  }
});

export default i18n;

