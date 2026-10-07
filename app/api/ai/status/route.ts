import { getUser } from "@/lib/auth";
import { modelLabel, provider } from "@/lib/llm";
import { UNSLOTH, gpuState, loadedKind, unslothEnabled } from "@/lib/unsloth";

export async function GET() {
  const user = await getUser();
  if (user.role === "public" || user.role === "student") return Response.json({ provider: provider(), model: modelLabel() });
  let loaded: string | null = null;
  let reachable = false;
  if (unslothEnabled()) {
    try {
      loaded = await loadedKind();
      reachable = true;
    } catch {
      reachable = false;
    }
  }
  return Response.json({ provider: provider(), model: modelLabel(), reachable, loaded, gpu: gpuState(), models: { text: UNSLOTH.text, image: UNSLOTH.image, video: UNSLOTH.video } });
}
