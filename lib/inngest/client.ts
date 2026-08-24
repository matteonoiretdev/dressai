import { Inngest } from "inngest";

export interface TryOnGenerateEventData {
  sessionId: string;
}

export const inngest = new Inngest({ id: "dressai" });
