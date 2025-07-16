import { useTranslation } from 'react-i18next';

export const useI18n = () => {
  const { t, i18n } = useTranslation();

  const currentLanguage = i18n.language;
  const isRTL = ['ar', 'he', 'fa'].includes(currentLanguage);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat(currentLanguage).format(num);
  };

  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat(currentLanguage, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const formatRelativeTime = (seconds: number) => {
    if (seconds < 60) {
      return t('time.seconds', { count: Math.round(seconds) });
    } else if (seconds < 3600) {
      return t('time.minutes', { count: Math.round(seconds / 60) });
    } else {
      return t('time.hours', { count: Math.round(seconds / 3600) });
    }
  };

  return {
    t,
    i18n,
    currentLanguage,
    isRTL,
    formatNumber,
    formatDateTime,
    formatRelativeTime,
  };
};

export default useI18n;