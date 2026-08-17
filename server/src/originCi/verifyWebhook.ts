import { createHash, createPublicKey, verify, type JsonWebKeyInput } from "node:crypto";

export type OriginWebhookHeaders = {
  "webhook-id"?: string;
  "webhook-timestamp"?: string;
  "webhook-signature"?: string;
};

export function webhookDigest(id: string, timestamp: string, body: Buffer): string {
  return createHash("sha256").update(`${id}.${timestamp}.`).update(body).digest("hex");
}

export function verifyOriginWebhook(
  body: Buffer,
  headers: OriginWebhookHeaders,
  keys: JsonWebKeyInput[],
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const id = headers["webhook-id"];
  const timestamp = Number(headers["webhook-timestamp"]);
  const signature = headers["webhook-signature"]
    ?.split(/\s+/)
    .find((value) => value.startsWith("v1ed,"));
  if (!id || !signature || !Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) {
    return false;
  }
  const digest = webhookDigest(id, String(timestamp), body);
  return keys.some((jwk) => {
    try {
      return verify(
        null,
        Buffer.from(digest),
        createPublicKey({ key: jwk, format: "jwk" }),
        Buffer.from(signature.slice(5), "base64"),
      );
    } catch {
      return false;
    }
  });
}

export type OriginWebhookEvent = {
  deliveryId: string;
  appId: string;
  installationId: string;
  event: {
    id: string;
    type: string;
    eventTime: string;
    payload: Record<string, unknown>;
  };
};

export function parseOriginWebhookEvent(body: unknown): OriginWebhookEvent | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const event = record.event;
  if (!event || typeof event !== "object") return null;
  const ev = event as Record<string, unknown>;
  if (typeof record.deliveryId !== "string" || typeof ev.type !== "string") return null;
  return {
    deliveryId: record.deliveryId,
    appId: typeof record.appId === "string" ? record.appId : "",
    installationId: typeof record.installationId === "string" ? record.installationId : "",
    event: {
      id: typeof ev.id === "string" ? ev.id : "",
      type: ev.type,
      eventTime: typeof ev.eventTime === "string" ? ev.eventTime : "",
      payload: ev.payload && typeof ev.payload === "object" ? (ev.payload as Record<string, unknown>) : {},
    },
  };
}

export function routeOriginWebhook(type: string): "pr-checks" | "preview" | "preview-cleanup" | "deploy" | "ignore" {
  switch (type) {
    case "pull_request.created":
    case "pull_request.head_ref.pushed":
    case "pull_request.published":
    case "pull_request.reopened":
      return "pr-checks";
    case "pull_request.closed":
      return "preview-cleanup";
    case "pull_request.merged":
    case "repository.pushed":
      return "deploy";
    default:
      return "ignore";
  }
}

/** Preview publish rides with PR check events; callers should run both. */
export function shouldPublishPreview(type: string): boolean {
  return routeOriginWebhook(type) === "pr-checks";
}
