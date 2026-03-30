# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Shopify **Spotlight theme** (v15.4.1) export for the Bould store (`bould-try-on.myshopify.com`). Bould is a retail technology company specializing in eCommerce, 3D stores, and virtual try-on technology.

There is **no build pipeline** — this is a pure Shopify Liquid theme. All files are deployed directly to Shopify via the Shopify CLI or Admin.

## Development Commands

Install and use the [Shopify CLI](https://shopify.dev/docs/themes/tools/cli) to work with this theme:

```bash
# Authenticate and push/pull theme changes
shopify theme dev --store bould-try-on.myshopify.com   # Live preview with hot reload
shopify theme push                                       # Push to Shopify
shopify theme pull                                       # Pull latest from Shopify
shopify theme check                                      # Lint Liquid files
```

## Architecture

### Directory Layout

| Directory | Purpose |
|-----------|---------|
| `layout/` | Master page shells (`theme.liquid`, `password.liquid`) |
| `sections/` | 57 editor-configurable blocks (header, footer, product pages, etc.) |
| `snippets/` | 39 reusable partials (cards, price, cart, nav components) |
| `templates/` | JSON files that define which sections appear on each page type |
| `assets/` | CSS, JS, fonts, and images served as-is by Shopify CDN |
| `config/` | `settings_schema.json` (admin UI definition) + `settings_data.json` (saved values) |
| `locales/` | 53 translation JSON files |

### Liquid Rendering Flow

`templates/*.json` → references sections from `sections/` → sections include `snippets/` → all rendered inside `layout/theme.liquid`.

### JavaScript Architecture

No bundler. JS files are loaded individually via `<script>` tags in `layout/theme.liquid` or section files.

**Core files loaded globally:**
- `assets/constants.js` — shared config constants
- `assets/pubsub.js` — lightweight pub/sub event bus used for cross-component communication (cart updates, variant changes, etc.)
- `assets/global.js` — main utility layer: focus trapping, ARIA helpers, HTML update utilities with View Transitions API, re-injection of scripts after DOM replacement
- `assets/animations.js` — scroll-triggered reveal animations

**Interactive components are Web Components** (custom elements). Examples: `<product-info>`, `<header-drawer>`, `<menu-drawer>`, `<cart-drawer>`. Each is defined in a corresponding `assets/*.js` file and loaded lazily by the section that needs it.

**Key feature modules:** `cart.js`, `product-info.js`, `facets.js`, `predictive-search.js`, `quick-order-list.js`, `localization-form.js`.

### CSS Architecture

- `assets/base.css` — primary stylesheet using CSS custom properties for all theming
- `assets/component-*.css` — per-component stylesheets, loaded only when the component is used
- Color schemes are rendered as CSS variables by `layout/theme.liquid` using `settings_data.json` values (5 schemes: white/yellow, light gray, dark gray, black, red)
- Typography uses Inter via Shopify's font system

### Theme Settings

- `config/settings_schema.json` defines the Shopify admin customization UI (color schemes, typography, spacing, card styles)
- `config/settings_data.json` stores the current saved values
- Color scheme variables follow the pattern `--color-background`, `--color-foreground`, `--color-button`, etc.

### Section vs. Snippet Distinction

- **Sections** are Shopify editor blocks with their own `{% schema %}` tag — they are configurable from the admin
- **Snippets** are pure partials with no schema — they accept variables via `{% render 'snippet-name', var: value %}`
