import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  parseOriginWebhookEvent,
  routeOriginWebhook,
  shouldPublishPreview,
  verifyOriginWebhook,
  webhookDigest,
} from "./verifyWebhook";

function signDelivery(id: string, timestamp: string, body: Buffer) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const digest = webhookDigest(id, timestamp, body);
  const signature = sign(null, Buffer.from(digest), privateKey);
  const jwk = publicKey.export({ format: "jwk" });
  return {
    jwk,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1ed,${signature.toString("base64")}`,
    },
  };
}

describe("verifyOriginWebhook", () => {
  test("accepts a valid Ed25519 delivery", () => {
    const body = Buffer.from('{"deliveryId":"whd_1"}');
    const now = 1_700_000_000;
    const signed = signDelivery("whd_1", String(now), body);
    expect(verifyOriginWebhook(body, signed.headers, [signed.jwk], now)).toBe(true);
  });

  test("rejects a stale timestamp", () => {
    const body = Buffer.from("{}");
    const signed = signDelivery("whd_1", "100", body);
    expect(verifyOriginWebhook(body, signed.headers, [signed.jwk], 1_700_000_000)).toBe(false);
  });

  test("rejects a tampered body", () => {
    const body = Buffer.from("good");
    const now = 1_700_000_000;
    const signed = signDelivery("whd_1", String(now), body);
    expect(verifyOriginWebhook(Buffer.from("evil"), signed.headers, [signed.jwk], now)).toBe(false);
  });
});

describe("routeOriginWebhook", () => {
  test("maps PR lifecycle to checks + preview, close to cleanup, merge/push to deploy", () => {
    expect(routeOriginWebhook("pull_request.created")).toBe("pr-checks");
    expect(routeOriginWebhook("pull_request.head_ref.pushed")).toBe("pr-checks");
    expect(shouldPublishPreview("pull_request.created")).toBe(true);
    expect(routeOriginWebhook("pull_request.closed")).toBe("preview-cleanup");
    expect(routeOriginWebhook("pull_request.merged")).toBe("deploy");
    expect(routeOriginWebhook("repository.pushed")).toBe("deploy");
    expect(routeOriginWebhook("pull_request.comment.created")).toBe("ignore");
  });
});

describe("parseOriginWebhookEvent", () => {
  test("reads the delivery envelope", () => {
    const parsed = parseOriginWebhookEvent({
      deliveryId: "whd_1",
      appId: "app_1",
      installationId: "i_1",
      event: { id: "evt_1", type: "pull_request.created", eventTime: "2026-08-17T00:00:00Z", payload: { n: 1 } },
    });
    expect(parsed?.event.type).toBe("pull_request.created");
    expect(parseOriginWebhookEvent({})).toBeNull();
  });
});
