import {
  resolveBrandAsset
} from './brand-assets';

import {
  useTheme
} from '../../hooks/useTheme';

export function BrandLogo({
  variant = 'mark',
  surface = 'auto',
  alt =
    'Sadat Academy for Management Sciences',
  className = '',
  ...imageProps
}) {
  const {
    theme
  } = useTheme();

  const src =
    resolveBrandAsset({
      variant,
      surface,
      theme
    });

  return (
    <img
      src={src}
      alt={alt}
      className={
        [
          'brand-logo',
          `brand-logo--${variant}`,
          className
        ]
          .filter(Boolean)
          .join(' ')
      }
      {...imageProps}
    />
  );
}
