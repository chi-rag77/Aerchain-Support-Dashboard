import {
  createContext, useCallback, useContext, useEffect, useState, ReactNode,
} from "react";
import { loadBrandLogo } from "@/services/settings";

interface BrandingContextValue {
  /** Custom uploaded logo (base64 data URI), or null when using the default mark. */
  logo: string | null;
  loading: boolean;
  /** Re-read the logo from the store (call after an admin saves/removes it). */
  refresh: () => Promise<void>;
  /** Update the in-memory logo immediately (optimistic UI after a save). */
  setLogo: (dataUri: string | null) => void;
}

const BrandingContext = createContext<BrandingContextValue>({
  logo: null,
  loading: true,
  refresh: async () => {},
  setLogo: () => {},
});

/** Point the browser-tab favicon at a data URI (used for the custom logo). */
const setFavicon = (href: string) => {
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
  links.forEach((l) => l.parentNode?.removeChild(l));
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = href;
  document.head.appendChild(link);
};

export const BrandingProvider = ({ children }: { children: ReactNode }) => {
  const [logo, setLogoState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applyFavicon = useCallback((dataUri: string | null) => {
    if (dataUri) setFavicon(dataUri);
  }, []);

  const refresh = useCallback(async () => {
    const l = await loadBrandLogo();
    setLogoState(l);
    applyFavicon(l);
  }, [applyFavicon]);

  const setLogo = useCallback((dataUri: string | null) => {
    setLogoState(dataUri);
    applyFavicon(dataUri);
  }, [applyFavicon]);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  return (
    <BrandingContext.Provider value={{ logo, loading, refresh, setLogo }}>
      {children}
    </BrandingContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useBranding = () => useContext(BrandingContext);
