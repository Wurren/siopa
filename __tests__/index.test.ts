import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Siopa } from "../src/index";
import {
  GET_PRODUCT_RESPONSE,
  CART_ADD_RESPONSE,
  GET_CART_RESPONSE,
  GET_PRODUCT_RECOMMENDATIONS_RESPONSE,
  SEARCH_PRODUCTS_RESPONSE,
  GET_COLLECTION_RESPONSE,
  GET_COLLECTION_PRODUCTS_RESPONSE,
  GET_COLLECTION_PRODUCTS_WITH_QUERY_PARAMS_RESPONSE,
  GET_SECTIONS_RESPONSE,
} from "./data";

const CART_CHANGE_RESPONSE = { items: GET_CART_RESPONSE.items };
const CART_CLEAR_RESPONSE = { items: [] };

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
      mockFetchSuccess(GET_PRODUCT_RESPONSE);
      const listener = vi.fn();
      client.on("product:fetched", listener);

      await client.getProduct({ handle: "red-rain-coat" });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(GET_PRODUCT_RESPONSE);
    });

    it("returns an unsubscribe function that removes the listener", async () => {
      mockFetchSuccess(GET_PRODUCT_RESPONSE);
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

      mockFetchSuccess(GET_PRODUCT_RESPONSE);
      await client.getProduct({ handle: "red-rain-coat" });
      await client.getProduct({ handle: "blue-rain-coat" });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(GET_PRODUCT_RESPONSE);
    });

    it("returns an unsubscribe function that prevents the callback from firing", async () => {
      const listener = vi.fn();
      const unsub = client.once("product:fetched", listener);

      unsub();

      mockFetchSuccess(GET_PRODUCT_RESPONSE);
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

      mockFetchSuccess(GET_PRODUCT_RESPONSE);
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

      mockFetchSuccess(GET_PRODUCT_RESPONSE);
      await client.getProduct({ handle: "red-rain-coat" });

      mockFetchSuccess(GET_CART_RESPONSE);
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

      mockFetchSuccess(GET_PRODUCT_RESPONSE);
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
          new Response(JSON.stringify(GET_CART_RESPONSE), {
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
      mockFetchSuccess(GET_PRODUCT_RESPONSE);

      const result = await client.getProduct({ handle: "red-rain-coat" });

      expect(result).toEqual({ ok: true, data: GET_PRODUCT_RESPONSE });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/products/red-rain-coat.json",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("emits product:fetched on success", async () => {
      mockFetchSuccess(GET_PRODUCT_RESPONSE);
      const listener = vi.fn();
      client.on("product:fetched", listener);

      await client.getProduct({ handle: "red-rain-coat" });

      expect(listener).toHaveBeenCalledWith(GET_PRODUCT_RESPONSE);
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

  // ---------- getCollection ----------

  describe("getCollection", () => {
    it("fetches a collection by handle and returns data", async () => {
      mockFetchSuccess(GET_COLLECTION_RESPONSE);

      const result = await client.getCollection({ handle: "jackets" });

      expect(result).toEqual({ ok: true, data: GET_COLLECTION_RESPONSE });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/collections/jackets.json",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("emits collection:fetched on success", async () => {
      mockFetchSuccess(GET_COLLECTION_RESPONSE);
      const listener = vi.fn();
      client.on("collection:fetched", listener);

      await client.getCollection({ handle: "jackets" });

      expect(listener).toHaveBeenCalledWith(GET_COLLECTION_RESPONSE);
    });

    it("returns an error result on HTTP error", async () => {
      mockFetchError(404, { message: "Not found", description: "Collection not found" });

      const result = await client.getCollection({ handle: "nope" });

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

      await client.getCollection({ handle: "nope" });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toMatchObject({
        status: 404,
        source: "collection:fetched",
      });
    });
  });

  // ---------- getCollectionProducts ----------

  describe("getCollectionProducts", () => {
    it("fetches collection products by handle and returns data", async () => {
      mockFetchSuccess(GET_COLLECTION_PRODUCTS_RESPONSE);

      const result = await client.getCollectionProducts({ handle: "jackets" });

      expect(result).toEqual({ ok: true, data: GET_COLLECTION_PRODUCTS_RESPONSE });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/collections/jackets/products.json",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("includes query params when provided", async () => {
      mockFetchSuccess(GET_COLLECTION_PRODUCTS_WITH_QUERY_PARAMS_RESPONSE);

      await client.getCollectionProducts({
        handle: "jackets",
        params: { limit: 1, page: 1, sort_by: "created-descending" },
      });

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.pathname).toBe("/collections/jackets/products.json");
      expect(url.searchParams.get("limit")).toBe("1");
      expect(url.searchParams.get("page")).toBe("1");
      expect(url.searchParams.get("sort_by")).toBe("created-descending");
    });

    it("omits query string when no params are provided", async () => {
      mockFetchSuccess(GET_COLLECTION_PRODUCTS_RESPONSE);

      await client.getCollectionProducts({ handle: "jackets" });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/collections/jackets/products.json",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("preserves limit and page when set to 0", async () => {
      mockFetchSuccess(GET_COLLECTION_PRODUCTS_RESPONSE);

      await client.getCollectionProducts({
        handle: "jackets",
        params: { limit: 0, page: 0 },
      });

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.searchParams.get("limit")).toBe("0");
      expect(url.searchParams.get("page")).toBe("0");
    });

    it("emits collection:products:fetched on success", async () => {
      mockFetchSuccess(GET_COLLECTION_PRODUCTS_RESPONSE);
      const listener = vi.fn();
      client.on("collection:products:fetched", listener);

      await client.getCollectionProducts({ handle: "jackets" });

      expect(listener).toHaveBeenCalledWith(GET_COLLECTION_PRODUCTS_RESPONSE);
    });

    it("returns an error result on HTTP error", async () => {
      mockFetchError(404, { message: "Not found", description: "Collection not found" });

      const result = await client.getCollectionProducts({ handle: "nope" });

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

      await client.getCollectionProducts({ handle: "nope" });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toMatchObject({
        status: 404,
        source: "collection:products:fetched",
      });
    });

    it("throws when handle is empty", async () => {
      await expect(
        client.getCollectionProducts({ handle: "" }),
      ).rejects.toThrow("Handle is required");
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
      mockFetchSuccess(GET_CART_RESPONSE);

      const result = await client.getCart();

      expect(result).toEqual({ ok: true, data: GET_CART_RESPONSE });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/cart.js",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("emits cart:fetched on success", async () => {
      mockFetchSuccess(GET_CART_RESPONSE);
      const listener = vi.fn();
      client.on("cart:fetched", listener);

      await client.getCart();

      expect(listener).toHaveBeenCalledWith(GET_CART_RESPONSE);
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

    it("emits cart:updated on success", async () => {
      mockFetchSuccess(CART_CHANGE_RESPONSE);
      const listener = vi.fn();
      client.on("cart:updated", listener);

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
        source: "cart:updated",
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
      mockFetchSuccess(GET_PRODUCT_RECOMMENDATIONS_RESPONSE);

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
      mockFetchSuccess(GET_PRODUCT_RECOMMENDATIONS_RESPONSE);

      await client.getProductRecommendations({ product_id: "123" });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/recommendations/products.json?product_id=123&intent=related&limit=4",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("emits product:recommendations:fetched on success", async () => {
      mockFetchSuccess(GET_PRODUCT_RECOMMENDATIONS_RESPONSE);
      const listener = vi.fn();
      client.on("product:recommendations:fetched", listener);

      await client.getProductRecommendations({ product_id: "123" });

      expect(listener).toHaveBeenCalledWith(GET_PRODUCT_RECOMMENDATIONS_RESPONSE);
    });
  });

  // ---------- searchProducts ----------

  describe("searchProducts", () => {
    it("builds URL with default resource params", async () => {
      mockFetchSuccess(SEARCH_PRODUCTS_RESPONSE);

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
      mockFetchSuccess(SEARCH_PRODUCTS_RESPONSE);

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
      mockFetchSuccess(SEARCH_PRODUCTS_RESPONSE);
      const listener = vi.fn();
      client.on("search:suggested", listener);

      await client.searchProducts({ q: "test" });

      expect(listener).toHaveBeenCalledWith(SEARCH_PRODUCTS_RESPONSE);
    });
  });

  // ---------- getSections ----------

  describe("getSections", () => {
    const sectionId = "template--26931341263194__block_slider_VMJwXd";

    it("fetches sections with correct URL and returns data", async () => {
      mockFetchSuccess(GET_SECTIONS_RESPONSE);

      const result = await client.getSections({ ids: [sectionId] });

      expect(result).toEqual({ ok: true, data: GET_SECTIONS_RESPONSE });

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.pathname).toBe("/");
      expect(url.searchParams.get("sections")).toBe(sectionId);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("joins multiple section IDs with commas", async () => {
      mockFetchSuccess(GET_SECTIONS_RESPONSE);

      await client.getSections({ ids: ["header", "footer"] });

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.searchParams.get("sections")).toBe("header,footer");
    });

    it("renders sections in the context of a specific page path", async () => {
      mockFetchSuccess(GET_SECTIONS_RESPONSE);

      await client.getSections({ ids: [sectionId], path: "/collections/featured" });

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.pathname).toBe("/collections/featured");
      expect(url.searchParams.get("sections")).toBe(sectionId);
    });

    it("defaults path to root when not provided", async () => {
      mockFetchSuccess(GET_SECTIONS_RESPONSE);

      await client.getSections({ ids: [sectionId] });

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.pathname).toBe("/");
    });

    it("emits section:fetched on success", async () => {
      mockFetchSuccess(GET_SECTIONS_RESPONSE);
      const listener = vi.fn();
      client.on("section:fetched", listener);

      await client.getSections({ ids: [sectionId] });

      expect(listener).toHaveBeenCalledWith(GET_SECTIONS_RESPONSE);
    });

    it("returns an error result on HTTP error", async () => {
      mockFetchError(404, { message: "Not found", description: "Section not found" });

      const result = await client.getSections({ ids: ["nonexistent"] });

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

      await client.getSections({ ids: ["nonexistent"] });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toMatchObject({
        status: 404,
        source: "section:fetched",
      });
    });

    it("throws when ids array is empty", async () => {
      await expect(
        client.getSections({ ids: [] }),
      ).rejects.toThrow("At least one section ID is required");
    });

    it("throws when more than 5 section IDs are provided", async () => {
      await expect(
        client.getSections({ ids: ["a", "b", "c", "d", "e", "f"] }),
      ).rejects.toThrow("A maximum of 5 sections can be requested at once");
    });

    it("works with a relative rootUrl", async () => {
      const c = new Siopa({ ...DEFAULT_OPTIONS, rootUrl: "" });
      mockFetchSuccess(GET_SECTIONS_RESPONSE);

      await c.getSections({ ids: [sectionId] });

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(calledUrl).toBe(`/?sections=${encodeURIComponent(sectionId)}`);
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

  // ---------- onThemeEvent ----------

  describe("onThemeEvent", () => {
    let docMock: EventTarget;

    beforeEach(() => {
      docMock = new EventTarget();
      vi.stubGlobal("document", docMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("receives detail from a dispatched CustomEvent", () => {
      const listener = vi.fn();
      client.onThemeEvent("shopify:section:load", listener);

      docMock.dispatchEvent(
        new CustomEvent("shopify:section:load", { detail: { sectionId: "hero" } }),
      );

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({ sectionId: "hero" });
    });

    it("works with events that have undefined detail", () => {
      const listener = vi.fn();
      client.onThemeEvent("shopify:inspector:activate", listener);

      docMock.dispatchEvent(new CustomEvent("shopify:inspector:activate"));

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(null);
    });

    it("returns an unsubscribe function that removes the listener", () => {
      const listener = vi.fn();
      const unsub = client.onThemeEvent("shopify:section:load", listener);

      unsub();

      docMock.dispatchEvent(
        new CustomEvent("shopify:section:load", { detail: { sectionId: "hero" } }),
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it("supports multiple listeners for the same event", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      client.onThemeEvent("shopify:section:select", listener1);
      client.onThemeEvent("shopify:section:select", listener2);

      const detail = { sectionId: "hero", load: true };
      docMock.dispatchEvent(new CustomEvent("shopify:section:select", { detail }));

      expect(listener1).toHaveBeenCalledWith(detail);
      expect(listener2).toHaveBeenCalledWith(detail);
    });

    it("unsubscribing one listener does not affect others", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const unsub1 = client.onThemeEvent("shopify:block:select", listener1);
      client.onThemeEvent("shopify:block:select", listener2);

      unsub1();

      const detail = { blockId: "btn", sectionId: "hero", load: false };
      docMock.dispatchEvent(new CustomEvent("shopify:block:select", { detail }));

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith(detail);
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
      mockFetchSuccess(GET_CART_RESPONSE);

      await c.getCart();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://shop.example.com/cart.js",
        expect.anything(),
      );
    });

    it("defaults to / when rootUrl is empty", async () => {
      const c = new Siopa({ ...DEFAULT_OPTIONS, rootUrl: "" });
      mockFetchSuccess(GET_CART_RESPONSE);

      await c.getCart();

      expect(globalThis.fetch).toHaveBeenCalledWith("/cart.js", expect.anything());
    });
  });
});
