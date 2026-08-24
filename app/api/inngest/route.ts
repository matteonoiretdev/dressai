import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { generateTryOn } from "@/lib/inngest/functions/generate-try-on";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateTryOn],
});
