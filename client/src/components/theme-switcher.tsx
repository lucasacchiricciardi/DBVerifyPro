import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';

export function ThemeSwitcher() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={toggleTheme}
      className="flex items-center space-x-2"
      aria-label={t('accessibility.toggleTheme')}
    >
      {theme === 'light' ? (
        <Moon className="w-4 h-4" />
      ) : (
        <Sun className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">
        {theme === 'light' ? t('common.dark') : t('common.light')}
      </span>
    </Button>
  );
}