import type { Product } from "@grafikr/shopify-typescript/type/json/Product";
import type { Cart } from "@grafikr/shopify-typescript/type/json/Cart";
import type {
  CartAdd,
  CartClear,
  CartChange,
} from "@grafikr/shopify-typescript/type/endpoints/Cart";
import type { Recommendations } from "@grafikr/shopify-typescript/type/endpoints/Product";
import type { Suggest } from "@grafikr/shopify-typescript/type/endpoints/Search";
import type { CustomEvents } from "@grafikr/shopify-typescript/global/CustomEvents";

type SiopaOptions = {
  rootUrl: string;
  currencyCode: string;
  locale: string;
  countryCode: string;
};

export type ErrorResponse = {
  status: number;
  message: string;
  description: string;
};

export type RequestFailedEvent = ErrorResponse & {
  source: Exclude<keyof ShopifyEventMap, "request:failed">;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ErrorResponse };

export type ShopifyEventMap = {
  "product:fetched": Product;
  "product:recommendations:fetched": Recommendations;
  "cart:fetched": Cart;
  "cart:added": CartAdd;
  "cart:updated": CartChange;
  "cart:removed": CartChange;
  "cart:cleared": CartClear;
  "search:suggested": Suggest;
  "request:failed": RequestFailedEvent;
  "request:loading": boolean;
};

export type AddPayload =
  | {
      items: {
        quantity: number;
        id: number;
        selling_plan?: number;
        properties?: Record<string, string>;
      }[];
    }
  | FormData;

export type LineItemPayload = {
  id: string;
  quantity: number;
  selling_plan?: number;
  properties?: Record<string, string>;
};

export type PredictiveSearchResourceType = "product" | "page" | "article" | "collection" | "query";

export type PredictiveSearchField =
  | "author"
  | "body"
  | "product_type"
  | "tag"
  | "title"
  | "variants.barcode"
  | "variants.sku"
  | "variants.title"
  | "vendor";

export type PredictiveSearchPayload = {
  q: string;
  resources?: {
    type?: PredictiveSearchResourceType[];
    limit?: number;
    limit_scope?: "all" | "each";
    options?: {
      unavailable_products?: "show" | "hide" | "last";
      fields?: PredictiveSearchField[];
    };
  };
};

export class Siopa {
  private _listeners = new Map<keyof ShopifyEventMap, Set<(data: any) => void>>();
  private _emitCounts = new Map<keyof ShopifyEventMap, number>();
  private static MAX_EMIT_DEPTH = 10;

  private cartUrl: string;
  private addUrl: string;
  private clearUrl: string;
  private changeUrl: string;
  private updateUrl: string;
  private rootUrl: string;
  private currencyCode: string;
  private locale: string;
  private countryCode: string;
  private _formatter: Intl.NumberFormat | null = null;

  /*
    |--------------------------------------------------
    | Properties
    |--------------------------------------------------
    */

  constructor(options: SiopaOptions) {
    this.rootUrl = (options.rootUrl || "/").replace(/\/+$/, "");
    this.cartUrl = `${this.rootUrl}/cart.js`;
    this.addUrl = `${this.rootUrl}/cart/add.js`;
    this.clearUrl = `${this.rootUrl}/cart/clear.js`;
    this.changeUrl = `${this.rootUrl}/cart/change.js`;
    this.updateUrl = `${this.rootUrl}/cart/update.js`;
    this.currencyCode = options.currencyCode;
    this.locale = options.locale;
    this.countryCode = options.countryCode;
  }

  /*
    |--------------------------------------------------
    | on
    |--------------------------------------------------
    */

