import { supabaseAdmin } from "./integrations/supabase/client.server";
import { classifierDocument } from "./lib/classification-documentaire.server";
import { extraireDocument } from "./lib/extraction-documentaire.server";
const id = "b66af20b-83bc-4b8d-9d0c-7edeeaf5fac3";
console.log("classif", JSON.stringify(await classifierDocument(supabaseAdmin, id)).slice(0,500));
console.log("extract", JSON.stringify(await extraireDocument(supabaseAdmin, id)).slice(0,800));
