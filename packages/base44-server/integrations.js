import { newEntityId } from "../base44-compat/query.js";
import { env, supabaseConfig } from "./env.js";

async function toBytes(file) {
  if (!file) throw new Error("UploadFile requires a file");
  if (typeof file.arrayBuffer === "function") {
    return Buffer.from(await file.arrayBuffer());
  }
  if (Buffer.isBuffer(file)) return file;
  throw new Error("Unsupported file payload for UploadFile");
}

async function uploadToStorage(client, file, { privateFile = false } = {}) {
  const { bucket } = supabaseConfig();
  const safeName = String(file?.name || "file").replace(/[^\w.\-]+/g, "_");
  const path = `${new Date().toISOString().slice(0, 10)}/${newEntityId()}_${safeName}`;
  const bytes = await toBytes(file);

  const { error } = await client.storage.from(bucket).upload(path, bytes, {
    upsert: false,
    contentType: file?.type || "application/octet-stream",
  });
  if (error) throw new Error(`UploadFile failed: ${error.message}`);

  if (privateFile) {
    const { data, error: signedError } = await client.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60);
    if (signedError) throw new Error(`UploadFile failed: ${signedError.message}`);
    return { file_url: data.signedUrl, path };
  }

  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return { file_url: data.publicUrl, path };
}

/**
 * Transactional email through Resend. OTP sign-in in apiAuth depends on this, so
 * the error message names the variables that are missing.
 */
async function sendEmail({ to, subject, body, from_name: fromName }) {
  const apiKey = env("RESEND_API_KEY");
  const from = env("EMAIL_FROM");
  if (!apiKey || !from) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM on the server."
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromName ? `${fromName} <${from}>` : from,
      to: Array.isArray(to) ? to : [to],
      subject,
      text: body,
    }),
  });

  if (!response.ok) {
    throw new Error(`SendEmail failed: ${await response.text()}`);
  }
  return { success: true, ...(await response.json()) };
}

export function createIntegrationsModule(client) {
  return {
    Core: {
      UploadFile: ({ file }) => uploadToStorage(client, file, { privateFile: false }),
      UploadPrivateFile: ({ file }) => uploadToStorage(client, file, { privateFile: true }),

      async CreateFileSignedUrl({ path, expiresIn = 3600 }) {
        const { bucket } = supabaseConfig();
        const { data, error } = await client.storage
          .from(bucket)
          .createSignedUrl(path, expiresIn);
        if (error) throw new Error(`CreateFileSignedUrl failed: ${error.message}`);
        return { signed_url: data.signedUrl };
      },

      SendEmail: sendEmail,

      async InvokeLLM() {
        throw new Error("InvokeLLM is not available on this deployment.");
      },

      async GenerateImage() {
        throw new Error("GenerateImage is not available on this deployment.");
      },

      async ExtractDataFromUploadedFile() {
        return { status: "error", details: "Not implemented", output: null };
      },
    },
  };
}
