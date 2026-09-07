import { getSupabase } from "../supabase.js";
import { toBase44Error } from "../utils/errors.js";
import { newEntityId } from "../query.js";

const BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "uploads";

async function uploadToStorage(file, { privateFile = false } = {}) {
  const supabase = getSupabase();
  const safeName = String(file.name || "file").replace(/[^\w.\-]+/g, "_");
  const path = `${new Date().toISOString().slice(0, 10)}/${newEntityId()}_${safeName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw toBase44Error(error, 400);

  if (privateFile) {
    const { data, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (signedError) throw toBase44Error(signedError, 400);
    return { file_url: data.signedUrl, path };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { file_url: data.publicUrl, path };
}

export function createIntegrationsModule() {
  return {
    Core: {
      async UploadFile({ file }) {
        return uploadToStorage(file, { privateFile: false });
      },

      async UploadPrivateFile({ file }) {
        return uploadToStorage(file, { privateFile: true });
      },

      async CreateFileSignedUrl({ path, expiresIn = 3600 }) {
        const supabase = getSupabase();
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, expiresIn);
        if (error) throw toBase44Error(error, 400);
        return { signed_url: data.signedUrl };
      },

      async ExtractDataFromUploadedFile({ file_url, json_schema }) {
        // Placeholder until an Edge Function / AI provider is wired.
        console.warn(
          "[compat] ExtractDataFromUploadedFile is not fully implemented yet",
          { file_url, json_schema }
        );
        return { status: "error", details: "Not implemented", output: null };
      },

      async InvokeLLM({ prompt, ...rest }) {
        const supabase = getSupabase();
        const { data, error } = await supabase.functions.invoke("invoke-llm", {
          body: { prompt, ...rest },
        });
        if (error) {
          console.warn("[compat] InvokeLLM edge function missing/failed", error);
          return { response: null, error: error.message };
        }
        return data;
      },

      async GenerateImage() {
        throw toBase44Error(
          { message: "GenerateImage not implemented", status: 501, code: "NOT_IMPLEMENTED" },
          501
        );
      },

      async SendEmail(params) {
        const supabase = getSupabase();
        const { data, error } = await supabase.functions.invoke("send-email", { body: params });
        if (error) throw toBase44Error(error, 400);
        return data;
      },
    },
  };
}
