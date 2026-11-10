import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export const env = {
  get SUPABASE_URL() {
    return required("SUPABASE_URL");
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get API_URL() {
    return required("API_URL").replace(/\/$/, "");
  },
  get INTERNAL_API_SECRET() {
    return required("INTERNAL_API_SECRET");
  },
  get SESSION_SECRET() {
    return required("SESSION_SECRET");
  },
};
