# siopa

A lightweight, fully-typed TypeScript wrapper around Shopify's [Storefront Ajax API](https://shopify.dev/docs/api/ajax) for use in Shopify themes.

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
  currencyCode: "USD",
  locale: "en",
  countryCode: "US",
});
```

| Option         | Type     | Description                                                                                          |
| -------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `rootUrl`      | `string` | Base path for all API requests. Use `"/"` for standard storefronts, or a locale prefix like `"/en"`. |
| `currencyCode` | `string` | ISO 4217 currency code used by `formatPrice` (e.g. `"USD"`, `"EUR"`, `"GBP"`).                       |
| `locale`       | `string` | Language code for number/currency formatting (e.g. `"en"`, `"fr"`, `"de"`).                          |
| `countryCode`  | `string` | ISO 3166 country code combined with `locale` for `Intl.NumberFormat` (e.g. `"US"`, `"CA"`, `"GB"`).  |

## API

Every method returns a `Promise<ApiResult<T>>` -- a discriminated union you can narrow with a simple `if` check. See [Error Handling](#error-handling) for details.

### `getProduct`

Fetch a single product by its handle.

```ts
const result = await client.getProduct({ handle: "classic-leather-jacket" });

if (result.ok) {
  console.log(result.data.title);
}
```

### `getCart`

Retrieve the current cart.

```ts
const result = await client.getCart();

if (result.ok) {
  console.log(result.data.item_count);
}
```

### `addToCart`

Add one or more items to the cart.

```ts
const result = await client.addToCart({
  items: [{ id: 44871526007089, quantity: 1 }],
});
```

You can also include optional `selling_plan` and `properties`:

```ts
const result = await client.addToCart({
  items: [
    {
      id: 44871526007089,
      quantity: 1,
      selling_plan: 123456,
      properties: { _gift_message: "Happy birthday!" },
    },
  ],
});
```

### `updateLineItem`

Update the quantity (or properties) of a line item by its key.

```ts
const result = await client.updateLineItem({
  id: "c32b1a8b-1c5e-4e3a-9f8d-2a6b7c8d9e0f:1234567890",
  quantity: 3,
});
```

### `removeLineItem`

Remove a single line item from the cart by its key.

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

`Siopa` includes a built-in event system. Use `on()` to subscribe to events -- it returns an unsubscribe function.

```ts
const unsubscribe = client.on("cart:fetched", (cart) => {
  console.log("Cart updated:", cart.item_count);
});

// Later, stop listening
unsubscribe();
```

### Available events

| Event                             | Payload Type      | Fired by                                              |
| --------------------------------- | ----------------- | ----------------------------------------------------- |
| `product:fetched`                 | `Product`         | `getProduct`                                          |
| `product:recommendations:fetched` | `Recommendations` | `getProductRecommendations`                           |
| `cart:fetched`                    | `Cart`            | `getCart`                                             |
| `cart:updated`                    | `CartChange`      | `updateLineItem`, `removeLineItem`, `removeLineItems` |
| `cart:cleared`                    | `CartClear`       | `clearCart`                                           |
| `product:added`                   | `CartAdd`         | `addToCart`                                           |
| `search:suggest`                  | `Suggest`         | `searchProducts`                                      |
| `request:error`                   | `ErrorResponse`   | Any method on failure                                 |

## Error Handling

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
  items: [{ id: 44871526007089, quantity: 1 }],
});

if (result.ok) {
  console.log("Added:", result.data);
} else {
  console.error(`Error ${result.error.status}: ${result.error.message}`);
}
```

You can also listen for all errors globally:

```ts
client.on("request:error", (error) => {
  console.error(`[${error.status}] ${error.message}: ${error.description}`);
});
```

## Types

All types are exported from the package entry point:

```ts
import type {
  ApiResult,
  ErrorResponse,
  ShopifyEventMap,
  AddPayload,
  LineItemPayload,
  PredictiveSearchPayload,
  PredictiveSearchResourceType,
  PredictiveSearchField,
} from "siopa";
```

## License

[MIT](LICENSE)
