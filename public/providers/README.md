# Provider Logos

This directory contains financial institution logos as static assets.

## Filename Convention
The app uses the following lookup order:
1. `{providerKey}.svg` (Recommended)
2. `{providerKey}.png`

`{providerKey}` is prioritized as follows:
- Official institution code (e.g., `fin_co_no` like `0010001`)
- Category group ID (e.g., `020000` for Banks)
- Normalized name (e.g., `국민`, `신한`) if code is unavailable.

## Category IDs (Carousel)
- `020000`: Banks
- `030200`: Credit/Leasing
- `030300`: Savings Banks
- `050000`: Insurance
- `060000`: Investment/Securities

## Best Practices
- Use SVG files for better scaling and performance.
- Use transparent PNGs if SVG is unavailable.
- Maintain a square-ish aspect ratio (e.g., 64x64 or 128x128).
- Only use officially provided brand assets.

## Automatic Import (Logo Pack)
If you have a logo pack ZIP file (e.g., `금융회사_로고아이콘.zip`), you can import them automatically:
1. Place the ZIP file in the project root.
2. Run `pnpm dev` in a separate terminal.
3. Execute:
   ```bash
   pnpm providers:logos:import
   ```
The script will match names to institution codes and copy files to this directory.

## Problem Diagnosis
If the import script finds 0 icons or 0 providers, use the debug flags to diagnose:

### 1. Check ZIP Content
```bash
pnpm providers:logos:import --debugZip
```
This will list detected variants (Color, Gray, etc.) and formats (SVG, PNG) found inside the ZIP.

### 2. Check API Response
```bash
pnpm providers:logos:import --debugApi
```
This shows the actual URLs being called and the number of product candidates found.

### 3. Common Issues
- **Port Mismatch**: If your dev server is not on port 3000 (e.g., 3001), specify it:
  ```bash
  pnpm providers:logos:import --baseUrl=http://localhost:3001 --debugApi
  ```
- **Missing API Key**: Ensure `FINLIFE_API_KEY` is set in `.env.local`. If the API returns 0 products, the script cannot map logos.
- **ZIP Encoding**: The script handles CP949 and UTF-8. If filenames are still not matching, check `docs/ui/providers.logo-map.json` for name mismatches.

## Fallback
If no logo is found, the UI automatically displays an initial-based badge.
