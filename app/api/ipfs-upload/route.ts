import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PINATA_ENDPOINT = "https://api.pinata.cloud/pinning/pinFileToIPFS";

const ALLOWED_MIMES = new Set<string>([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_BYTES = 10 * 1024 * 1024;

type UploadResponse = {
  cid: string;
  size: number;
  mimeType: string;
  name: string;
};

type PinataPinFileResponse = {
  IpfsHash?: string;
  PinSize?: number;
  Timestamp?: string;
};

function errorJson(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return errorJson(
      500,
      "Server misconfigured: PINATA_JWT is not set. See .env.example.",
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorJson(400, "Invalid multipart form data");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorJson(400, 'Missing "file" field in form data');
  }

  if (file.size === 0) {
    return errorJson(400, "Empty file");
  }
  if (file.size > MAX_BYTES) {
    return errorJson(
      413,
      `File too large (max ${Math.floor(MAX_BYTES / 1024 / 1024)} MB)`,
    );
  }

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIMES.has(mime)) {
    return errorJson(415, `Unsupported file type: ${mime}`);
  }

  // Forward to Pinata. We rebuild a fresh FormData instead of forwarding
  // the original one so we control exactly which fields are sent.
  const forward = new FormData();
  forward.append("file", file, file.name);
  forward.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  forward.append(
    "pinataMetadata",
    JSON.stringify({
      name: file.name,
      keyvalues: { mimeType: mime },
    }),
  );

  let pinataRes: Response;
  try {
    pinataRes = await fetch(PINATA_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: forward,
    });
  } catch (err) {
    return errorJson(
      502,
      `Failed to reach Pinata: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!pinataRes.ok) {
    let msg = `Pinata responded ${pinataRes.status}`;
    try {
      const body = await pinataRes.text();
      if (body) msg = `${msg}: ${body.slice(0, 200)}`;
    } catch {}
    return errorJson(502, msg);
  }

  let json: PinataPinFileResponse;
  try {
    json = (await pinataRes.json()) as PinataPinFileResponse;
  } catch {
    return errorJson(502, "Pinata returned invalid JSON");
  }

  if (!json.IpfsHash) {
    return errorJson(502, "Pinata response missing IpfsHash");
  }

  const out: UploadResponse = {
    cid: json.IpfsHash,
    size: json.PinSize ?? file.size,
    mimeType: mime,
    name: file.name,
  };
  return NextResponse.json(out, { status: 200 });
}
