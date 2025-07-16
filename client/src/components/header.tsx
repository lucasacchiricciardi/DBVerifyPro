import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeSwitcher } from "./theme-switcher";

export default function Header() {
  const { t } = useTranslation();
  
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-3">
            <div className="bg-primary-600 rounded-lg p-2">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">DB-Verify</h1>
              <p className="text-sm text-gray-600 dark:text-gray-300">{t('verification.title')}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <ThemeSwitcher />
            <LanguageSwitcher />
            <span className="text-sm text-gray-500 dark:text-gray-400">v1.0</span>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
            <span className="text-sm text-gray-500 dark:text-gray-400">by Luca Sacchi Riccardi</span>
          </div>
        </div>
      </div>
    </header>
  );
}
