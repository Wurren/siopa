import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Siopa } from "../src/index";
import { PRODUCT_RESPONSE, CART_ADD_RESPONSE, CART_RESPONSE } from "./data";

const CART_CHANGE_RESPONSE = { items: CART_RESPONSE.items };
const CART_CLEAR_RESPONSE = { items: [] };
const RECOMMENDATIONS_RESPONSE = { products: [PRODUCT_RESPONSE] };
const SEARCH_SUGGEST_RESPONSE = {
  resources: {
    results: {
      products: [{ id: 1, title: "Test product" }],
      queries: [],
      collections: [],
      pages: [],
    },
  },
};

const DEFAULT_OPTIONS = {
  rootUrl: "https://shop.example.com",
  currencyCode: "USD",
  locale: "en",
  countryCode: "US",
};

function mockFetchSuccess(data: unknown): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockFetchError(status: number, body?: Record<string, string>): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body ? JSON.stringify(body) : null, {
      status,
      statusText: "Not Found",
    }),
  );
}

describe("Siopa", () => {
  let client: Siopa;

  beforeEach(() => {
    client = new Siopa(DEFAULT_OPTIONS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------- Event system ----------

  describe("on / unsubscribe", () => {
    it("registers a listener that receives data on successful API calls", async () => {
      mockFetchSuccess(PRODUCT_RESPONSE);
      const listener = vi.fn();
      client.on("product:fetched", listener);

      await client.getProduct({ handle: "red-rain-coat" });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(PRODUCT_RESPONSE);
    });

    it("returns an unsubscribe function that removes the listener", async () => {
      mockFetchSuccess(PRODUCT_RESPONSE);
      const listener = vi.fn();
      const unsub = client.on("product:fetched", listener);

      unsub();
      await client.getProduct({ handle: "red-rain-coat" });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ---------- once ----------

  describe("once", () => {
    it("fires the callback only once then auto-unsubscribes", async () => {
      const listener = vi.fn();
      client.once("product:fetched", listener);

      mockFetchSuccess(PRODUCT_RESPONSE);
      await client.getProduct({ handle: "red-rain-coat" });
      await client.getProduct({ handle: "blue-rain-coat" });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(PRODUCT_RESPONSE);
    });

    it("returns an unsubscribe function that prevents the callback from firing", async () => {
      const listener = vi.fn();
      const unsub = client.once("product:fetched", listener);

      unsub();

      mockFetchSuccess(PRODUCT_RESPONSE);
      await client.getProduct({ handle: "red-rain-coat" });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ---------- removeAllListeners ----------

  describe("removeAllListeners", () => {
    it("removes all listeners for a specific event", async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      client.on("product:fetched", listener1);
      client.on("product:fetched", listener2);

      client.removeAllListeners("product:fetched");

      mockFetchSuccess(PRODUCT_RESPONSE);
      await client.getProduct({ handle: "red-rain-coat" });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it("removes all listeners across all events when called with no args", async () => {
      const productListener = vi.fn();
      const cartListener = vi.fn();
      client.on("product:fetched", productListener);
      client.on("cart:fetched", cartListener);

      client.removeAllListeners();

      mockFetchSuccess(PRODUCT_RESPONSE);
      await client.getProduct({ handle: "red-rain-coat" });

      mockFetchSuccess(CART_RESPONSE);
      await client.getCart();

      expect(productListener).not.toHaveBeenCalled();
      expect(cartListener).not.toHaveBeenCalled();
    });
  });

  // ---------- _emit safety ----------

  describe("emit safety", () => {
    it("isolates listener errors so subsequent listeners still fire", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const badListener = vi.fn(() => {
        throw new Error("boom");
      });
      const goodListener = vi.fn();

      client.on("product:fetched", badListener);
      client.on("product:fetched", goodListener);

      mockFetchSuccess(PRODUCT_RESPONSE);
      await client.getProduct({ handle: "red-rain-coat" });

      expect(badListener).toHaveBeenCalledOnce();
      expect(goodListener).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalledWith(
        '[Siopa] Listener error on "product:fetched":',
        expect.any(Error),
      );

      errorSpy.mockRestore();
    });

    it("prevents infinite event loops by capping emit depth", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      let callCount = 0;

      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(CART_RESPONSE), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      client.on("cart:fetched", () => {
        callCount++;
        client.getCart();
      });

      await client.getCart();
      await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled());

      expect(callCount).toBeLessThanOrEqual(10);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Maximum event depth"));

      warnSpy.mockRestore();
    });
  });

  // ---------- getProduct ----------

  describe("getProduct", () => {
    it("fetches a product by handle and returns data", async () => {
      mockFetchSuccess(PRODUCT_RESPONSE);

      const result = await client.getProduct({ handle: "red-rain-coat" });

      expect(result).toEqual({ ok: true, data: PRODUCT_RESPONSE });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/products/red-rain-coat.json",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("emits product:fetched on success", async () => {
      mockFetchSuccess(PRODUCT_RESPONSE);
      const listener = vi.fn();
      client.on("product:fetched", listener);

      await client.getProduct({ handle: "red-rain-coat" });

      expect(listener).toHaveBeenCalledWith(PRODUCT_RESPONSE);
    });

    it("returns an error result on HTTP error", async () => {
      mockFetchError(404, { message: "Not found", description: "Product not found" });

      const result = await client.getProduct({ handle: "nope" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(404);
        expect(result.error.message).toBe("Not found");
      }
    });

    it("emits request:failed with source on HTTP error", async () => {
      mockFetchError(404);
      const listener = vi.fn();
      client.on("request:failed", listener);

      await client.getProduct({ handle: "nope" });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toMatchObject({
        status: 404,
        source: "product:fetched",
      });
    });

    it("returns a network error when fetch rejects", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Failed to fetch"));

      const result = await client.getProduct({ handle: "red-rain-coat" });

      expect(result).toEqual({
        ok: false,
        error: {
          status: 0,
          message: "Network error",
          description: "Failed to fetch",
        },
      });
    });
  });

  // ---------- addToCart ----------

  describe("addToCart", () => {
    const payload = { items: [{ id: 794864229, quantity: 2 }] };

    it("posts to cart/add.js with correct body and headers", async () => {
      mockFetchSuccess(CART_ADD_RESPONSE);

      const result = await client.addToCart({ payload });

      expect(result).toEqual({ ok: true, data: CART_ADD_RESPONSE });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/cart/add.js",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
    });

    it("emits cart:added on success", async () => {
      mockFetchSuccess(CART_ADD_RESPONSE);
      const listener = vi.fn();
      client.on("cart:added", listener);

      await client.addToCart({ payload });

      expect(listener).toHaveBeenCalledWith(CART_ADD_RESPONSE);
    });

    it("sends FormData directly without Content-Type header", async () => {
      mockFetchSuccess(CART_ADD_RESPONSE);
      const formData = new FormData();
      formData.append("items[][id]", "794864229");
      formData.append("items[][quantity]", "2");

      const result = await client.addToCart({ payload: formData });

      expect(result).toEqual({ ok: true, data: CART_ADD_RESPONSE });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/cart/add.js",
        expect.objectContaining({
          method: "POST",
          body: formData,
        }),
      );

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(callArgs.headers).toBeUndefined();
    });

    it("emits cart:added when FormData payload succeeds", async () => {
      mockFetchSuccess(CART_ADD_RESPONSE);
      const listener = vi.fn();
      client.on("cart:added", listener);

      const formData = new FormData();
      formData.append("items[][id]", "794864229");
      formData.append("items[][quantity]", "1");

      await client.addToCart({ payload: formData });

      expect(listener).toHaveBeenCalledWith(CART_ADD_RESPONSE);
    });

    it("emits request:failed with source on HTTP error", async () => {
      mockFetchError(422, { message: "Invalid", description: "Variant not found" });
      const listener = vi.fn();
      client.on("request:failed", listener);

      await client.addToCart({ payload });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toMatchObject({
        status: 422,
        source: "cart:added",
      });
    });
  });

  // ---------- getCart ----------

  describe("getCart", () => {
    it("fetches cart.js with GET and returns data", async () => {
      mockFetchSuccess(CART_RESPONSE);

      const result = await client.getCart();

      expect(result).toEqual({ ok: true, data: CART_RESPONSE });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/cart.js",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("emits cart:fetched on success", async () => {
      mockFetchSuccess(CART_RESPONSE);
      const listener = vi.fn();
      client.on("cart:fetched", listener);

      await client.getCart();

      expect(listener).toHaveBeenCalledWith(CART_RESPONSE);
    });

    it("returns an error result on HTTP error", async () => {
      mockFetchError(500);

      const result = await client.getCart();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(500);
      }
    });
  });

  // ---------- updateLineItem ----------

  describe("updateLineItem", () => {
    const payload = { id: "39897499729985:key", quantity: 3 };

    it("posts to cart/change.js with correct body", async () => {
      mockFetchSuccess(CART_CHANGE_RESPONSE);

      const result = await client.updateLineItem(payload);

      expect(result).toEqual({ ok: true, data: CART_CHANGE_RESPONSE });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/cart/change.js",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
    });

    it("emits cart:changed on success", async () => {
      mockFetchSuccess(CART_CHANGE_RESPONSE);
      const listener = vi.fn();
      client.on("cart:changed", listener);

      await client.updateLineItem(payload);

      expect(listener).toHaveBeenCalledWith(CART_CHANGE_RESPONSE);
    });

    it("emits request:failed with source on HTTP error", async () => {
      mockFetchError(422);
      const listener = vi.fn();
      client.on("request:failed", listener);

      await client.updateLineItem(payload);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toMatchObject({
        source: "cart:changed",
      });
    });
  });

  // ---------- removeLineItem ----------

  describe("removeLineItem", () => {
    it("posts to cart/change.js with quantity 0", async () => {
      mockFetchSuccess(CART_CHANGE_RESPONSE);

      await client.removeLineItem({ id: "39897499729985:key" });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/cart/change.js",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ id: "39897499729985:key", quantity: 0 }),
        }),
      );
    });

    it("emits cart:removed on success", async () => {
      mockFetchSuccess(CART_CHANGE_RESPONSE);
      const listener = vi.fn();
      client.on("cart:removed", listener);

      await client.removeLineItem({ id: "39897499729985:key" });

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ---------- removeLineItems ----------

  describe("removeLineItems", () => {
    it("posts to cart/update.js with updates map setting all ids to 0", async () => {
      mockFetchSuccess(CART_CHANGE_RESPONSE);

      await client.removeLineItems({
        ids: ["39897499729985:key1", "39888235757633:key2"],
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/cart/update.js",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            updates: { "39897499729985:key1": 0, "39888235757633:key2": 0 },
          }),
        }),
      );
    });

    it("emits cart:removed on success", async () => {
      mockFetchSuccess(CART_CHANGE_RESPONSE);
      const listener = vi.fn();
      client.on("cart:removed", listener);

      await client.removeLineItems({ ids: ["39897499729985:key1"] });

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ---------- clearCart ----------

  describe("clearCart", () => {
    it("posts to cart/clear.js", async () => {
      mockFetchSuccess(CART_CLEAR_RESPONSE);

      const result = await client.clearCart();

      expect(result).toEqual({ ok: true, data: CART_CLEAR_RESPONSE });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/cart/clear.js",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("emits cart:cleared on success", async () => {
      mockFetchSuccess(CART_CLEAR_RESPONSE);
      const listener = vi.fn();
      client.on("cart:cleared", listener);

      await client.clearCart();

      expect(listener).toHaveBeenCalledWith(CART_CLEAR_RESPONSE);
    });
  });

  // ---------- getProductRecommendations ----------

  describe("getProductRecommendations", () => {
    it("builds correct URL with provided params", async () => {
      mockFetchSuccess(RECOMMENDATIONS_RESPONSE);

      await client.getProductRecommendations({
        product_id: "123",
        limit: 6,
        intent: "complementary",
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/recommendations/products.json?product_id=123&intent=complementary&limit=6",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("uses default limit=4 and intent=related", async () => {
      mockFetchSuccess(RECOMMENDATIONS_RESPONSE);

      await client.getProductRecommendations({ product_id: "123" });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/recommendations/products.json?product_id=123&intent=related&limit=4",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("emits product:recommendations:fetched on success", async () => {
      mockFetchSuccess(RECOMMENDATIONS_RESPONSE);
      const listener = vi.fn();
      client.on("product:recommendations:fetched", listener);

      await client.getProductRecommendations({ product_id: "123" });

      expect(listener).toHaveBeenCalledWith(RECOMMENDATIONS_RESPONSE);
    });
  });

  // ---------- searchProducts ----------

  describe("searchProducts", () => {
    it("builds URL with default resource params", async () => {
      mockFetchSuccess(SEARCH_SUGGEST_RESPONSE);

      await client.searchProducts({ q: "rain coat" });

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.pathname).toBe("/search/suggest.json");
      expect(url.searchParams.get("q")).toBe("rain coat");
      expect(url.searchParams.get("resources[type]")).toBe("query,product,collection,page");
      expect(url.searchParams.get("resources[limit]")).toBe("10");
      expect(url.searchParams.get("resources[limit_scope]")).toBe("all");
      expect(url.searchParams.get("resources[options][unavailable_products]")).toBe("last");
      expect(url.searchParams.get("resources[options][fields]")).toBeNull();
    });

    it("includes custom fields param when provided", async () => {
      mockFetchSuccess(SEARCH_SUGGEST_RESPONSE);

      await client.searchProducts({
        q: "potion",
        resources: {
          type: ["product"],
          limit: 5,
          options: { fields: ["title", "vendor"] },
        },
      });

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.searchParams.get("resources[type]")).toBe("product");
      expect(url.searchParams.get("resources[limit]")).toBe("5");
      expect(url.searchParams.get("resources[options][fields]")).toBe("title,vendor");
    });

    it("emits search:suggested on success", async () => {
      mockFetchSuccess(SEARCH_SUGGEST_RESPONSE);
      const listener = vi.fn();
      client.on("search:suggested", listener);

      await client.searchProducts({ q: "test" });

      expect(listener).toHaveBeenCalledWith(SEARCH_SUGGEST_RESPONSE);
    });
  });

  // ---------- formatPrice ----------

  describe("formatPrice", () => {
    it("formats price using Intl.NumberFormat", () => {
      const formatted = client.formatPrice({ amount: 12900 });

      expect(formatted).toBe("$129.00");
    });

    it("caches the formatter across calls", () => {
      client.formatPrice({ amount: 100 });

      const spy = vi.spyOn(Intl, "NumberFormat");
      client.formatPrice({ amount: 200 });

      expect(spy).not.toHaveBeenCalled();
    });

    it("falls back when Intl.NumberFormat throws", () => {
      const badClient = new Siopa({
        rootUrl: "/",
        currencyCode: "INVALID",
        locale: "xx",
        countryCode: "ZZ",
      });

      vi.spyOn(Intl, "NumberFormat").mockImplementation(() => {
        throw new RangeError("Invalid currency");
      });

      const formatted = badClient.formatPrice({ amount: 12900 });

      expect(formatted).toBe("INVALID 129.00");
    });
  });

  // ---------- _APIRequest edge cases ----------

  describe("_APIRequest edge cases", () => {
    it("returns error when response has ok status but invalid JSON body", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("not json", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      );

      const result = await client.getCart();

      expect(result).toEqual({
        ok: false,
        error: {
          status: 200,
          message: "Invalid JSON",
          description: "The response body could not be parsed as JSON.",
        },
      });
    });

    it("uses statusText when error response body is not JSON", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("plain text error", {
          status: 503,
          statusText: "Service Unavailable",
        }),
      );

      const result = await client.getCart();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(503);
        expect(result.error.message).toBe("Service Unavailable");
        expect(result.error.description).toBe(
          "The request was well-formed but was unable to be followed due to semantic errors.",
        );
      }
    });
  });

  // ---------- Constructor / URL building ----------

  describe("constructor", () => {
    it("strips trailing slashes from rootUrl", async () => {
      const c = new Siopa({ ...DEFAULT_OPTIONS, rootUrl: "https://shop.example.com///" });
      mockFetchSuccess(CART_RESPONSE);

      await c.getCart();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/cart.js",
        expect.anything(),
      );
    });

    it("defaults to / when rootUrl is empty", async () => {
      const c = new Siopa({ ...DEFAULT_OPTIONS, rootUrl: "" });
      mockFetchSuccess(CART_RESPONSE);

      await c.getCart();

      expect(globalThis.fetch).toHaveBeenCalledWith("/cart.js", expect.anything());
    });
  });
});