  on<K extends keyof ShopifyEventMap>(
    event: K,
    callback: (data: ShopifyEventMap[K]) => void,
  ): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(callback);
    return () => {
      this._listeners.get(event)?.delete(callback);
    };
  }

  /*
    |--------------------------------------------------
    | once
    |--------------------------------------------------
    */

  once<K extends keyof ShopifyEventMap>(
    event: K,
    callback: (data: ShopifyEventMap[K]) => void,
  ): () => void {
    const unsub = this.on(event, (data) => {
      unsub();
      callback(data);
    });
    return unsub;
  }

  /*
    |--------------------------------------------------
    | removeAllListeners
    |--------------------------------------------------
    */

  removeAllListeners(event?: keyof ShopifyEventMap): void {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }

  /*
    |--------------------------------------------------
    | _emit
    |--------------------------------------------------
    */

  private _emit<K extends keyof ShopifyEventMap>(event: K, data: ShopifyEventMap[K]) {
    const count = (this._emitCounts.get(event) ?? 0) + 1;
    this._emitCounts.set(event, count);

    if (count === 1) {
      setTimeout(() => this._emitCounts.delete(event), 0);
    }

    if (count > Siopa.MAX_EMIT_DEPTH) {
      console.warn(
        `[Siopa] Maximum event depth (${Siopa.MAX_EMIT_DEPTH}) reached for "${event}". ` +
          `Possible infinite loop — skipping emission.`,
      );
      return;
    }

    this._listeners.get(event)?.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[Siopa] Listener error on "${event}":`, err);
      }
    });
  }

  /*
    |--------------------------------------------------
    | getProduct
    |--------------------------------------------------
    */

  async getProduct({ handle }: { handle: string }) {
    const result = await this._APIRequest<Product>({
      url: `${this.rootUrl}/products/${handle}.json`,
      options: { method: "GET" },
    });
    if (result.ok) {
      this._emit("product:fetched", result.data);
    } else {
      this._emit("request:failed", { ...result.error, source: "product:fetched" });
    }
    return result;
  }

  /*
    |--------------------------------------------------
    | Add to Cart
    |--------------------------------------------------
    */

  async addToCart({ payload }: { payload: AddPayload }) {
    const result = await this._APIRequest<CartAdd, AddPayload>({
      url: this.addUrl,
      payload,
      options: { method: "POST" },
    });

    if (result.ok) {
      this._emit("cart:added", result.data);
    } else {
      this._emit("request:failed", { ...result.error, source: "cart:added" });
    }

    return result;
  }

  /*
    |--------------------------------------------------
    | getCart
    |--------------------------------------------------
    */

  async getCart() {
    const result = await this._APIRequest<Cart>({
      url: this.cartUrl,
      options: { method: "GET" },
    });
    if (result.ok) {
      this._emit("cart:fetched", result.data);
    } else {
      this._emit("request:failed", { ...result.error, source: "cart:fetched" });
    }
    return result;
  }

  /*
    |--------------------------------------------------
    | Update Line Item
    |--------------------------------------------------
    */

  async updateLineItem(payload: LineItemPayload) {
    const result = await this._APIRequest<CartChange, LineItemPayload>({
      url: this.changeUrl,
      payload,
      options: { method: "POST" },
    });

    if (result.ok) {
      this._emit("cart:updated", result.data);
    } else {
      this._emit("request:failed", { ...result.error, source: "cart:updated" });
    }

    return result;
  }

  /*
    |--------------------------------------------------
    | Remove Line Item
    |--------------------------------------------------
    */

  async removeLineItem(payload: { id: string | number }) {
    const result = await this._APIRequest<CartChange, { id: string | number; quantity: 0 }>({
      url: this.changeUrl,
      payload: { id: payload.id, quantity: 0 },
      options: { method: "POST" },
    });
    if (result.ok) {
      this._emit("cart:removed", result.data);
    } else {
      this._emit("request:failed", { ...result.error, source: "cart:removed" });
    }
    return result;
  }

  /*
    |--------------------------------------------------
    | Remove Line Items
    |--------------------------------------------------
    */

  async removeLineItems(payload: { ids: string[] }) {
    const idsMap = payload.ids.reduce(
      (acc, id) => {
        acc[id] = 0;
        return acc;
      },
      {} as { [key: string]: number },
    );

    const result = await this._APIRequest<CartChange, { updates: { [key: string]: number } }>({
      url: this.updateUrl,
      payload: { updates: idsMap },
      options: { method: "POST" },
    });

    if (result.ok) {
      this._emit("cart:removed", result.data);
    } else {
      this._emit("request:failed", { ...result.error, source: "cart:removed" });
    }

    return result;
  }

  /*
    |--------------------------------------------------
    | Clear Cart
    |--------------------------------------------------
    */

  async clearCart() {
    const result = await this._APIRequest<CartClear>({
      url: this.clearUrl,
      options: { method: "POST" },
    });

    if (result.ok) {
      this._emit("cart:cleared", result.data);
    } else {
      this._emit("request:failed", { ...result.error, source: "cart:cleared" });
    }
    return result;
  }

  /*
    |--------------------------------------------------
    | Get Product Recommendations
    |--------------------------------------------------
    */

  async getProductRecommendations({
    product_id,
    limit = 4,
    intent = "related",
  }: {
    product_id: string;
    limit?: number;
    intent?: "related" | "complementary";
  }) {
    const productRecommendationsUrl = `${this.rootUrl}/recommendations/products.json?product_id=${product_id}&intent=${intent}&limit=${limit}`;

    const result = await this._APIRequest<Recommendations>({
      url: productRecommendationsUrl,
      options: { method: "GET" },
    });

    if (result.ok) {
      this._emit("product:recommendations:fetched", result.data);
    } else {
      this._emit("request:failed", { ...result.error, source: "product:recommendations:fetched" });
    }

    return result;
  }

  /*
    |--------------------------------------------------
    | Search Products
    |--------------------------------------------------
    */

  async searchProducts(payload: PredictiveSearchPayload) {
    const {
      q,
      resources: {
        type = ["query", "product", "collection", "page"],
        limit = 10,
        limit_scope = "all",
        options: { unavailable_products = "last", fields } = {},
      } = {},
    } = payload;

    const params = new URLSearchParams();
    params.set("q", q);
    params.set("resources[type]", type.join(","));
    params.set("resources[limit]", String(limit));
    params.set("resources[limit_scope]", limit_scope);
    params.set("resources[options][unavailable_products]", unavailable_products);

    if (fields?.length) {
      params.set("resources[options][fields]", fields.join(","));
    }

    const searchUrl = `${this.rootUrl}/search/suggest.json?${params.toString()}`;

    const result = await this._APIRequest<Suggest>({
      url: searchUrl,
      options: { method: "GET" },
    });

    if (result.ok) {
      this._emit("search:suggested", result.data);
    } else {
      this._emit("request:failed", { ...result.error, source: "search:suggested" });
    }

    return result;
  }

  /*
    |--------------------------------------------------
    | _APIRequest
    |--------------------------------------------------
    */

  private async _APIRequest<T, TPayload = {}>({
    url,
    payload,
    options,
  }: {
    url: string;
    payload?: TPayload;
    options?: RequestInit;
  }): Promise<ApiResult<T>> {
    let fetched: Response;

    this._emit("request:loading", true);

    const headers = payload
      ? payload instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" }
      : undefined;

    try {
      fetched = await fetch(url, {
        ...options,
        headers,
        body: payload instanceof FormData ? payload : JSON.stringify(payload),
      });
      this._emit("request:loading", false);
    } catch (e) {
      this._emit("request:loading", false);
      return {
        ok: false,
        error: {
          status: 0,
          message: "Network error",
          description: e instanceof Error ? e.message : "Request failed",
        },
      };
    }
    if (!fetched.ok) {
      let errorBody: Record<string, string> = {};
      try {
        errorBody = await fetched.json();
      } catch {
        // response body wasn't JSON — that's fine, fall through to defaults
      }
      return {
        ok: false,
        error: {
          status: fetched.status,
          message: errorBody.message ?? fetched.statusText,
          description:
            errorBody.description ??
            "The request was well-formed but was unable to be followed due to semantic errors.",
        },
      };
    }
    try {
      const data = await fetched.json();
      return { ok: true, data: data as T };
    } catch {
      return {
        ok: false,
        error: {
          status: fetched.status,
          message: "Invalid JSON",
          description: "The response body could not be parsed as JSON.",
        },
      };
    }
  }

  /*
    |--------------------------------------------------
    | Format Price
    |--------------------------------------------------
    */

  formatPrice({ amount }: { amount: number }) {
    const total = amount / 100;

    if (!this._formatter) {
      try {
        this._formatter = new Intl.NumberFormat(`${this.locale}-${this.countryCode}`, {
          style: "currency",
          currency: this.currencyCode,
        });
      } catch {
        return `${this.currencyCode} ${total.toFixed(2)}`;
      }
    }

    return this._formatter.format(total);
  }
}

export type { Cart, Product, CustomEvents };
