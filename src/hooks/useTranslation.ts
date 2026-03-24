import { useAppStore } from '../store';
import { translations, TranslationKey } from '../lib/i18n';

export function useTranslation() {
  const { state } = useAppStore();
  const lang = state.language;

  const t = (key: TranslationKey): string => {
    return translations[lang][key] || key;
  };

  return { t, lang };
}
