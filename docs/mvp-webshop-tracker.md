# School Warehouse Webshop MVP Tracker

## Goal
Deliver a mobile-friendly internal webshop with searchable products, category filtering, cart handling, and a robust inventory schema.

## Progress Checklist

### 1) Data Schema
- [x] Define `Product`, `Category`, `StorageLocation`, `ProductImage`, `Cart`, `CartItem`
- [x] Add unit strategy (`UnitKind`, `BaseUnit`, `unitStep`)
- [x] Add constraints and indexes (`sku`, lookup and low-stock indexes)
- [x] Keep product images as URL/path metadata

### 2) API Layer (tRPC)
- [x] Product list API with search, category filter, pagination cursor
- [x] Product detail API (`byId`)
- [x] Category list API with product counts
- [x] Cart APIs (`get`, `addItem`, `setItemQuantity`, `removeItem`)
- [x] Real-time pricing cart behavior (no stored cart line price)

### 3) Storefront UI (Mobile First)
- [x] Search input (name/SKU/description)
- [x] Category chips with active filter
- [x] Responsive product cards with stock and location indicators
- [x] Cart panel with quantity controls and subtotal
- [x] Modern touch-friendly style foundation

### 4) Next Steps
- [ ] Add database migration files
- [ ] Add product image upload flow (dev local storage path)
- [ ] Add product detail page and richer empty/error states
- [ ] Add low-stock dedicated filter
- [ ] Add basic internal checkout flow

## Decisions
- Unit handling uses normalized base units and decimal quantities.
- Product images are stored as path/URL metadata, not binary blobs.
- Cart subtotal uses live `Product.price` for internal real-time pricing.

## Risks / Watchlist
- No authentication yet (intended for this phase).
- Cart is session-key-based and local-browser scoped.
- Pricing is live and can change between cart updates.
