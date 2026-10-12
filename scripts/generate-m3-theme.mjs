// Generates src/app/m3-tokens.css (Material Design 3 colour roles, light + dark) from the
// Perfect Profile brand seed. Run with `npm run theme`; the output is committed.
import { register } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// @material/material-color-utilities@0.4.0 has a few extension-less relative imports that
// Node's ESM resolver rejects; this hook retries them with ".js".
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); }
  catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.js'))
      return next(specifier + '.js', context);
    throw e;
  }
}`),
  import.meta.url,
);

const {
  Blend, DynamicScheme, Hct, Variant, MaterialDynamicColors, SchemeFidelity, TonalPalette, argbFromHex, hexFromArgb,
} = await import('@material/material-color-utilities');

const SEED = '#5E2A2E'; // oxblood
const seed = argbFromHex(SEED);
// Tried 0.5 (M3 medium contrast): it turns secondary-container into a mid-tone fill with white
// text (and near-black tertiary), losing the light tonal look. So keep 0 and instead push the
// on-*-container roles to the next-darker tone of their own palette (see ON_CONTAINER below).
const CONTRAST = 0;
const mdc = new MaterialDynamicColors();

const ROLES = {
  primary: mdc.primary(), 'on-primary': mdc.onPrimary(),
  'primary-container': mdc.primaryContainer(), 'on-primary-container': mdc.onPrimaryContainer(),
  secondary: mdc.secondary(), 'on-secondary': mdc.onSecondary(),
  'secondary-container': mdc.secondaryContainer(), 'on-secondary-container': mdc.onSecondaryContainer(),
  tertiary: mdc.tertiary(), 'on-tertiary': mdc.onTertiary(),
  'tertiary-container': mdc.tertiaryContainer(), 'on-tertiary-container': mdc.onTertiaryContainer(),
  error: mdc.error(), 'on-error': mdc.onError(),
  'error-container': mdc.errorContainer(), 'on-error-container': mdc.onErrorContainer(),
  background: mdc.background(), 'on-background': mdc.onBackground(),
  surface: mdc.surface(), 'on-surface': mdc.onSurface(),
  'surface-variant': mdc.surfaceVariant(), 'on-surface-variant': mdc.onSurfaceVariant(),
  'surface-dim': mdc.surfaceDim(), 'surface-bright': mdc.surfaceBright(),
  'surface-container-lowest': mdc.surfaceContainerLowest(),
  'surface-container-low': mdc.surfaceContainerLow(),
  'surface-container': mdc.surfaceContainer(),
  'surface-container-high': mdc.surfaceContainerHigh(),
  'surface-container-highest': mdc.surfaceContainerHighest(),
  'inverse-surface': mdc.inverseSurface(), 'inverse-on-surface': mdc.inverseOnSurface(),
  'inverse-primary': mdc.inversePrimary(),
  outline: mdc.outline(), 'outline-variant': mdc.outlineVariant(),
  scrim: mdc.scrim(), shadow: mdc.shadow(), 'surface-tint': mdc.surfaceTint(),
};

// Custom colours, harmonised toward the brand seed (M3 "custom color" recipe).
const CUSTOM = { success: '#2E7D32', warning: '#B26A00' };
const customRoles = (hex, dark) => {
  const pal = TonalPalette.fromInt(Blend.harmonize(argbFromHex(hex), seed));
    const t = dark ? [80, 20, 30, 90] : [40, 100, 90, 10];
  return [pal.tone(t[0]), pal.tone(t[1]), pal.tone(t[2]), pal.tone(t[3])].map(hexFromArgb);
};

// Fidelity keeps the seed as primary-container, but its tertiary is the seed's complement
// (a dark green), which would clash with the green success colour. Replace tertiary with a
// muted steel blue (harmonised to the seed) so "info / needs research" is distinct.
const tertiaryPalette = TonalPalette.fromInt(Blend.harmonize(argbFromHex('#4A6A8A'), seed));
function makeScheme(dark, tonalTertiary = false) {
  const base = new SchemeFidelity(Hct.fromInt(seed), dark, CONTRAST);
  return new DynamicScheme({
    sourceColorHct: base.sourceColorHct, variant: tonalTertiary ? Variant.TONAL_SPOT : base.variant, contrastLevel: CONTRAST, isDark: dark,
    primaryPalette: base.primaryPalette, secondaryPalette: base.secondaryPalette, tertiaryPalette,
    neutralPalette: base.neutralPalette, neutralVariantPalette: base.neutralVariantPalette,
    errorPalette: base.errorPalette,
  });
}

// (primary-container is the dark seed in light mode, so primary keeps its generated on-colour.)
// on-*-container roles from the dynamic scheme are too soft (tonal buttons read as disabled),
// so take them straight from the palette: tone 10 on the tone-90 container (light), tone 90
// on the tone-30 container (dark). Gives >= 7:1.
const ON_CONTAINER = { secondary: 'secondaryPalette', tertiary: 'tertiaryPalette', error: 'errorPalette' };

function block(dark) {
  const scheme = makeScheme(dark);
  // Tertiary roles use the standard (tone 40/90 light, 80/30 dark) mapping so tertiary
  // containers are light tints in light mode, matching the other container roles.
  const tonal = makeScheme(dark, true);
  const lines = [];
  for (const [name, dc] of Object.entries(ROLES)) {
    const sch = name.includes('tertiary') ? tonal : scheme;
    const m = /^on-(secondary|tertiary|error)-container$/.exec(name);
    const argb = m ? sch[ON_CONTAINER[m[1]]].tone(dark ? 90 : 10) : dc.getArgb(sch);
    lines.push(`  --md-sys-color-${name}: ${hexFromArgb(argb)};`);
  }
  for (const [name, hex] of Object.entries(CUSTOM)) {
    const [c, on, cont, onCont] = customRoles(hex, dark);
    lines.push(`  --md-sys-color-${name}: ${c};`, `  --md-sys-color-on-${name}: ${on};`,
      `  --md-sys-color-${name}-container: ${cont};`, `  --md-sys-color-on-${name}-container: ${onCont};`);
  }
  return lines.join('\n');
}

const css = `/* GENERATED by scripts/generate-m3-theme.mjs (npm run theme). Do not edit by hand.
   Seed ${SEED} (Perfect Profile oxblood), SchemeFidelity (tertiary swapped to steel blue), contrast ${CONTRAST}; success/warning harmonised to the seed. */
:root {
  color-scheme: light dark;
${block(false)}
}
@media (prefers-color-scheme: dark) {
  :root {
${block(true).replace(/^/gm, '  ')}
  }
}
`;
writeFileSync(fileURLToPath(new URL('../src/app/m3-tokens.css', import.meta.url)), css);
console.log('wrote src/app/m3-tokens.css; light primary', hexFromArgb(ROLES.primary.getArgb(makeScheme(false))));
