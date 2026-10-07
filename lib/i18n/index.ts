import { th, type Dict } from "./th";
import { lo } from "./lo";
import { en } from "./en";
import type { Locale } from "./config";

export type { Dict };
export const DICTS: Record<Locale, Dict> = { th, lo, en };
