export const BRAND_ASSETS = {
  mark: {
    navy:
      '/brand/sams-logo-navy.png',
    white:
      '/brand/sams-logo-white.png'
  },

  full: {
    navy:
      '/brand/sams-full-logo-navy.png',
    white:
      '/brand/sams-full-logo-white.png'
  }
};

export function resolveBrandPalette({
  surface = 'auto',
  theme = 'light'
} = {}) {
  const resolvedSurface =
    surface === 'auto'
      ? (
          theme === 'dark'
            ? 'dark'
            : 'light'
        )
      : surface;

  return resolvedSurface === 'dark'
    ? 'white'
    : 'navy';
}

export function resolveBrandAsset({
  variant = 'mark',
  surface = 'auto',
  theme = 'light'
} = {}) {
  const safeVariant =
    BRAND_ASSETS[variant]
      ? variant
      : 'mark';

  const palette =
    resolveBrandPalette({
      surface,
      theme
    });

  return BRAND_ASSETS[
    safeVariant
  ][palette];
}
