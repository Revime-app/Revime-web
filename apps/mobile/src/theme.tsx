import { accents, palette, radii, spacing, type, type AccentMode } from '@revime/tokens';
import { createContext, useContext, type ReactNode } from 'react';

type Theme = {
  palette: typeof palette;
  accent: (typeof accents)[AccentMode];
  radii: typeof radii;
  spacing: typeof spacing;
  type: typeof type;
};

const ThemeContext = createContext<Theme>({
  palette, accent: accents.client, radii, spacing, type,
});

export function ThemeProvider({ mode, children }: { mode: AccentMode; children: ReactNode }) {
  return (
    <ThemeContext.Provider value={{ palette, accent: accents[mode], radii, spacing, type }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = (): Theme => useContext(ThemeContext);

export { accents, palette, radii, spacing, type };
