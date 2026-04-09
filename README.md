```
          $$\
          \__|
 $$$$$$$\ $$\  $$$$$$\   $$$$$$\   $$$$$$\
$$  _____|$$ |$$  __$$\ $$  __$$\  \____$$\
\$$$$$$\  $$ |$$ /  $$ |$$ /  $$ | $$$$$$$ |
 \____$$\ $$ |$$ |  $$ |$$ |  $$ |$$  __$$ |
$$$$$$$  |$$ |\$$$$$$  |$$$$$$$  |\$$$$$$$ |
\_______/ \__| \______/ $$  ____/  \_______|
                        $$ |
                        $$ |
                        \__|
```

A lightweight, fully-typed TypeScript wrapper around Shopify's [Storefront Ajax API](https://shopify.dev/docs/api/ajax) for use in Shopify themes.

## Table of contents

- [Installation](#installation)
- [Initialization](#initialization)
- [API](#api)
  - [`getProduct`](#getproduct)
  - [`getCollection`](#getcollection)
  - [`getCollectionProducts`](#getcollectionproducts)
  - [`getCart`](#getcart)
  - [`addToCart`](#addtocart)
  - [`updateLineItem`](#updatelineitem)
  - [`removeLineItem`](#removelineitem)
  - [`removeLineItems`](#removelineitems)
  - [`clearCart`](#clearcart)
  - [`getProductRecommendations`](#getproductrecommendations)
  - [`searchProducts`](#searchproducts)
  - [`getSections`](#getsections)
  - [`formatPrice`](#formatprice)
- [Events](#events)
  - [`on`](#on)
  - [`once`](#once)
  - [`removeAllListeners`](#removealllisteners)
  - [`onThemeEvent`](#onthemeevent)
  - [Available theme events](#available-theme-events)
  - [Available events](#available-events)
  - [Safety](#safety)
- [Error handling](#error-handling)
- [Types](#types)
- [Development](#development)
- [License](#license)

## Installation

```bash
# npm
npm install siopa

# pnpm
pnpm add siopa

# yarn
yarn add siopa
```

## Initialization

```ts
import { Siopa } from "siopa";

const client = new Siopa({
  rootUrl: "/",
  currencyCode: "EUR",
  locale: "en",
  countryCode: "IE",
});
```

| Option         | Type     | Description                                                                                          |
| -------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `rootUrl`      | `string` | Base path for all API requests. Use `"/"` for standard storefronts, or a locale prefix like `"/en"`. |
| `currencyCode` | `string` | ISO 4217 currency code used by `formatPrice` (e.g. `"USD"`, `"EUR"`, `"GBP"`).                       |
| `locale`       | `string` | Language code for number/currency formatting (e.g. `"en"`, `"fr"`, `"de"`).                          |
| `countryCode`  | `string` | ISO 3166 country code combined with `locale` for `Intl.NumberFormat` (e.g. `"US"`, `"CA"`, `"GB"`).  |

## API

Every method returns a `Promise<ApiResult<T>>` -- a discriminated union you can narrow with a simple `if` check. See [Error handling](#error-handling) for details.

### `getProduct`

Fetch a single product by its handle. Requests `GET {rootUrl}/products/{handle}.json` (same JSON shape as Shopify’s documented [`products/{handle}.js`](https://shopify.dev/docs/api/ajax/reference/product) endpoint).

```ts
const result = await client.getProduct({ handle: "classic-leather-jacket" });

if (result.ok) {
  console.log(result.data.title);
}
```

### `getCollection`

Fetch a single collection by its handle.

```ts
const result = await client.getCollection({ handle: "summer" });

if (result.ok) {
  console.log(result.data.collection.title);
}
```

### `getCollectionProducts`

Fetch the products within a collection. All query parameters are optional.

```ts
const result = await client.getCollectionProducts({ handle: "summer" });

if (result.ok) {
  console.log(result.data.products);
}
```

With filtering and sorting:

```ts
const result = await client.getCollectionProducts({
  handle: "summer",
  params: {
    limit: 12,
    page: 2,
    sort_by: "best-selling",
  },
});
```

| Parameter | Type               | Default    |
| --------- | ------------------ | ---------- |
| `handle`  | `string`           | (required) |
| `params`  | `CollectionProductsParams` | `undefined` |

**`CollectionProductsParams`**

| Parameter | Type                | Default     |
| --------- | ------------------- | ----------- |
| `limit`   | `number`            | `undefined` |
| `page`    | `number`            | `undefined` |
| `sort_by` | `CollectionSortBy`  | `undefined` |

**`CollectionSortBy`** — `"manual"` | `"best-selling"` | `"title-ascending"` | `"title-descending"` | `"price-ascending"` | `"price-descending"` | `"created-ascending"` | `"created-descending"`

### `getCart`

Retrieve the current cart.

```ts
const result = await client.getCart();

if (result.ok) {
  console.log(result.data.item_count);
}
```

### `addToCart`

Add one or more items to the cart. Accepts either a plain object or a `FormData` instance.

**Object payload:**

```ts
const result = await client.addToCart({
  payload: { items: [{ id: 44871526007089, quantity: 1 }] },
});
```

You can also include optional `selling_plan` and `properties`:

```ts
const result = await client.addToCart({
  payload: {
    items: [
      {
        id: 44871526007089,
        quantity: 1,
        selling_plan: 123456,
        properties: { _gift_message: "Happy birthday!" },
      },
    ],
  },
});
```

**FormData payload:**

Useful when submitting directly from a `<form>` element or when you need to include file uploads.

```ts
const form = document.querySelector("form.product-form");
const result = await client.addToCart({ payload: new FormData(form) });
```

When a `FormData` instance is passed, the request is sent as `multipart/form-data` instead of JSON.

### `updateLineItem`

Update the quantity (or properties) of a line item by its key. Optional `selling_plan` and `properties` follow the same shape as in `addToCart` line items.

```ts
const result = await client.updateLineItem({
  id: "c32b1a8b-1c5e-4e3a-9f8d-2a6b7c8d9e0f:1234567890",
  quantity: 3,
});
```

```ts
const result = await client.updateLineItem({
  id: "c32b1a8b-1c5e-4e3a-9f8d-2a6b7c8d9e0f:1234567890",
  quantity: 1,
  selling_plan: 123456,
  properties: { _note: "Gift wrap" },
});
```

### `removeLineItem`

Remove a single line item from the cart by its key. `id` may be a string or number (variant id style keys remain strings).

```ts
const result = await client.removeLineItem({
  id: "c32b1a8b-1c5e-4e3a-9f8d-2a6b7c8d9e0f:1234567890",
});
```

### `removeLineItems`

Remove multiple line items from the cart at once.

```ts
const result = await client.removeLineItems({
  ids: [
    "c32b1a8b-1c5e-4e3a-9f8d-2a6b7c8d9e0f:1234567890",
    "a21c3b4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d:0987654321",
  ],
});
```

### `clearCart`

Remove all items from the cart.

```ts
const result = await client.clearCart();
```

### `getProductRecommendations`

Fetch product recommendations for a given product.

```ts
const result = await client.getProductRecommendations({
  product_id: "8057088139569",
});
```

| Parameter    | Type                             | Default     |
| ------------ | -------------------------------- | ----------- |
| `product_id` | `string`                         | (required)  |
| `limit`      | `number`                         | `4`         |
| `intent`     | `"related"` \| `"complementary"` | `"related"` |

```ts
const result = await client.getProductRecommendations({
  product_id: "8057088139569",
  limit: 8,
  intent: "complementary",
});
```

### `searchProducts`

Perform a predictive search across products, collections, pages, articles, and queries.

```ts
const result = await client.searchProducts({ q: "leather" });

if (result.ok) {
  const { resources } = result.data;
  console.log(resources);
}
```

With full options:

```ts
const result = await client.searchProducts({
  q: "leather",
  resources: {
    type: ["product", "collection"],
    limit: 5,
    limit_scope: "each",
    options: {
      unavailable_products: "hide",
      fields: ["title", "vendor", "variants.title"],
    },
  },
});
```

| Parameter                                | Type                             | Default                                      |
| ---------------------------------------- | -------------------------------- | -------------------------------------------- |
| `q`                                      | `string`                         | (required)                                   |
| `resources.type`                         | `PredictiveSearchResourceType[]` | `["query", "product", "collection", "page"]` |
| `resources.limit`                        | `number`                         | `10`                                         |
| `resources.limit_scope`                  | `"all"` \| `"each"`              | `"all"`                                      |
| `resources.options.unavailable_products` | `"show"` \| `"hide"` \| `"last"` | `"last"`                                     |
| `resources.options.fields`               | `PredictiveSearchField[]`        | all fields                                   |

### `getSections`

Fetch rendered HTML for one or more theme [sections](https://shopify.dev/docs/api/ajax/section-rendering) via the Section Rendering API. Sections can be rendered in the context of any page by passing a `path`.

```ts
const result = await client.getSections({
  ids: ["template--26931341263194__block_slider_VMJwXd"],
});

if (result.ok) {
  const html = result.data["template--26931341263194__block_slider_VMJwXd"];
  // html is string | null — null means the section failed to render
}
```

Render sections in the context of a specific page:

```ts
const result = await client.getSections({
  ids: ["header", "footer"],
  path: "/collections/featured",
});
```

| Parameter | Type       | Default     |
| --------- | ---------- | ----------- |
| `ids`     | `string[]` | (required)  |
| `path`    | `string`   | `"/"`       |

A maximum of 5 section IDs can be requested at once. Sections that fail to render are returned as `null` in the response (see the `Section` type).

### `formatPrice`

Format a price amount (in cents) into a locale-aware currency string using `Intl.NumberFormat`. The formatter is constructed from the `locale`, `countryCode`, and `currencyCode` options passed to the constructor and is cached after the first call.

```ts
client.formatPrice({ amount: 1999 });
// => "$19.99" (for en-US / USD)
```

```ts
const client = new Siopa({
  rootUrl: "/",
  currencyCode: "EUR",
  locale: "de",
  countryCode: "DE",
});

client.formatPrice({ amount: 4950 });
// => "49,50 €"
```

## Events

`Siopa` includes a built-in event system. Every event name follows a consistent `resource:past-verb` convention.

### `on`

Subscribe to an event. Returns an unsubscribe function.

```ts
const unsubscribe = client.on("cart:fetched", (cart) => {
  console.log("Cart updated:", cart.item_count);
});

// Later, stop listening
unsubscribe();
```

### `once`

Subscribe to an event for a single emission only. The listener is automatically removed after it fires once. Returns an unsubscribe function in case you need to cancel before it fires.

```ts
client.once("cart:fetched", (cart) => {
  console.log("Initial cart load:", cart.item_count);
});

// Or cancel before it fires
const unsub = client.once("product:fetched", handler);
unsub();
```

### `removeAllListeners`

Remove all listeners for a specific event, or clear every listener across all events.

```ts
// Remove all listeners for a single event
client.removeAllListeners("cart:fetched");

// Remove all listeners for all events
client.removeAllListeners();
```

### `onThemeEvent`

Subscribe to Shopify [theme editor](https://shopify.dev/docs/storefronts/themes/tools/theme-editor) events dispatched on `document`. Returns an unsubscribe function. These events are only fired inside the theme editor — they will never fire on the live storefront.

```ts
const unsubscribe = client.onThemeEvent("shopify:section:load", (detail) => {
  console.log("Section loaded:", detail.sectionId);
});

unsubscribe();
```

#### Available theme events

| Event                          | Detail                                           | Description                                           |
| ------------------------------ | ------------------------------------------------ | ----------------------------------------------------- |
| `shopify:inspector:activate`   | `undefined`                                      | The theme editor preview inspector has been activated  |
| `shopify:inspector:deactivate` | `undefined`                                      | The theme editor preview inspector has been deactivated|
| `shopify:section:load`         | `{ sectionId: string }`                          | A section has been added or re-rendered                |
| `shopify:section:unload`       | `{ sectionId: string }`                          | A section has been deleted or is being re-rendered     |
| `shopify:section:select`       | `{ sectionId: string; load: boolean }`           | The user has selected the section in the sidebar       |
| `shopify:section:deselect`     | `{ sectionId: string }`                          | The user has deselected the section in the sidebar     |
| `shopify:section:reorder`      | `{ sectionId: string }`                          | A section has been reordered                           |
| `shopify:block:select`         | `{ blockId: string; sectionId: string; load: boolean }` | The user has selected the block in the sidebar  |
| `shopify:block:deselect`       | `{ blockId: string; sectionId: string }`         | The user has deselected the block in the sidebar       |

### Available events

| Event                             | Payload Type                    | Fired by                            |
| --------------------------------- | ------------------------------- | ----------------------------------- |
| `product:fetched`                 | `Product`                       | `getProduct`                        |
| `product:recommendations:fetched` | `Recommendations`               | `getProductRecommendations`         |
| `collection:fetched`              | `{ collection: Collection }`    | `getCollection`                     |
| `collection:products:fetched`     | `{ products: Product[] }`       | `getCollectionProducts`             |
| `cart:fetched`                    | `Cart`                          | `getCart`                           |
| `cart:added`                      | `CartAdd`                       | `addToCart`                         |
| `cart:updated`                    | `CartChange`                    | `updateLineItem`                    |
| `cart:removed`                    | `CartChange`                    | `removeLineItem`, `removeLineItems` |
| `cart:cleared`                    | `CartClear`                     | `clearCart`                         |
| `search:suggested`                | `Suggest`                       | `searchProducts`                    |
| `section:fetched`                 | `Section`                       | `getSections`                       |
| `request:loading`                 | `boolean`                       | Any method (true before fetch, false after) |
| `request:failed`                  | `RequestFailedEvent`            | Any method on failure               |

The `request:failed` payload extends `ErrorResponse` with a `source` field indicating which operation failed:

```ts
client.on("request:failed", (error) => {
  console.error(`[${error.source}] ${error.status}: ${error.message}`);
  // => [cart:added] 422: Variant not found
});
```

### Safety

**Listener error isolation** — If a listener throws, subsequent listeners for the same event still run. The error is logged to `console.error` but does not propagate.

**Infinite loop protection** — If the same event is emitted more than 10 times within a single task (e.g. a listener on `cart:fetched` calling `getCart()`), further emissions are skipped and a warning is logged.

## Error handling

All methods return `ApiResult<T>`, a discriminated union:

```ts
type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ErrorResponse };

type ErrorResponse = {
  status: number;
  message: string;
  description: string;
};
```

Narrow the result with a simple `if` check:

```ts
const result = await client.addToCart({
  payload: { items: [{ id: 44871526007089, quantity: 1 }] },
});

if (result.ok) {
  console.log("Added:", result.data);
} else {
  console.error(`Error ${result.error.status}: ${result.error.message}`);
}
```

You can also listen for all errors globally via the `request:failed` event. The payload includes a `source` field so you know which operation failed:

```ts
client.on("request:failed", (error) => {
  console.error(`[${error.source}] ${error.status}: ${error.message}`);
});
```

## Types

All types are exported from the package entry point:

```ts
import type {
  ApiResult,
  ErrorResponse,
  RequestFailedEvent,
  ShopifyEventMap,
  CustomEvents,
  AddPayload,
  LineItemPayload,
  Section,
  CollectionProductsParams,
  CollectionSortBy,
  PredictiveSearchPayload,
  PredictiveSearchResourceType,
  PredictiveSearchField,
  Cart,
  Product,
} from "siopa";
```

`Cart` and `Product` are re-exported from [`@grafikr/shopify-typescript`](https://github.com/grafikr/shopify-typescript). Other response types (`Recommendations`, `Suggest`, `Collection`, cart endpoint types, etc.) come from that package’s type modules if you need them for annotations.

## Development

| Command        | Description        |
| -------------- | ------------------ |
| `pnpm build`   | Compile with `tsc` |
| `pnpm test`    | Run Vitest         |
| `pnpm lint`    | Run Oxlint         |
| `pnpm fmt`     | Format with Oxfmt  |
| `pnpm fmt:check` | Check formatting |

## License

[MIT](LICENSE)
